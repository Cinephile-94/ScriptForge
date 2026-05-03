require('dotenv').config();
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const cors = require('cors');
const { db, stmts } = require('./db');
const { exportToPdf } = require('./export/pdf');
const { exportToDocx } = require('./export/docx');
const { exportToFdx } = require('./export/fdx');
const https = require('https');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const session = require('express-session');

const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'scriptforge-dev-secret-change-in-production';

// Collaborator colors pool
const COLORS = ['#c9a84c', '#7eb8f7', '#f77e7e', '#7ef7a8', '#c97ef7', '#f7c97e', '#7ef7f7', '#f77eb8'];

// ─────────────────────────────────────────────
// Session (required for passport OAuth dance)
app.use(session({
  secret: process.env.SESSION_SECRET || 'scriptforge-session-secret',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(passport.initialize());
app.use(passport.session());

// Passport Google Strategy
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/auth/google/callback',
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails?.[0]?.value?.toLowerCase();
      const displayName = profile.displayName || email?.split('@')[0] || 'User';
      if (!email) return done(new Error('No email from Google'));

      let user = stmts.getUserByEmail.get(email);
      if (!user) {
        // Auto-register via Google
        const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
        if (userCount.cnt >= 5) return done(null, false, { message: 'User limit reached' });
        const id = uuidv4();
        const color = COLORS[Math.floor(Math.random() * COLORS.length)];
        db.prepare('INSERT INTO users (id, email, password_hash, display_name, color) VALUES (?, ?, ?, ?, ?)').run(id, email, '', displayName, color);
        user = stmts.getUserByEmail.get(email);
      }
      done(null, user);
    } catch (e) { done(e); }
  }));
}

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  done(null, user || false);
});

// ─── Google OAuth routes ───────────────────────────────────────────────
// Make sure these routes are at the top level
app.get('/auth/google', (req, res, next) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    return res.redirect('/?error=google_not_configured');
  }
  passport.authenticate('google', { scope: ['profile', 'email'] })(req, res, next);
});

app.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: '/?error=google_auth_failed' }),
  (req, res) => {
    const user = req.user;
    const token = jwt.sign(
      { id: user.id, email: user.email, displayName: user.display_name, color: user.color },
      JWT_SECRET, { expiresIn: '30d' }
    );
    // Pass token to client via redirect with fragment (stays client-side)
    res.redirect(`/?oauth_token=${token}`);
  }
);

// OAuth status check (not needed, kept for debugging)
app.get('/auth/status', (req, res) => {
  res.json({ googleConfigured: !!(process.env.GOOGLE_CLIENT_ID) });
});
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Auth middleware
function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided' });
  }
  try {
    req.user = jwt.verify(authHeader.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// Optional auth (for invite links)
function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try { req.user = jwt.verify(authHeader.slice(7), JWT_SECRET); } catch {}
  }
  next();
}

// ─────────────────────────────────────────────
// Auth Routes
// ─────────────────────────────────────────────
app.post('/api/auth/register', async (req, res) => {
  const { email, password, displayName } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: 'email, password, displayName required' });
  }
  if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

  const existing = stmts.getUserByEmail.get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  // Enforce max 5 users
  const userCount = db.prepare('SELECT COUNT(*) as cnt FROM users').get();
  if (userCount.cnt >= 5) return res.status(403).json({ error: 'Maximum user limit (5) reached. Contact the admin.' });

  const id = uuidv4();
  const hash = await bcrypt.hash(password, 12);
  const color = COLORS[Math.floor(Math.random() * COLORS.length)];

  stmts.createUser.run(id, email.toLowerCase(), hash, displayName, color);
  const token = jwt.sign({ id, email, displayName, color }, JWT_SECRET, { expiresIn: '30d' });
  res.json({ token, user: { id, email, displayName, color } });
});

app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = stmts.getUserByEmail.get(email?.toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, email: user.email, displayName: user.display_name, color: user.color },
    JWT_SECRET,
    { expiresIn: '30d' }
  );
  res.json({ token, user: { id: user.id, email: user.email, displayName: user.display_name, color: user.color } });
});

app.get('/api/auth/me', authMiddleware, (req, res) => {
  res.json({ user: req.user });
});

