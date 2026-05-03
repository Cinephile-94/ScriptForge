/* guide.js — Script Writing Guide
   Features:
   - Plot structure templates (3-Act, Save the Cat, Hero's Journey, Dan Harmon, Sequence)
   - Film length selector → dynamic beat timing (in pages)
   - Left sidebar panel showing plot points with progress
   - Beat tracker that highlights current position
   - Step outline generator from script blocks
*/

// ── Plot Structure Templates ──
const PLOT_STRUCTURES = {
  'three-act': {
    name: '3-Act Structure',
    description: 'Classic Hollywood three-act structure. Simple and effective.',
    beats: [
      { id: 'opening-image',  name: 'Opening Image',     pct: 0,    desc: 'A snapshot of the world before the story begins. Sets tone and theme.' },
      { id: 'setup',          name: 'Setup',             pct: 1,    desc: 'Introduce the protagonist, their world, and their internal need.' },
      { id: 'inciting',       name: 'Inciting Incident', pct: 10,   desc: 'An event disrupts the status quo and kicks off the story.' },
      { id: 'act1-break',     name: 'Act 1 Break',       pct: 25,   desc: 'The protagonist commits to the adventure. No turning back.' },
      { id: 'midpoint',       name: 'Midpoint',          pct: 50,   desc: 'A major shift — hero goes from reactive to proactive, or vice versa.' },
      { id: 'crisis',         name: 'All Is Lost',       pct: 75,   desc: 'The lowest point. Everything seems hopeless.' },
      { id: 'climax',         name: 'Climax',            pct: 87,   desc: 'The final confrontation. Hero applies the lesson learned.' },
      { id: 'resolution',     name: 'Resolution',        pct: 95,   desc: 'The new normal. What has changed?' },
      { id: 'closing-image',  name: 'Closing Image',     pct: 100,  desc: 'Mirror of the opening image — show the transformation.' },
    ]
  },

  'save-the-cat': {
    name: 'Save the Cat (Blake Snyder)',
    description: '15-beat structure from Blake Snyder\'s legendary screenwriting bible.',
    beats: [
      { id: 'opening-image',   name: 'Opening Image',      pct: 0,    desc: 'The world as it is. Before the change.' },
      { id: 'theme-stated',    name: 'Theme Stated',       pct: 5,    desc: 'Someone (not the hero) states the theme.' },
      { id: 'setup',           name: 'Setup',              pct: 10,   desc: 'Introduce protagonist and their flawed world.' },
      { id: 'catalyst',        name: 'Catalyst',           pct: 12,   desc: 'Life-changing event that sets the story in motion.' },
      { id: 'debate',          name: 'Debate',             pct: 17,   desc: 'Hero questions whether to accept the challenge.' },
      { id: 'act2-break',      name: 'Break Into Two',     pct: 25,   desc: 'Hero chooses to enter the new world.' },
      { id: 'b-story',         name: 'B Story',            pct: 30,   desc: 'A new character/relationship that carries the theme.' },
      { id: 'fun-and-games',   name: 'Fun & Games',        pct: 37,   desc: 'The premise\'s promise delivered. The "trailer moments".' },
      { id: 'midpoint',        name: 'Midpoint',           pct: 50,   desc: 'A false peak or false low. Stakes are raised.' },
      { id: 'bad-guys',        name: 'Bad Guys Close In',  pct: 55,   desc: 'Opposition gathers strength. Team starts to fracture.' },
      { id: 'all-is-lost',     name: 'All Is Lost',        pct: 75,   desc: 'The worst moment. Something or someone dies (whiff of death).' },
      { id: 'dark-night',      name: 'Dark Night of Soul', pct: 78,   desc: 'Hero hits rock bottom and digs deep.' },
      { id: 'break-into-3',    name: 'Break Into Three',   pct: 82,   desc: 'A-story and B-story merge. Hero finds the solution.' },
      { id: 'finale',          name: 'Finale',             pct: 85,   desc: 'Hero applies the lesson and defeats the antagonist.' },
      { id: 'closing-image',   name: 'Closing Image',      pct: 100,  desc: 'Proof that change has occurred. Mirror of opening.' },
    ]
  },

  'heros-journey': {
    name: 'Hero\'s Journey (Campbell)',
    description: 'Joseph Campbell\'s monomyth — the universal story pattern found across cultures.',
    beats: [
      { id: 'ordinary-world',    name: 'Ordinary World',       pct: 0,   desc: 'The hero\'s normal world before the adventure begins.' },
      { id: 'call',              name: 'Call to Adventure',    pct: 10,  desc: 'The hero is presented with a challenge or quest.' },
      { id: 'refusal',           name: 'Refusal of Call',      pct: 15,  desc: 'The hero hesitates or refuses the call.' },
      { id: 'mentor',            name: 'Meeting the Mentor',   pct: 20,  desc: 'The hero gains support and wisdom from a guide.' },
      { id: 'threshold',         name: 'Crossing the Threshold', pct: 25, desc: 'The hero commits to the adventure and enters the special world.' },
      { id: 'tests',             name: 'Tests, Allies, Enemies', pct: 35, desc: 'The hero faces challenges, makes friends, and meets foes.' },
      { id: 'innermost-cave',    name: 'Approach Inner Cave',  pct: 45,  desc: 'The hero prepares for the supreme ordeal.' },
      { id: 'ordeal',            name: 'The Ordeal',           pct: 55,  desc: 'The hero faces death or their greatest fear.' },
      { id: 'reward',            name: 'Reward (Seizing Sword)', pct: 62, desc: 'The hero claims the reward after surviving the ordeal.' },
      { id: 'road-back',         name: 'The Road Back',        pct: 72,  desc: 'The hero begins the journey back to the ordinary world.' },
      { id: 'resurrection',      name: 'Resurrection',         pct: 85,  desc: 'The hero faces a climactic test and is transformed.' },
      { id: 'return',            name: 'Return with Elixir',   pct: 95,  desc: 'The hero returns with something to benefit the ordinary world.' },
    ]
  },

  'dan-harmon': {
    name: 'Story Circle (Dan Harmon)',
    description: 'Dan Harmon\'s simplified, cyclical 8-step story engine. Works for any scale.',
    beats: [
      { id: 'you',      name: '1. You',          pct: 0,    desc: 'Establish a character in a zone of comfort.' },
      { id: 'need',     name: '2. Need',         pct: 13,   desc: 'They want something.' },
      { id: 'go',       name: '3. Go',           pct: 25,   desc: 'They enter an unfamiliar situation.' },
      { id: 'search',   name: '4. Search',       pct: 38,   desc: 'They adapt to it.' },
      { id: 'find',     name: '5. Find',         pct: 50,   desc: 'They get what they wanted.' },
      { id: 'take',     name: '6. Take',         pct: 63,   desc: 'They pay a heavy price for it.' },
      { id: 'return',   name: '7. Return',       pct: 75,   desc: 'They return to their familiar situation.' },
      { id: 'change',   name: '8. Change',       pct: 88,   desc: 'Having changed. They are fundamentally different.' },
    ]
  },

  'sequence': {
    name: 'Sequence Method (Paul Gulino)',
    description: '8 sequences of 10-15 minutes each. Great for plotting feature films.',
    beats: [
      { id: 'seq-1',  name: 'Sequence 1',  pct: 0,    desc: 'Status quo — establish world & protagonist. Inciting incident at end.' },
      { id: 'seq-2',  name: 'Sequence 2',  pct: 12.5, desc: 'Protagonist reacts to inciting incident. Lock-in at end of Act 1.' },
      { id: 'seq-3',  name: 'Sequence 3',  pct: 25,   desc: 'First half of Act 2 — exploration of new world. Early obstacles.' },
      { id: 'seq-4',  name: 'Sequence 4',  pct: 37.5, desc: 'Complications increase. Leads to Midpoint.' },
      { id: 'seq-5',  name: 'Sequence 5',  pct: 50,   desc: 'After midpoint — protagonist more committed but complications rise.' },
      { id: 'seq-6',  name: 'Sequence 6',  pct: 62.5, desc: 'All-Is-Lost. Darkest moment. Crisis of faith.' },
      { id: 'seq-7',  name: 'Sequence 7',  pct: 75,   desc: 'Act 3 begins — new approach, buildup to climax.' },
      { id: 'seq-8',  name: 'Sequence 8',  pct: 87.5, desc: 'Climax and resolution. Closing image.' },
    ]
  }
};

