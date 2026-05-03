/* ai.js — AI assistant integration
   Features:
   - Floating selection toolbar (appears on text selection)
   - AI action buttons: Correct, Detail, Shorter, Rewrite, Continue, Tension, Dialogue
   - AI chat side panel
   - Smart paste detection (auto-offer to format pasted Word content)
   - Step outline generator
*/

// ── State ──
let aiApiKey = localStorage.getItem('sf_api_key') || '';
let aiProvider = localStorage.getItem('sf_ai_provider') || 'openai';
let aiPanelOpen = false;
let lastSelection = null;
let lastSelectedText = '';
let aiLoading = false;

// ── AI Action Definitions ──
const AI_ACTIONS = [
  { id: 'correct',  label: 'Correct',      tooltip: 'Fix grammar & clarity', primary: true },
  { id: 'rewrite',  label: 'Rewrite',      tooltip: 'Fresh take, same meaning', primary: true },
  { id: 'shorter',  label: 'Shorter',       tooltip: 'Cut ruthlessly', primary: true },
  { id: 'detail',   label: 'Expand',  tooltip: 'Add cinematic detail', primary: false },
  { id: 'tension',  label: 'Tension',       tooltip: 'Raise the stakes', primary: false },
  { id: 'dialogue', label: 'Dialogue',     tooltip: 'Sharpen the dialogue', primary: false },
  { id: 'continue', label: 'Continue',     tooltip: 'Continue the scene', primary: false },
];

// ── Inject AI UI into editor.html ──
function initAI() {
  injectAIToolbar();
  injectAIChatPanel();
  injectSettingsModal();
  bindSelectionHandler();
  bindPasteDetection();
  loadApiKey();
}

// ── Floating Selection Toolbar ──
function injectAIToolbar() {
  const toolbar = document.createElement('div');
  toolbar.id = 'ai-selection-toolbar';
  toolbar.className = 'ai-selection-toolbar hidden';
  
  const primaries = AI_ACTIONS.filter(a => a.primary);
  const secondaries = AI_ACTIONS.filter(a => !a.primary);

  toolbar.innerHTML = `
    <div class="ai-toolbar-label">AI</div>
    ${primaries.map(a => `
      <button class="ai-action-btn" data-action="${a.id}" title="${a.tooltip}">
        <span class="ai-action-label">${a.label}</span>
      </button>
    `).join('')}
    
    <div class="ai-more-wrapper">
      <button class="ai-action-btn" id="ai-more-btn">More ▾</button>
      <div class="ai-more-menu hidden" id="ai-more-menu">
        ${secondaries.map(a => `
          <button class="ai-more-item" data-action="${a.id}">${a.label}</button>
        `).join('')}
      </div>
    </div>

    <div class="ai-toolbar-divider"></div>
    <button class="ai-action-btn ai-chat-toggle" title="Open AI chat" onclick="openAIPanel()">
      <span class="ai-action-label">Chat</span>
    </button>
  `;

  document.body.appendChild(toolbar);

  // Bind primary clicks
  toolbar.querySelectorAll('.ai-action-btn[data-action]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      runAIAction(btn.dataset.action);
    });
  });

  // Bind more menu
  const moreBtn = toolbar.querySelector('#ai-more-btn');
  const moreMenu = toolbar.querySelector('#ai-more-menu');
  if (moreBtn) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      moreMenu.classList.toggle('hidden');
    });
  }

  toolbar.querySelectorAll('.ai-more-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      moreMenu.classList.add('hidden');
      runAIAction(btn.dataset.action);
    });
  });

  // Global click to close more menu
  document.addEventListener('click', () => {
    if (moreMenu) moreMenu.classList.add('hidden');
  });
}