// ─────────────────────────────────────────────
// Scripts Routes
// ─────────────────────────────────────────────
app.get('/api/scripts', authMiddleware, (req, res) => {
  const scripts = stmts.listUserScripts.all(req.user.id, req.user.id);
  res.json({ scripts });
});

app.post('/api/scripts', authMiddleware, (req, res) => {
  const { title } = req.body;
  const id = uuidv4();
  const defaultContent = JSON.stringify([
    { type: 'transition', text: 'FADE IN:' },
    { type: 'scene-heading', text: 'INT. LOCATION - DAY' },
    { type: 'action', text: '' }
  ]);
  stmts.createScript.run(id, title || 'Untitled Script', req.user.id, defaultContent);
  res.json({ id, title: title || 'Untitled Script' });
});

app.get('/api/scripts/:id', authMiddleware, (req, res) => {
  const script = stmts.getScript.get(req.params.id);
  if (!script) return res.status(404).json({ error: 'Not found' });

  const access = stmts.canAccess.get(req.params.id, req.user.id, req.params.id, req.user.id);
  if (!access) return res.status(403).json({ error: 'Access denied' });

  const collaborators = stmts.getCollaborators.all(req.params.id);
  res.json({ ...script, collaborators });
});

app.put('/api/scripts/:id', authMiddleware, (req, res) => {
  const { title, content, scene_count, word_count } = req.body;
  const access = stmts.canAccess.get(req.params.id, req.user.id, req.params.id, req.user.id);
  if (!access) return res.status(403).json({ error: 'Access denied' });

  stmts.updateScript.run(title, JSON.stringify(content), scene_count || 0, word_count || 0, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/scripts/:id', authMiddleware, (req, res) => {
  const script = stmts.getScript.get(req.params.id);
  if (!script) return res.status(404).json({ error: 'Not found' });
  if (script.owner_id !== req.user.id) return res.status(403).json({ error: 'Only owner can delete' });

  stmts.deleteScript.run(req.params.id);
  res.json({ ok: true });
});

// PDF Export
app.post('/api/scripts/:id/export/pdf', authMiddleware, (req, res) => {
  const access = stmts.canAccess.get(req.params.id, req.user.id, req.params.id, req.user.id);
  if (!access) return res.status(403).json({ error: 'Access denied' });

  const script = stmts.getScript.get(req.params.id);
  if (!script) return res.status(404).json({ error: 'Not found' });

  const content = JSON.parse(script.content);
  const filename = `${script.title.replace(/[^a-z0-9]/gi, '_')}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  exportToPdf(content, script.title, res);
});

// DOCX Export
app.post('/api/scripts/:id/export/docx', authMiddleware, async (req, res) => {
  const access = stmts.canAccess.get(req.params.id, req.user.id, req.params.id, req.user.id);
  if (!access) return res.status(403).json({ error: 'Access denied' });

  const script = stmts.getScript.get(req.params.id);
  if (!script) return res.status(404).json({ error: 'Not found' });

  const content = JSON.parse(script.content);
  const filename = `${script.title.replace(/[^a-z0-9]/gi, '_')}.docx`;

  try {
    const buffer = await exportToDocx(content, script.title);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(buffer);
  } catch (e) {
    console.error('DOCX export error:', e);
    res.status(500).json({ error: 'DOCX export failed' });
  }
});

// FDX Export (Final Draft)
app.post('/api/scripts/:id/export/fdx', authMiddleware, (req, res) => {
  const access = stmts.canAccess.get(req.params.id, req.user.id, req.params.id, req.user.id);
  if (!access) return res.status(403).json({ error: 'Access denied' });

  const script = stmts.getScript.get(req.params.id);
  if (!script) return res.status(404).json({ error: 'Not found' });

  const content = JSON.parse(script.content);
  const filename = `${script.title.replace(/[^a-z0-9]/gi, '_')}.fdx`;
  const xml = exportToFdx(content, script.title);

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(xml);
});

// ───────────────────────────────────────────// AI Assist Route — OpenAI / Claude / Gemini
// ─────────────────────────────────────────────
app.post('/api/ai/assist', authMiddleware, async (req, res) => {
  let { action, selectedText, selectedBlocks, context, scriptTitle, apiKey, provider = 'openai' } = req.body;
  if (!apiKey) return res.status(400).json({ error: 'No API key provided. Add one in Settings.' });

  // Server-side provider auto-detect (bulletproof overriding of frontend caches)
  if (apiKey.startsWith('sk-ant-')) provider = 'claude';
  else if (apiKey.startsWith('AIza')) provider = 'gemini';
  else if (apiKey.startsWith('sk-')) provider = 'openai';

  const isBlockReplacement = selectedBlocks && selectedBlocks.length > 0 && action !== 'chat' && action !== 'outline';
  
  let systemPrompt = `You are a professional Hollywood screenplay editor. The script is titled: "${scriptTitle || 'Untitled'}". Respond ONLY with the requested content, no preamble or markdown formatting.\nCRITICAL INSTRUCTION: You MUST detect the language of the input (e.g., German, English) and ALWAYS rewrite or respond in that exact same language. NEVER translate the text to English unless explicitly asked.`;
  if (context) {
    systemPrompt += `\n\nFor context, here is the full script so far (use this ONLY to inform your rewrites of the targeted selection to ensure plot consistency):\n<full_script_context>\n${context}\n</full_script_context>`;
  }
  if (isBlockReplacement || action === 'format') {
    systemPrompt += `\nCRITICAL: You MUST output ONLY a valid JSON array of screenplay blocks matching this schema: [{"type": "scene-heading"|"action"|"character"|"dialogue"|"parenthetical"|"transition"|"shot", "text": "..."}].`;
  }

  const inputContent = isBlockReplacement ? JSON.stringify(selectedBlocks, null, 2) : selectedText;

  const actionPrompts = {
    correct:  'Fix grammar and clarity for the following content:\n\n' + inputContent,
    detail:   'Add vivid cinematic detail to the following content:\n\n' + inputContent,
    shorter:  'Make the following content more concise:\n\n' + inputContent,
    rewrite:  'Rewrite the following content in a fresher way:\n\n' + inputContent,
    continue: 'Continue naturally 2-3 more blocks based on this context:\n\n' + (context || inputContent),
    tension:  'Rewrite the following content to increase dramatic tension:\n\n' + inputContent,
    dialogue: 'Improve dialogue to sound more natural and punchy:\n\n' + inputContent,
    format:   'Format the following text as a screenplay JSON array only:\n\n' + inputContent,
    outline:  'Write a step outline for the following scenes. For each scene, output EXACTLY this format:\n[Scene Number]. [Short 1-sentence description of what happens]\nFunktion: [Dramaturgical function/purpose of the scene in 1 short sentence]\n\nDo not add any other conversational text or formatting. Just the step outline items separated by newlines.\n\nInput content:\n' + inputContent,
    chat:     inputContent,
  };
  const prompt = actionPrompts[action] || 'Improve this screenplay text:\n\n' + inputContent;

  function httpsPost(hostname, path, extraHeaders, payload) {
    return new Promise((resolve, reject) => {
      const req = https.request({ hostname, path, method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload), ...extraHeaders }
      }, (r) => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>resolve(d)); });
      req.on('error', reject); req.write(payload); req.end();
    });
  }

  try {
    let result = '';
    console.log(`[AI] Request to ${provider}`);
    if (provider === 'openai') {
      const payload = JSON.stringify({ model:'gpt-4o-mini', messages:[{role:'system',content:systemPrompt},{role:'user',content:prompt}], max_tokens:4096, temperature:0.7 });
      const raw = await httpsPost('api.openai.com','/v1/chat/completions',{'Authorization':'Bearer '+apiKey},payload);
      const p = JSON.parse(raw);
      if (p.error) { console.error('[AI] OpenAI error:', p.error); return res.status(400).json({error: p.error.message || 'OpenAI API Error'}); }
      result = p.choices?.[0]?.message?.content || '';
    } else if (provider === 'claude') {
      const payload = JSON.stringify({ model:'claude-3-haiku-20240307', max_tokens:4096, system:systemPrompt, messages:[{role:'user',content:prompt}] });
      const raw = await httpsPost('api.anthropic.com','/v1/messages',{'x-api-key':apiKey,'anthropic-version':'2023-06-01'},payload);
      const p = JSON.parse(raw);
      if (p.type === 'error' || p.error) { console.error('[AI] Claude error:', p.error || p); return res.status(400).json({error: p.error?.message || 'Claude API Error'}); }
      result = p.content?.[0]?.text || '';
    } else if (provider === 'gemini') {
      const payload = JSON.stringify({ contents:[{parts:[{text:systemPrompt+'\n\n'+prompt}]}], generationConfig:{maxOutputTokens:4096,temperature:0.7} });
      const raw = await httpsPost('generativelanguage.googleapis.com','/v1beta/models/gemini-2.5-flash:generateContent?key='+apiKey,{},payload);
      const p = JSON.parse(raw);
      if (p.error) { console.error('[AI] Gemini error:', p.error); return res.status(400).json({error: p.error.message || 'Gemini API Error'}); }
      result = p.candidates?.[0]?.content?.parts?.[0]?.text || '';
    } else {
      return res.status(400).json({error:'Unknown provider: '+provider});
    }
    res.json({ result, action });
  } catch(e) { 
    console.error('[AI] Exception:', e.message);
    res.status(500).json({error:e.message}); 
  }
});

// ─────────────────────────────────────────────
// World Building & Pitch Deck Endpoints
// ─────────────────────────────────────────────
app.post('/api/world/shots', authMiddleware, async (req, res) => {
  const { concept } = req.body;
  if (!concept) return res.status(400).json({ error: 'Concept missing' });

  // In a full production app, this would:
  // 1. Call OpenAI/Gemini to extract key visual themes (e.g. "neon", "cyberpunk", "wide shot", "rain").
  // 2. Query the Shotdeck/Filmgrab API with those exact keywords.
  // 3. Analyze the returned images via Vision API to ensure they match the director's statement.
  
  // Prototype: We simulate the Vision-Analyse by generating highly aesthetic cinematic placeholders
  const themes = concept.toLowerCase().split(' ').filter(w => w.length > 4).slice(0, 4);
  const keywords = themes.length > 0 ? themes : ['cinematic', 'lighting', 'composition', 'film'];

  // Simulate latency of "Vision Analysis"
  await new Promise(resolve => setTimeout(resolve, 1500));

  const shots = keywords.map((kw, i) => ({
    // Using a public high-quality placeholder image service
    url: `https://picsum.photos/seed/${encodeURIComponent(kw + i + Date.now())}/800/450`,
    keyword: `Vision Match: ${kw.charAt(0).toUpperCase() + kw.slice(1)}`
  }));

  res.json({ shots });
});