// Film lengths (in script pages, which approximate screen minutes 1:1)
const FILM_LENGTHS = {
  'short-15':     { name: 'Short Film (15 min)', pages: 15 },
  'short-30':     { name: 'Short Film (30 min)', pages: 30 },
  'tv-episode':   { name: 'TV Episode (44 min)',  pages: 44 },
  'feature-90':   { name: 'Feature Film (90 min)', pages: 90 },
  'feature-105':  { name: 'Feature Film (105 min)', pages: 105 },
  'feature-120':  { name: 'Feature Film (120 min)', pages: 120 },
  'epic-180':     { name: 'Epic Film (180 min)',  pages: 180 },
};

// ── State ──
let currentStructure = 'save-the-cat';
let currentLength = 'feature-105';
let guideOpen = false;

// ── Init ──
function initGuide() {
  injectGuidePanel();
  injectGuidePanelToggle();
  renderGuide();
}

// ── Inject Panels ──
function injectGuidePanel() {
  const panel = document.createElement('aside');
  panel.id = 'guide-panel';
  panel.className = 'guide-panel hidden';
  panel.innerHTML = `
    <div class="guide-panel-header">
      <span>🎯 Story Guide</span>
      <button class="btn-ghost icon-btn" onclick="toggleGuide()">✕</button>
    </div>

    <div class="guide-controls">
      <div class="field-group">
        <label>Plot Structure</label>
        <select id="guide-structure-select" onchange="onStructureChange(this.value)" class="guide-select">
          ${Object.entries(PLOT_STRUCTURES).map(([k, v]) =>
            `<option value="${k}" ${k === currentStructure ? 'selected' : ''}>${v.name}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field-group">
        <label>Film Length</label>
        <select id="guide-length-select" onchange="onLengthChange(this.value)" class="guide-select">
          ${Object.entries(FILM_LENGTHS).map(([k, v]) =>
            `<option value="${k}" ${k === currentLength ? 'selected' : ''}>${v.name}</option>`
          ).join('')}
        </select>
      </div>
      <p class="guide-structure-desc" id="guide-structure-desc"></p>
    </div>

    <div class="guide-beats-list" id="guide-beats-list"></div>

    <div class="guide-actions">
      <button class="btn-accent guide-outline-btn" onclick="generateStepOutline()">
        📋 Generate Step Outline
      </button>
    </div>

    <!-- Step Outline Output -->
    <div class="guide-outline-result hidden" id="guide-outline-result">
      <div class="guide-outline-header">
        Step Outline
        <button class="btn-ghost icon-btn" onclick="copyOutline()" title="Copy">Copy</button>
      </div>
      <div class="guide-outline-content" id="guide-outline-content"></div>
    </div>
  `;

  // Insert before scene nav or at start of editor body
  const editorBody = document.querySelector('.editor-body-wrap');
  if (editorBody) editorBody.prepend(panel);
}

function injectGuidePanelToggle() {
  // Add Guide button to topbar-right
  const topbarRight = document.querySelector('.topbar-right');
  if (!topbarRight) return;

  const btn = document.createElement('button');
  btn.className = 'btn-ghost icon-btn';
  btn.id = 'guide-toggle-btn';
  btn.title = 'Story Guide';
  btn.innerHTML = '🎯';
  btn.onclick = toggleGuide;

  // Insert before the invite button
  const inviteBtn = document.getElementById('invite-btn');
  if (inviteBtn) topbarRight.insertBefore(btn, inviteBtn);
  else topbarRight.prepend(btn);

  // Also add AI button
  const aiBtn = document.createElement('button');
  aiBtn.className = 'btn-ghost icon-btn';
  aiBtn.id = 'ai-toggle-btn';
  aiBtn.title = 'AI Assistant';
  aiBtn.innerHTML = '✦ AI';
  aiBtn.onclick = () => {
    if (document.getElementById('ai-chat-panel')?.classList.contains('hidden')) {
      openAIPanel();
    } else {
      closeAIPanel();
    }
  };
  if (inviteBtn) topbarRight.insertBefore(aiBtn, inviteBtn);
  else topbarRight.prepend(aiBtn);
}

// ── Render Guide ──
function renderGuide() {
  const structure = PLOT_STRUCTURES[currentStructure];
  const length = FILM_LENGTHS[currentLength];

  // Description
  const descEl = document.getElementById('guide-structure-desc');
  if (descEl) descEl.textContent = structure.description;

  // Beat list
  const list = document.getElementById('guide-beats-list');
  if (!list) return;
  list.innerHTML = '';

  structure.beats.forEach((beat, i) => {
    const page = Math.round((beat.pct / 100) * length.pages);
    const item = document.createElement('div');
    item.className = 'guide-beat-item';
    item.dataset.beatId = beat.id;

    item.innerHTML = `
      <div class="guide-beat-header">
        <span class="guide-beat-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="guide-beat-name">${beat.name}</span>
        <span class="guide-beat-page">p.${page}</span>
      </div>
      <div class="guide-beat-desc">${beat.desc}</div>
      <div class="guide-beat-bar">
        <div class="guide-beat-progress" style="left:${beat.pct}%"></div>
      </div>
    `;

    list.appendChild(item);
  });
}

function onStructureChange(val) {
  currentStructure = val;
  renderGuide();
}

function onLengthChange(val) {
  currentLength = val;
  renderGuide();
}

// ── Step Outline Generator ──
async function generateStepOutline() {
  const resultEl = document.getElementById('guide-outline-result');
  const contentEl = document.getElementById('guide-outline-content');
  if (!resultEl || !contentEl) return;

  const blocks = window.ScriptEditor?.getBlocks() || [];
  const scriptText = blocks.map(b => {
    if (!b.text?.trim()) return '';
    const prefix = b.type === 'scene-heading' ? '\n**' + b.text.toUpperCase() + '**\n' : b.text;
    return prefix;
  }).filter(Boolean).join('\n').slice(0, 3000);

  resultEl.classList.remove('hidden');
  contentEl.textContent = '⏳ Generating outline…';

  const apiKey = localStorage.getItem('sf_api_key');
  if (!apiKey) {
    contentEl.textContent = '⚠ Add an OpenAI API key in Settings (✦ AI → ⚙) to generate outlines.';
    return;
  }

  try {
    const res = await Auth.apiFetch('/api/ai/assist', {
      method: 'POST',
      body: {
        action: 'outline',
        selectedText: scriptText || 'No script content yet.',
        scriptTitle: document.getElementById('script-title')?.value || '',
        apiKey,
      }
    });

    if (!res?.ok) {
      contentEl.textContent = '❌ Failed to generate outline.';
      return;
    }

    const data = await res.json();
    contentEl.textContent = data.result;
  } catch (e) {
    contentEl.textContent = `❌ Error: ${e.message}`;
  }
}

function copyOutline() {
  const content = document.getElementById('guide-outline-content')?.textContent || '';
  navigator.clipboard.writeText(content);
}

// ── Toggle ──
function toggleGuide() {
  const panel = document.getElementById('guide-panel');
  if (!panel) return;
  guideOpen = !panel.classList.contains('hidden') ? false : true;
  panel.classList.toggle('hidden', !guideOpen);

  // Adjust scene nav visibility
  const sceneNav = document.getElementById('scene-nav');
  if (sceneNav) sceneNav.style.display = guideOpen ? 'none' : '';
}

// ── Export ──
window.initGuide = initGuide;
window.toggleGuide = toggleGuide;
window.onStructureChange = onStructureChange;
window.onLengthChange = onLengthChange;
window.generateStepOutline = generateStepOutline;
window.copyOutline = copyOutline;

// Auto-init
window.addEventListener('DOMContentLoaded', () => setTimeout(initGuide, 300));