// ── AI Chat Panel ──
function injectAIChatPanel() {
  const panel = document.createElement('div');
  panel.id = 'ai-chat-panel';
  panel.className = 'ai-chat-panel hidden';
  panel.innerHTML = `
    <div class="ai-panel-header">
      <span>AI</span>
      <div style="display:flex;gap:0.5rem;align-items:center;">
        <button class="btn-ghost icon-btn" onclick="openSettingsModal()" title="Settings">Settings</button>
        <button class="btn-ghost icon-btn" onclick="closeAIPanel()">Close</button>
      </div>
    </div>

    <div class="ai-context-bar" id="ai-context-bar">
      <span id="ai-context-text">Select text in the editor to use AI</span>
    </div>

    <div class="ai-quick-actions" id="ai-quick-actions">
      ${AI_ACTIONS.map(a => `
        <button class="ai-quick-btn" data-action="${a.id}" title="${a.tooltip}">
          ${a.icon} ${a.label}
        </button>
      `).join('')}
      <button class="ai-quick-btn ai-outline-btn" data-action="outline" title="Generate step outline from script">
        Step Outline
      </button>
    </div>

    <div class="ai-messages" id="ai-messages">
      <div class="ai-welcome">
        <div class="ai-welcome-icon">◆</div>
        <h4>ScriptForge AI</h4>
        <p>Select any text in your script and choose an action, or ask me anything below.</p>
      </div>
    </div>

    <div class="ai-input-row">
      <textarea id="ai-chat-input" class="ai-chat-input" 
        placeholder="Ask anything about your script…" rows="2"></textarea>
      <button class="ai-send-btn" id="ai-send-btn" onclick="sendAIChat()">↑</button>
    </div>
  `;

  // Insert into editor body
  const editorBody = document.querySelector('.editor-body-wrap');
  if (editorBody) editorBody.appendChild(panel);
  else document.body.appendChild(panel);

  // Bind quick action clicks
  panel.querySelectorAll('.ai-quick-btn').forEach(btn => {
    btn.addEventListener('click', () => runAIAction(btn.dataset.action));
  });

  // Chat input Enter key
  document.getElementById('ai-chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendAIChat(); }
  });
}