app.post('/api/world/sync', authMiddleware, async (req, res) => {
  const { scriptText } = req.body;
  if (!scriptText) return res.status(400).json({ error: 'Script text missing' });

  // Use AI to analyze the script and generate WB fields
  const syncPrompt = `Analyze the following screenplay and generate:
1. A 1-sentence Logline.
2. A 3-sentence Synopsis.
3. A short Director's Statement (intention and tone).

Respond ONLY with a JSON object: {"synopsis": "...", "directorsStatement": "...", "logline": "..."}
No other text.

Screenplay:
${scriptText.slice(0, 5000)}
`;

  try {
    let analysis = {};
    const user = db.prepare('SELECT api_key FROM users WHERE id = ?').get(req.user.id);
    const apiKey = user?.api_key;
    if (!apiKey) throw new Error('API Key missing');

    const payload = JSON.stringify({ contents:[{parts:[{text:syncPrompt}]}], generationConfig:{maxOutputTokens:1024,temperature:0.7} });
    const raw = await httpsPost('generativelanguage.googleapis.com','/v1beta/models/gemini-2.5-flash:generateContent?key='+apiKey,{},payload);
    const p = JSON.parse(raw);
    const text = p.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
    
    // Clean JSON from markdown if needed
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    analysis = JSON.parse(jsonStr);

    res.json({ analysis });
  } catch (e) {
    console.error('[Sync] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/ai/sync-beats', authMiddleware, async (req, res) => {
  const { scriptText } = req.body;
  if (!scriptText) return res.status(400).json({ error: 'Script text missing' });

  const syncPrompt = `Analyze the following screenplay and break it down into its constituent scenes.
For each scene, provide:
1. The scene index (0-based, counting every block that is a scene heading).
2. A 1-sentence "Beat" summary.
3. The "Dramaturgical Function" (choose from: Catalyst, Debate, Plot Point 1, Fun & Games, Midpoint, Bad Guys Close In, All Is Lost, Finale, or None).

Respond ONLY with a JSON array of objects: [{"sceneIndex": 0, "beat": "...", "function": "..."}, ...]
Only include blocks that are scene headings.

Screenplay:
${scriptText}
`;

  try {
    const user = db.prepare('SELECT api_key FROM users WHERE id = ?').get(req.user.id);
    const apiKey = user?.api_key;
    if (!apiKey) throw new Error('API Key missing');

    const payload = JSON.stringify({ 
      contents:[{parts:[{text:syncPrompt}]}], 
      generationConfig:{maxOutputTokens:4096,temperature:0.7} 
    });
    const raw = await httpsPost('generativelanguage.googleapis.com','/v1beta/models/gemini-2.5-flash:generateContent?key='+apiKey,{},payload);
    const p = JSON.parse(raw);
    const text = p.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
    
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const beats = JSON.parse(jsonStr);

    res.json({ beats });
  } catch (e) {
    console.error('[SyncBeats] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/world/characters', authMiddleware, async (req, res) => {
  const { scriptText } = req.body;
  if (!scriptText) return res.status(400).json({ error: 'Script text missing' });

  const charPrompt = `Analyze the characters in this screenplay.
Identify the top 3-4 protagonists. For each, provide:
1. Their Name.
2. A short summary of their psychological journey/arc.
3. Their primary Goal.
4. "Arc Points": A sequence of 5-8 points throughout the script where their emotion/intensity is rated 1-10.
   Each point needs: "scene" (location/desc), "score" (1-10), "emotion" (e.g. Hopeful, Desperate).

Respond ONLY with a JSON object: 
{"characters": [{"name": "...", "summary": "...", "goal": "...", "arcPoints": [{"scene": "...", "score": 8, "emotion": "..."}, ...]}]}

Screenplay:
${scriptText.slice(0, 8000)}
`;

  try {
    const user = db.prepare('SELECT api_key FROM users WHERE id = ?').get(req.user.id);
    const apiKey = user?.api_key;
    if (!apiKey) throw new Error('API Key missing');

    const payload = JSON.stringify({ 
      contents:[{parts:[{text:charPrompt}]}], 
      generationConfig:{maxOutputTokens:4096,temperature:0.7} 
    });
    const raw = await httpsPost('generativelanguage.googleapis.com','/v1beta/models/gemini-2.5-flash:generateContent?key='+apiKey,{},payload);
    const p = JSON.parse(raw);
    const text = p.candidates?.[0]?.content?.parts?.[0]?.text || '{"characters":[]}';
    
    const jsonStr = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const result = JSON.parse(jsonStr);

    res.json(result);
  } catch (e) {
    console.error('[CharArc] Error:', e.message);
    res.status(500).json({ error: e.message });
  }
});

// ─────────────────────────────────────────────
// User Settings
// ─────────────────────────────────────────────
app.put('/api/auth/settings', authMiddleware, async (req, res) => {
  const { displayName, apiKey } = req.body;
  const updates = [];
  const values = [];

  if (displayName) { updates.push('display_name = ?'); values.push(displayName); }
  if (typeof apiKey !== 'undefined') { updates.push('api_key = ?'); values.push(apiKey); }

  if (updates.length === 0) return res.json({ ok: true });
  values.push(req.user.id);

  db.prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  res.json({ ok: true });
});

app.get('/api/auth/settings', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT display_name, color, api_key FROM users WHERE id = ?').get(req.user.id);
  res.json({ displayName: user?.display_name, color: user?.color, hasApiKey: !!(user?.api_key) });
});

// Admin: user list (for max-5 enforcement)
app.get('/api/admin/users', authMiddleware, (req, res) => {
  const users = db.prepare('SELECT id, email, display_name, color, created_at FROM users ORDER BY created_at ASC').all();
  res.json({ users, count: users.length });
});

// Invite Links
app.post('/api/scripts/:id/invite', authMiddleware, (req, res) => {
  const script = stmts.getScript.get(req.params.id);
  if (!script || script.owner_id !== req.user.id) return res.status(403).json({ error: 'Only owner can invite' });

  const token = uuidv4().replace(/-/g, '').slice(0, 16);
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7; // 7 days
  stmts.createInvite.run(token, req.params.id, 'edit', req.user.id, expiresAt);
  res.json({ token, link: `/join/${token}` });
});

app.post('/api/join/:token', authMiddleware, (req, res) => {
  const invite = stmts.getInvite.get(req.params.token);
  if (!invite) return res.status(404).json({ error: 'Invalid invite' });
  if (invite.expires_at && invite.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(410).json({ error: 'Invite expired' });
  }

  stmts.addCollaborator.run(invite.script_id, req.user.id, invite.permission);
  stmts.useInvite.run(req.params.token);
  res.json({ scriptId: invite.script_id });
});

// Serve SPA routes
app.get('/editor/:id', (req, res) => res.sendFile(path.join(__dirname, 'public', 'editor.html')));
app.get('/join/:token', (req, res) => res.sendFile(path.join(__dirname, 'public', 'join.html')));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// ─────────────────────────────────────────────
// Y.js WebSocket Collaboration Server
// ─────────────────────────────────────────────
const wss = new WebSocket.Server({ server, path: '/collab' });

// Map: scriptId → Set of { ws, user, clientId }
const rooms = new Map();

// Awareness state: clientId → { user, cursor }
const awareness = new Map();

wss.on('connection', (ws, req) => {
  // Parse scriptId and token from URL: /collab?scriptId=xxx&token=yyy
  const url = new URL(req.url, `http://localhost`);
  const scriptId = url.searchParams.get('scriptId');
  const token = url.searchParams.get('token');

  let user;
  try {
    user = jwt.verify(token, JWT_SECRET);
  } catch {
    ws.close(4001, 'Unauthorized');
    return;
  }

  // Verify access
  const access = stmts.canAccess.get(scriptId, user.id, scriptId, user.id);
  if (!access) {
    ws.close(4003, 'Forbidden');
    return;
  }

  const clientId = uuidv4();
  ws.clientId = clientId;
  ws.scriptId = scriptId;
  ws.user = user;

  if (!rooms.has(scriptId)) rooms.set(scriptId, new Set());
  rooms.get(scriptId).add(ws);

  awareness.set(clientId, { user: { id: user.id, name: user.displayName, color: user.color }, cursor: null });

  // Broadcast presence to room
  broadcastPresence(scriptId);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      switch (msg.type) {
        case 'doc-update':
          // Relay document operations to all other clients
          broadcastToRoom(scriptId, ws, { type: 'doc-update', ops: msg.ops, clientId });
          // Auto-save to DB every 30 ops or on explicit save
          break;

        case 'awareness':
          awareness.set(clientId, { ...awareness.get(clientId), ...msg.state });
          broadcastPresence(scriptId);
          break;

        case 'save':
          // Persist content
          const { title, content, scene_count, word_count } = msg;
          const canSave = stmts.canAccess.get(scriptId, user.id, scriptId, user.id);
          if (canSave) {
            stmts.updateScript.run(title, JSON.stringify(content), scene_count || 0, word_count || 0, scriptId);
          }
          ws.send(JSON.stringify({ type: 'saved', timestamp: Date.now() }));
          break;

        case 'cursor':
          awareness.set(clientId, { ...awareness.get(clientId), cursor: msg.cursor });
          broadcastPresence(scriptId);
          break;
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    rooms.get(scriptId)?.delete(ws);
    if (rooms.get(scriptId)?.size === 0) rooms.delete(scriptId);
    awareness.delete(clientId);
    broadcastPresence(scriptId);
  });

  // Send initial state
  const script = stmts.getScript.get(scriptId);
  ws.send(JSON.stringify({
    type: 'init',
    clientId,
    content: JSON.parse(script.content),
    title: script.title
  }));
});

function broadcastToRoom(scriptId, senderWs, msg) {
  const room = rooms.get(scriptId);
  if (!room) return;
  const data = JSON.stringify(msg);
  room.forEach(client => {
    if (client !== senderWs && client.readyState === WebSocket.OPEN) {
      client.send(data);
    }
  });
}

function broadcastPresence(scriptId) {
  const room = rooms.get(scriptId);
  if (!room) return;
  const clients = [...room].map(ws => awareness.get(ws.clientId)).filter(Boolean);
  const data = JSON.stringify({ type: 'presence', clients });
  room.forEach(ws => {
    if (ws.readyState === WebSocket.OPEN) ws.send(data);
  });
}

// ─────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`🎬 ScriptForge running at http://localhost:${PORT}`);
});