// ── Settings Modal (API Key) ──
function injectSettingsModal() {
  const modal = document.createElement('div');
  modal.id = 'settings-modal';
  modal.className = 'modal-overlay hidden';
  modal.innerHTML = `
    <div class="modal-box modal-small">
      <h3>Settings</h3>

      <div class="settings-section">
        <h4 class="settings-section-title">AI Provider</h4>
        <div class="field-group">
          <label for="settings-provider">Provider</label>
          <select id="settings-provider" class="guide-select" onchange="onProviderChange(this.value)">
            <option value="openai">OpenAI (GPT-4o mini)</option>
            <option value="claude">Anthropic Claude (Haiku)</option>
            <option value="gemini">Google Gemini (1.5 Flash)</option>
          </select>
        </div>
        <div class="field-group" style="margin-top:0.6rem;">
          <label for="settings-api-key" id="api-key-label">OpenAI API Key</label>
          <div class="api-key-row">
            <input type="password" id="settings-api-key" placeholder="Paste your API key…" autocomplete="off" />
            <button class="btn-ghost icon-btn" onclick="toggleApiKeyVis()" title="Show/hide">show</button>
          </div>
          <small style="color:var(--text-muted);font-size:.72rem;margin-top:0.25rem;display:block;">
            Stored in your browser only. Sent directly to the AI provider via server proxy.
          </small>
        </div>
        <div id="settings-key-status" class="settings-key-status"></div>
      </div>

      <div class="settings-section">
        <h4 class="settings-section-title">Profile</h4>
        <div class="field-group">
          <label for="settings-name">Display Name</label>
          <input type="text" id="settings-name" placeholder="Your name" />
        </div>
      </div>

      <div class="modal-actions">
        <button class="btn-ghost" onclick="closeSettingsModal()">Cancel</button>
        <button class="btn-primary" style="width:auto;" onclick="saveSettings()">Save</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener('click', e => { if (e.target === modal) closeSettingsModal(); });
}

// ── Selection Handler ──
function bindSelectionHandler() {
  document.addEventListener('mouseup', handleSelectionChange);
  document.addEventListener('keyup', (e) => {
    if (e.shiftKey || ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) {
      handleSelectionChange();
    }
  });
  document.addEventListener('selectionchange', () => {
    setTimeout(handleSelectionChange, 50);
  });
}

function handleSelectionChange() {
  const sel = window.getSelection();
  if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
    hideAIToolbar();
    return;
  }

  const text = sel.toString().trim();
  if (text.length < 3) { hideAIToolbar(); return; }

  // Only show toolbar when selection is within screenplay page
  const range = sel.getRangeAt(0);
  const page = document.getElementById('screenplay-page');
  if (!page || !page.contains(range.commonAncestorContainer)) {
    hideAIToolbar();
    return;
  }

  let startEl = range.startContainer;
  while(startEl && !startEl.getAttribute?.('data-index')) startEl = startEl.parentNode;
  let endEl = range.endContainer;
  while(endEl && !endEl.getAttribute?.('data-index')) endEl = endEl.parentNode;
  
  let sIdx = startEl ? parseInt(startEl.getAttribute('data-index'), 10) : -1;
  let eIdx = endEl ? parseInt(endEl.getAttribute('data-index'), 10) : -1;
  if (sIdx > eIdx) [sIdx, eIdx] = [eIdx, sIdx];

  lastSelectedText = text;
  lastSelection = { text, range, startIndex: sIdx, endIndex: eIdx };

  // Update context bar in chat panel
  const ctxEl = document.getElementById('ai-context-text');
  if (ctxEl) {
    ctxEl.textContent = text.length > 80 ? `"${text.slice(0, 80)}…"` : `"${text}"`;
  }

  // Position toolbar near selection
  const rect = range.getBoundingClientRect();
  positionAIToolbar(rect);
}

function positionAIToolbar(rect) {
  const toolbar = document.getElementById('ai-selection-toolbar');
  if (!toolbar) return;

  const top = window.scrollY + rect.top - toolbar.offsetHeight - 8;
  let left = window.scrollX + rect.left + (rect.width / 2) - (toolbar.offsetWidth / 2);
  left = Math.max(8, Math.min(left, window.innerWidth - toolbar.offsetWidth - 8));

  toolbar.style.top = `${Math.max(8, top)}px`;
  toolbar.style.left = `${left}px`;
  toolbar.classList.remove('hidden');
}

function hideAIToolbar() {
  const toolbar = document.getElementById('ai-selection-toolbar');
  if (toolbar) toolbar.classList.add('hidden');
}

// ── Paste Detection ──
function bindPasteDetection() {
  const page = document.getElementById('screenplay-page');
  if (!page) return;

  page.addEventListener('paste', (e) => {
    const text = (e.clipboardData || window.clipboardData).getData('text/plain');
    if (text && text.length > 200) {
      // Large paste — offer AI formatting
      setTimeout(() => showPasteFormatOffer(text), 100);
    }
  });
}

function showPasteFormatOffer(text) {
  if (!document.getElementById('paste-offer')) {
    const offer = document.createElement('div');
    offer.id = 'paste-offer';
    offer.className = 'paste-offer';
    offer.innerHTML = `
      
      <div class="paste-offer-text">
        <strong>Pasted text detected.</strong><br>
        Would you like AI to automatically format it as a screenplay?
      </div>
      <div class="paste-offer-actions">
        <button class="btn-accent" id="paste-format-yes">Format with AI</button>
        <button class="btn-ghost" onclick="dismissPasteOffer()">Keep as-is</button>
      </div>
    `;
    document.body.appendChild(offer);

    document.getElementById('paste-format-yes').addEventListener('click', () => {
      dismissPasteOffer();
      lastSelectedText = text;
      runAIAction('format');
    });
  }

  // Auto-dismiss after 8s
  setTimeout(dismissPasteOffer, 8000);
}

function dismissPasteOffer() {
  const el = document.getElementById('paste-offer');
  if (el) el.remove();
}

// ── Run AI Action ──
async function runAIAction(action) {
  const text = lastSelectedText || getFullScriptText();
  if (!text && action !== 'outline') {
    showAIMessage('assistant', 'Please select some text in the editor first.', 'error');
    openAIPanel();
    return;
  }

  if (!aiApiKey) {
    openSettingsModal();
    showAIMessage('assistant', 'Please add an API key in Settings first.', 'error');
    return;
  }

  hideAIToolbar();
  openAIPanel();

  const actionLabel = AI_ACTIONS.find(a => a.id === action)?.label || action;
  showAIMessage('user', `**${actionLabel}**: "${text.slice(0, 120)}${text.length > 120 ? '…' : ''}"`);
  showAILoading();

  try {
    let selectedBlocks = null;
    let sIdx = lastSelection?.startIndex ?? -1;
    let eIdx = lastSelection?.endIndex ?? -1;
    
    if (sIdx >= 0 && eIdx >= 0 && window.ScriptEditor) {
      const allBlocks = window.ScriptEditor.getBlocks();
      selectedBlocks = allBlocks.slice(sIdx, eIdx + 1);
    }

    const res = await Auth.apiFetch('/api/ai/assist', {
      method: 'POST',
      body: {
        action,
        selectedText: text,
        selectedBlocks,
        context: getFullScriptText(),
        scriptTitle: document.getElementById('script-title')?.value || '',
        apiKey: aiApiKey,
        provider: aiProvider,
      }
    });

    hideAILoading();

    if (!res || !res.ok) {
      const err = await res?.json().catch(() => ({}));
      showAIMessage('assistant', `❌ Error: ${err.error || 'AI request failed'}`, 'error');
      return;
    }

    const data = await res.json();
    const result = data.result;

    if (action === 'format') {
      handleFormatResult(result);
    } else if (action === 'outline') {
      showAIMessage('assistant', result, 'outline');
    } else {
      showAIMessage('assistant', result, 'result', text, result, sIdx, eIdx);
    }

  } catch (e) {
    hideAILoading();
    showAIMessage('assistant', `❌ Network error: ${e.message}`, 'error');
  }
}

// ── Structural Navigator (Beats & Functions) ──
let editingBeatIndex = -1;

function openBeatEditor(index) {
  const allBlocks = window.ScriptEditor.getBlocks();
  const block = allBlocks[index];
  if (!block || block.type !== 'scene-heading') return;
  
  editingBeatIndex = index;
  document.getElementById('beat-scene-title').textContent = block.text || 'UNTITLED SCENE';
  document.getElementById('beat-input').value = block.beat || '';
  document.getElementById('func-input').value = block.dramaturgicalFunction || '';
  document.getElementById('beat-modal').classList.remove('hidden');
}

function closeBeatModal() {
  document.getElementById('beat-modal').classList.add('hidden');
  editingBeatIndex = -1;
}

function saveBeat() {
  if (editingBeatIndex === -1) return;
  
  const beat = document.getElementById('beat-input').value;
  const func = document.getElementById('func-input').value;
  
  window.ScriptEditor.updateBlockMetadata(editingBeatIndex, {
    beat: beat,
    dramaturgicalFunction: func
  });
  
  closeBeatModal();
}

async function syncAllBeats() {
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = 'Analyzing...';
  btn.disabled = true;
  
  try {
    const scriptText = getFullScriptText();
    const res = await Auth.apiFetch('/api/ai/sync-beats', {
      method: 'POST',
      body: { scriptText }
    });
    const data = await res.json();
    
    if (data.beats) {
      // data.beats should be an array of { sceneIndex: n, beat: "...", function: "..." }
      data.beats.forEach(item => {
        window.ScriptEditor.updateBlockMetadata(item.sceneIndex, {
          beat: item.beat,
          dramaturgicalFunction: item.function
        });
      });
      showAIMessage('assistant', `✅ Synced ${data.beats.length} scene beats with the script contents.`, 'success');
    }
  } catch (e) {
    alert('Sync failed: ' + e.message);
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

async function analyzeCharacterArcs() {
  const btn = event.target;
  const orig = btn.textContent;
  btn.textContent = 'Mapping Psychologies...';
  btn.disabled = true;
  
  try {
    const res = await Auth.apiFetch('/api/world/characters', {
      method: 'POST',
      body: { scriptText: getFullScriptText() }
    });
    const data = await res.json();
    
    if (data.characters) {
      const grid = document.getElementById('char-arc-grid');
      grid.innerHTML = '';
      data.characters.forEach(char => {
        const bars = char.arcPoints.map(p => `
          <div class="char-arc-bar" style="height: ${p.score * 10}%" data-label="${p.scene}: ${p.emotion}"></div>
        `).join('');

        grid.innerHTML += `
          <div class="char-arc-card">
            <div class="char-arc-header">
              <span class="char-name-badge">${char.name}</span>
            </div>
            <div class="char-arc-visual">
              ${bars}
            </div>
            <div class="char-arc-stat">
              <span>Goal:</span>
              <span>${char.goal || 'N/A'}</span>
            </div>
            <div class="char-arc-summary">
              ${char.summary}
            </div>
          </div>
        `;
      });
    }
  } catch (e) {
    alert('Analysis failed: ' + e.message);
  } finally {
    btn.textContent = orig;
    btn.disabled = false;
  }
}

function handleFormatResult(result) {
  try {
    let parsedBlocks = null;
    const match = result.match(/\[\s*\{[\s\S]*\}\s*\]/);
    if (match) {
      parsedBlocks = JSON.parse(match[0]);
    } else {
      const cleaned = result.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsedBlocks = JSON.parse(cleaned);
    }
    
    if (Array.isArray(parsedBlocks) && parsedBlocks.length > 0) {
      window.ScriptEditor?.applyRemoteOp({ type: 'full', blocks: parsedBlocks });
      showAIMessage('assistant', `✅ Formatted ${parsedBlocks.length} screenplay blocks. Your script has been updated!`, 'success');
    } else {
      showAIMessage('assistant', result);
    }
  } catch {
    showAIMessage('assistant', result);
  }
}

async function sendAIChat() {
  const input = document.getElementById('ai-chat-input');
  const msg = input.value.trim();
  if (!msg || aiLoading) return;

  if (!aiApiKey) { openSettingsModal(); return; }

  input.value = '';
  showAIMessage('user', msg);
  showAILoading();

  try {
    const res = await Auth.apiFetch('/api/ai/assist', {
      method: 'POST',
      body: {
        action: 'chat',
        selectedText: lastSelectedText || msg,
        context: msg + '\n\nScript context: ' + getFullScriptText().slice(0, 1500),
        scriptTitle: document.getElementById('script-title')?.value || '',
        apiKey: aiApiKey,
        provider: aiProvider,
      }
    });

    hideAILoading();
    if (!res || !res.ok) { const e = await res?.json().catch(()=>({})); showAIMessage('assistant', `❌ ${e.error || 'Failed'}`, 'error'); return; }
    const data = await res.json();
    showAIMessage('assistant', data.result);
  } catch (e) {
    hideAILoading();
    showAIMessage('assistant', `❌ ${e.message}`, 'error');
  }
}

// ── Chat Messages ──
function showAIMessage(role, content, type = '', originalText = '', newText = '', sIdx = -1, eIdx = -1) {
  const container = document.getElementById('ai-messages');
  if (!container) return;

  // Remove welcome on first message
  const welcome = container.querySelector('.ai-welcome');
  if (welcome) welcome.remove();

  const msg = document.createElement('div');
  msg.className = `ai-message ai-message-${role}`;

  let displayContent = content;
  if (role === 'assistant' && type === 'result') {
    try {
      const match = content.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        const blocks = JSON.parse(match[0]);
        if (Array.isArray(blocks)) {
          displayContent = blocks.map(b => b.text).join('\n\n');
        }
      } else {
        throw new Error('No JSON match');
      }
    } catch(e) {
      // Aggressively strip JSON syntax visually if the AI truncated it or failed to parse
      if (content.includes('"type"') || content.includes('"text"')) {
        displayContent = content
          .replace(/```json\n?/g, '')
          .replace(/```\n?/g, '')
          .replace(/\[\s*\{\s*/g, '')
          .replace(/"type":\s*"[^"]*",\s*/g, '')
          .replace(/"text":\s*"/g, '')
          .replace(/"\s*\}\s*\]/g, '')
          .replace(/"\s*\}\s*,\s*\{/g, '\n\n')
          .replace(/\\"/g, '"')
          .replace(/\\n/g, '\n')
          .trim();
      }
    }
  }

  let html = escHtml(displayContent).replace(/\n/g, '<br>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  msg.innerHTML = html;

  // Add Apply button for replacement results dynamically to avoid all HTML quote/escaping issues
  if (type === 'result' && newText && window.ScriptEditor) {
    const row = document.createElement('div');
    row.className = 'ai-apply-row';
    
    const applyBtn = document.createElement('button');
    applyBtn.className = 'ai-apply-btn';
    applyBtn.textContent = 'Apply to Script';
    applyBtn.onclick = () => applyAIResult(originalText, newText, sIdx, eIdx);
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'ai-copy-btn';
    copyBtn.textContent = 'Copy';
    copyBtn.onclick = () => copyToClipboard(newText);
    
    row.appendChild(applyBtn);
    row.appendChild(copyBtn);
    msg.appendChild(row);
  }
  container.appendChild(msg);
  container.scrollTop = container.scrollHeight;
}

function showAILoading() {
  aiLoading = true;
  const container = document.getElementById('ai-messages');
  if (!container) return;
  const el = document.createElement('div');
  el.id = 'ai-loading-msg';
  el.className = 'ai-message ai-message-assistant ai-loading-msg';
  el.innerHTML = '<span class="ai-dots"><span>●</span><span>●</span><span>●</span></span>';
  container.appendChild(el);
  container.scrollTop = container.scrollHeight;
}

function hideAILoading() {
  aiLoading = false;
  const el = document.getElementById('ai-loading-msg');
  if (el) el.remove();
}

function applyAIResult(originalText, newText, sIdx = -1, eIdx = -1) {
  if (sIdx >= 0 && eIdx >= 0 && window.ScriptEditor) {
    let parsedBlocks = null;
    
    try {
      // Intelligently extract JSON array from potentially messy AI text
      const match = newText.match(/\[\s*\{[\s\S]*\}\s*\]/);
      if (match) {
        parsedBlocks = JSON.parse(match[0]);
      } else {
        const cleaned = newText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        parsedBlocks = JSON.parse(cleaned);
      }
    } catch (e) {
      console.warn('AI result was not valid JSON blocks, falling back to plain text update.', e);
    }

    if (Array.isArray(parsedBlocks) && parsedBlocks.length > 0) {
      try {
        window.ScriptEditor.applyRemoteOp({ type: 'replaceBlocks', startIndex: sIdx, endIndex: eIdx, newBlocks: parsedBlocks });
        showAIMessage('assistant', 'Applied to script.', 'success');
        return;
      } catch (e) {
        console.error('replaceBlocks failed:', e);
      }
    }

    // Fallback: If AI returned plain text (or parse failed), just update the first selected block
    // Don't paste raw JSON into the text block if it looks like JSON but failed to parse completely
    let textToInject = newText;
    if (newText.trim().startsWith('[') || newText.trim().startsWith('```json')) {
      showAIMessage('assistant', '❌ Failed to apply. AI JSON is malformed or was truncated mid-sentence.', 'error');
      return;
    }
    
    window.ScriptEditor.applyRemoteOp({ type: 'textUpdate', index: sIdx, text: textToInject });
    showAIMessage('assistant', 'Applied text update to script.', 'success');
    return;
  }

  // Fallback if no indices
  const blocks = window.ScriptEditor?.getBlocks() || [];
  for (let i = 0; i < blocks.length; i++) {
    if (blocks[i].text && blocks[i].text.includes(originalText.slice(0, 30))) {
      window.ScriptEditor.applyRemoteOp({ type: 'textUpdate', index: i, text: newText });
      showAIMessage('assistant', 'Applied to script.', 'success');
      return;
    }
  }
  // Fallback: copy to clipboard
  copyToClipboard(newText);
  showAIMessage('assistant', 'Copied to clipboard (couldn\'t auto-locate the block).', 'success');
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).catch(() => {});
}

function getFullScriptText() {
  const blocks = window.ScriptEditor?.getBlocks() || [];
  return blocks.map(b => b.text || '').filter(Boolean).join('\n');
}

// ── Panel Open/Close ──
function openAIPanel() {
  const panel = document.getElementById('ai-chat-panel');
  if (panel) {
    panel.classList.remove('hidden');
    aiPanelOpen = true;
  }
}

function closeAIPanel() {
  const panel = document.getElementById('ai-chat-panel');
  if (panel) {
    panel.classList.add('hidden');
    aiPanelOpen = false;
  }
}

// ── Settings ──
function openSettingsModal() {
  const modal = document.getElementById('settings-modal');
  if (!modal) return;
  modal.classList.remove('hidden');
  document.getElementById('settings-api-key').value = aiApiKey || '';
  const providerEl = document.getElementById('settings-provider');
  if (providerEl) providerEl.value = aiProvider;
  onProviderChange(aiProvider);
  const user = Auth.getUser();
  if (user) document.getElementById('settings-name').value = user.displayName || '';
  updateKeyStatus();
}

function closeSettingsModal() {
  document.getElementById('settings-modal')?.classList.add('hidden');
}

function updateKeyStatus() {
  const statusEl = document.getElementById('settings-key-status');
  if (!statusEl) return;
  if (aiApiKey) {
    statusEl.innerHTML = '<span class="key-status-ok">API key configured</span>';
  } else {
    statusEl.innerHTML = '<span class="key-status-missing">No API key — AI disabled</span>';
  }
}

function toggleApiKeyVis() {
  const input = document.getElementById('settings-api-key');
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

async function saveSettings() {
  const key = document.getElementById('settings-api-key').value.trim();
  const name = document.getElementById('settings-name').value.trim();
  let prov = document.getElementById('settings-provider')?.value || 'openai';

  // Auto-detect provider if user pasted a key but didn't switch the dropdown
  if (key) {
    if (key.startsWith('sk-ant-')) prov = 'claude';
    else if (key.startsWith('AIza')) prov = 'gemini';
    else if (key.startsWith('sk-')) prov = 'openai';
    
    // Update the dropdown visually if we auto-detected a switch
    const providerEl = document.getElementById('settings-provider');
    if (providerEl && providerEl.value !== prov) {
      providerEl.value = prov;
      onProviderChange(prov);
    }
  }

  aiProvider = prov;
  localStorage.setItem('sf_ai_provider', prov);

  if (key) {
    aiApiKey = key;
    localStorage.setItem('sf_api_key', key);
  } else if (key === '') {
    aiApiKey = '';
    localStorage.removeItem('sf_api_key');
  }

  if (name) {
    await Auth.apiFetch('/api/auth/settings', { method: 'PUT', body: { displayName: name } });
  }

  closeSettingsModal();
  updateKeyStatus();
}

function loadApiKey() {
  aiApiKey = localStorage.getItem('sf_api_key') || '';
  aiProvider = localStorage.getItem('sf_ai_provider') || 'openai';
}

const PROVIDER_KEY_LABELS = {
  openai: 'OpenAI API Key (sk-…)',
  claude: 'Anthropic API Key (sk-ant-…)',
  gemini: 'Google AI API Key',
};

function onProviderChange(prov) {
  const label = document.getElementById('api-key-label');
  if (label) label.textContent = PROVIDER_KEY_LABELS[prov] || 'API Key';
  const input = document.getElementById('settings-api-key');
  if (input) input.placeholder = PROVIDER_KEY_LABELS[prov] || 'Paste your key…';
}

// ── Escaping ──
function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Init on load ──
window.addEventListener('DOMContentLoaded', () => {
  // Small delay so editor.js has set up first
  setTimeout(initAI, 200);
});

// ── Expose globals ──
window.openAIPanel = openAIPanel;
window.closeAIPanel = closeAIPanel;
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.saveSettings = saveSettings;
window.toggleApiKeyVis = toggleApiKeyVis;
window.runAIAction = runAIAction;
window.sendAIChat = sendAIChat;
window.applyAIResult = applyAIResult;
window.copyToClipboard = copyToClipboard;
window.dismissPasteOffer = dismissPasteOffer;
window.onProviderChange = onProviderChange;
