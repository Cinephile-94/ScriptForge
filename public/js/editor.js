/* editor.js — Screenplay editor engine
   Implements Celtx-compatible formatting rules:
   - Block types: scene-heading, action, character, dialogue, parenthetical, transition, shot
   - Smart Tab/Enter auto-advance
   - Character name autocomplete
   - Scene navigator
   - Auto-save
   - Word/page/scene count
*/

// ── State ──
const scriptId = window.location.pathname.split('/').pop();
let blocks = [];        // Array of { id, type, text }
let focusedIndex = -1; // Currently focused block index
let isDirty = false;
let saveTimer = null;
let charNames = new Set(); // Known character names for autocomplete
let sceneCount = 0;
let autoCompleteIndex = -1;

// ── History Stack (Undo/Redo) ──
let historyStack = [];
let historyIndex = -1;
let historyDebounceTimer = null;

function saveHistory() {
  const state = JSON.stringify(blocks);
  if (historyIndex >= 0 && historyStack[historyIndex] === state) return;
  historyStack = historyStack.slice(0, historyIndex + 1);
  historyStack.push(state);
  if (historyStack.length > 100) historyStack.shift();
  historyIndex = historyStack.length - 1;
}

function triggerHistorySave() {
  clearTimeout(historyDebounceTimer);
  historyDebounceTimer = setTimeout(saveHistory, 600);
}

function undoHistory() {
  if (historyIndex > 0) {
    historyIndex--;
    blocks = JSON.parse(historyStack[historyIndex]);
    fullRerender();
    updateSceneNav();
    updateStatusBar();
    extractCharacterNames();
    markDirty();
  }
}

function redoHistory() {
  if (historyIndex < historyStack.length - 1) {
    historyIndex++;
    blocks = JSON.parse(historyStack[historyIndex]);
    fullRerender();
    updateSceneNav();
    updateStatusBar();
    extractCharacterNames();
    markDirty();
  }
}
// ── Block Types Config ──
const BLOCK_TYPES = {
  'scene-heading':   { label: 'Scene Heading', placeholder: 'INT./EXT. LOCATION - DAY/NIGHT', typeLabel: 'Scene' },
  'action':          { label: 'Action',        placeholder: 'Action description...',           typeLabel: 'Action' },
  'character':       { label: 'Character',     placeholder: 'CHARACTER NAME',                  typeLabel: 'Char.' },
  'dialogue':        { label: 'Dialogue',      placeholder: 'Dialogue...',                     typeLabel: 'Dial.' },
  'parenthetical':   { label: 'Parenthetical', placeholder: 'beat',                            typeLabel: 'Paren' },
  'transition':      { label: 'Transition',    placeholder: 'CUT TO:',                         typeLabel: 'Trans.' },
  'shot':            { label: 'Shot',          placeholder: 'CLOSE ON:',                        typeLabel: 'Shot' }
};

// Smart Enter advance: what type follows each type when Enter is pressed
const ENTER_ADVANCE = {
  'scene-heading':  'action',
  'action':         'action',
  'character':      'dialogue',
  'dialogue':       'action',
  'parenthetical':  'dialogue',
  'transition':     'scene-heading',
  'shot':           'action',
};

// Smart Tab advance
const TAB_ADVANCE = {
  'action':          'character',
  'character':       'scene-heading',
  'dialogue':        'character',
  'scene-heading':   'action',
  'parenthetical':   'dialogue',
  'transition':      'action',
  'shot':            'action',
};

// Keyboard shortcut to type
const KEY_TO_TYPE = {
  's': 'scene-heading',
  'a': 'action',
  'c': 'character',
  'd': 'dialogue',
  'p': 'parenthetical',
  't': 'transition',
  'h': 'shot',
};

// ── DOM ──
const page = document.getElementById('screenplay-page');
const titleInput = document.getElementById('script-title');
const saveIndicator = document.getElementById('save-indicator');
const sceneNavList = document.getElementById('scene-nav-list');
const autocompleteEl = document.getElementById('autocomplete-dropdown');

// ── Unique ID ──
function uid() {
  return Math.random().toString(36).slice(2, 10);
}

// ── Generate default blocks from server data ──
function initBlocks(serverContent) {
  if (Array.isArray(serverContent) && serverContent.length > 0) {
    blocks = serverContent.map(b => ({ id: b.id || uid(), type: b.type || 'action', text: b.text || '' }));
  } else {
    blocks = [
      { id: uid(), type: 'transition', text: 'FADE IN:' },
      { id: uid(), type: 'scene-heading', text: 'INT. LOCATION - DAY' },
      { id: uid(), type: 'action', text: '' }
    ];
  }
  renderAllBlocks();
  updateSceneNav();
  updateStatusBar();
  extractCharacterNames();
}

// ── Render ──
function renderAllBlocks() {
  page.innerHTML = '';
  blocks.forEach((block, i) => {
    page.appendChild(createBlockEl(block, i));
  });
}

function createBlockEl(block, index) {
  const cfg = BLOCK_TYPES[block.type] || BLOCK_TYPES['action'];
  const el = document.createElement('div');
  el.className = 'screenplay-block';
  el.dataset.type = block.type;
  el.dataset.index = index;
  el.dataset.id = block.id;
  el.dataset.placeholder = cfg.placeholder;
  el.dataset.typeLabel = cfg.typeLabel;
  el.contentEditable = 'true';
  el.spellcheck = true;

  // Text only — NO child spans inside contenteditable
  el.textContent = block.text || '';

  el.addEventListener('input', () => onBlockInput(el));
  el.addEventListener('keydown', (e) => onBlockKeydown(e, el));
  el.addEventListener('focus', () => onBlockFocus(el));
  el.addEventListener('blur', () => onBlockBlur(el));
  el.addEventListener('paste', onPaste);

  return el;
}

// Scene number wrap — sibling BEFORE scene-heading blocks, never inside them
function createSceneNumberEl(n) {
  const wrap = document.createElement('div');
  wrap.className = 'scene-number-wrap';
  const numL = document.createElement('span');
  numL.className = 'scene-number';
  numL.textContent = n;
  const numR = document.createElement('span');
  numR.className = 'scene-number-right';
  numR.textContent = n;
  wrap.appendChild(numL);
  wrap.appendChild(numR);
  return wrap;
}

function getBlockEl(index) {
  return page.querySelector(`[data-index="${index}"]`);
}

function refreshBlockElement(index) {
  const block = blocks[index];
  if (!block) return;
  const oldEl = getBlockEl(index);
  if (!oldEl) return;
  const newEl = createBlockEl(block, index);
  oldEl.replaceWith(newEl);
  return newEl;
}

// ── Input Handlers ──
function onBlockInput(el) {
  const index = parseInt(el.dataset.index);
  const block = blocks[index];
  if (!block) return;

  let text = el.textContent || '';

  block.text = text;
  markDirty();
  triggerHistorySave();

  // BROADCAST LIVE TYPING
  window.ScriptCollab?.broadcastOp({ 
    type: 'textUpdate', 
    index: index, 
    text: text 
  });

  // Update autocomplete for character
  if (block.type === 'character') {
    showAutocomplete(el, text.trim());
  } else {
    hideAutocomplete();
  }

  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    updateSceneNav();
    updateStatusBar();
    extractCharacterNames();
    scheduleAutoSave();
  }, 1000);
}

function onBlockKeydown(e, el) {
  const index = parseInt(el.dataset.index);
  const block = blocks[index];

  // Handle autocomplete navigation
  if (!autocompleteEl.classList.contains('hidden')) {
    if (e.key === 'ArrowDown') { e.preventDefault(); moveAutocomplete(1); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); moveAutocomplete(-1); return; }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const sel = autocompleteEl.querySelector('.selected');
      if (sel) { e.preventDefault(); applyAutocomplete(sel.dataset.name, el, index); return; }
    }
    if (e.key === 'Escape') { hideAutocomplete(); return; }
  }

  // Enter key — split block or advance type
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    saveHistory(); // Snapshot before split
    handleEnter(el, index);
    return;
  }

  // Backspace on empty block — remove block
  if (e.key === 'Backspace' && (el.textContent === '' || el.innerText === '')) {
    e.preventDefault();
    if (blocks.length > 1) {
      saveHistory(); // Snapshot before delete
      removeBlock(index);
    }
    return;
  }

  // Tab — change block type
  if (e.key === 'Tab') {
    e.preventDefault();
    saveHistory(); // Snapshot before type change
    const nextType = e.shiftKey
      ? getPrevType(block.type)
      : (TAB_ADVANCE[block.type] || 'action');
    changeBlockType(index, nextType);
    return;
  }

  // Cmd+Z / Cmd+Y — custom global undo/redo
  if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) redoHistory();
    else undoHistory();
    return;
  }
  if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
    e.preventDefault();
    redoHistory();
    return;
  }

  // Ctrl/Cmd + S — save
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveScript();
    return;
  }

  // Type shortcuts (Ctrl/Cmd + key)
  if ((e.ctrlKey || e.metaKey) && KEY_TO_TYPE[e.key]) {
    e.preventDefault();
    changeBlockType(index, KEY_TO_TYPE[e.key]);
    return;
  }

  // Arrow Up — focus previous block
  if (e.key === 'ArrowUp') {
    const sel = window.getSelection();
    if (sel && sel.anchorOffset === 0 && index > 0) {
      e.preventDefault();
      focusBlock(index - 1, 'end');
    }
  }

  // Arrow Down — focus next block
  if (e.key === 'ArrowDown') {
    const text = el.textContent || '';
    const sel = window.getSelection();
    if (sel && sel.anchorOffset >= text.length && index < blocks.length - 1) {
      e.preventDefault();
      focusBlock(index + 1, 'start');
    }
  }
}

function onBlockFocus(el) {
  const index = parseInt(el.dataset.index);
  focusedIndex = index;
  el.classList.add('focused');
  updateToolbarActive(blocks[index]?.type);
  updateSceneNavActive(index);
  hideAutocomplete();
}

function onBlockBlur(el) {
  const index = parseInt(el.dataset.index);
  el.classList.remove('focused');
  // Sync text
  const block = blocks[index];
  if (block) block.text = (el.innerText || el.textContent || '').trim();
  setTimeout(hideAutocomplete, 150);
}

function onPaste(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
}

// ── Enter handling — split block or advance ──
function handleEnter(el, index) {
  const block = blocks[index];
  const sel = window.getSelection();
  const range = sel.getRangeAt(0);

  // Get text before and after cursor
  const fullText = el.textContent || '';
  const offset = range.startOffset;
  const before = fullText.slice(0, offset).trim();
  const after = fullText.slice(offset).trim();

  // Update current block with text before cursor
  block.text = before;
  el.textContent = before;

  // Determine next type
  const nextType = ENTER_ADVANCE[block.type] || 'action';

  // Insert new block after current
  const newBlock = { id: uid(), type: nextType, text: after };
  blocks.splice(index + 1, 0, newBlock);

  // Re-render affected elements
  rerenderFrom(index);
  focusBlock(index + 1, 'start');
  markDirty();
  window.ScriptCollab?.broadcastOp({ type: 'insert', index: index + 1, block: newBlock });
}

function rerenderFrom(startIndex) {
  // Remove all elements from startIndex onward and re-append
  const children = [...page.children];
  for (let i = startIndex; i < children.length; i++) {
    children[i].remove();
  }
  for (let i = startIndex; i < blocks.length; i++) {
    page.appendChild(createBlockEl(blocks[i], i));
  }
}

function fullRerender() {
  renderAllBlocks();
}

// ── Block Management ──
function removeBlock(index) {
  blocks.splice(index, 1);
  rerenderFrom(index > 0 ? index - 1 : 0);
  focusBlock(Math.max(0, index - 1), 'end');
  markDirty();
  updateSceneNav();
  updateStatusBar();
  window.ScriptCollab?.broadcastOp({ type: 'delete', index });
}

function changeBlockType(index, newType) {
  const block = blocks[index];
  if (!block) return;
  block.type = newType;

  // Sync text from DOM
  const el = getBlockEl(index);
  if (el) block.text = (el.innerText || el.textContent || '').trim();

  // Re-render this block
  const newEl = refreshBlockElement(index);
  if (newEl) {
    focusBlock(index, 'end');
  }

  updateToolbarActive(newType);
  markDirty();
  window.ScriptCollab?.broadcastOp({ type: 'typeChange', index, newType });
}

function focusBlock(index, position = 'end') {
  const el = getBlockEl(index);
  if (!el) return;
  el.focus();
  focusedIndex = index;

  try {
    const range = document.createRange();
    const sel = window.getSelection();
    const textNode = el.childNodes[0] || el;

    if (position === 'start') {
      range.setStart(textNode, 0);
    } else {
      const len = textNode.nodeType === Node.TEXT_NODE ? textNode.textContent.length : 0;
      range.setStart(textNode, len);
    }
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
  } catch {}
}

function getPrevType(type) {
  const types = Object.keys(BLOCK_TYPES);
  const i = types.indexOf(type);
  return types[(i - 1 + types.length) % types.length];
}

// ── Toolbar ──
function updateToolbarActive(type) {
  document.querySelectorAll('.el-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === type);
  });
}

// Click toolbar buttons
document.querySelectorAll('.el-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (focusedIndex >= 0) changeBlockType(focusedIndex, btn.dataset.type);
  });
});

// ── Character Autocomplete ──
function extractCharacterNames() {
  charNames = new Set();
  blocks.forEach(b => {
    if (b.type === 'character' && b.text.trim()) {
      charNames.add(b.text.trim().toUpperCase());
    }
  });
}

function showAutocomplete(el, query) {
  const q = query.toUpperCase();
  if (!q) { hideAutocomplete(); return; }

  const matches = [...charNames].filter(n => n.startsWith(q) && n !== q);
  if (matches.length === 0) { hideAutocomplete(); return; }

  const rect = el.getBoundingClientRect();
  autocompleteEl.style.left = `${rect.left}px`;
  autocompleteEl.style.top = `${rect.bottom + 2}px`;
  autocompleteEl.innerHTML = '';
  autoCompleteIndex = -1;

  matches.slice(0, 6).forEach(name => {
    const item = document.createElement('div');
    item.className = 'autocomplete-item';
    item.dataset.name = name;
    item.textContent = name;
    item.addEventListener('mousedown', (e) => {
      e.preventDefault();
      applyAutocomplete(name, el, focusedIndex);
    });
    autocompleteEl.appendChild(item);
  });

  autocompleteEl.classList.remove('hidden');
}

function hideAutocomplete() {
  autocompleteEl.classList.add('hidden');
  autoCompleteIndex = -1;
}

function moveAutocomplete(dir) {
  const items = [...autocompleteEl.querySelectorAll('.autocomplete-item')];
  if (!items.length) return;
  autoCompleteIndex = (autoCompleteIndex + dir + items.length) % items.length;
  items.forEach((item, i) => item.classList.toggle('selected', i === autoCompleteIndex));
}

function applyAutocomplete(name, el, index) {
  el.textContent = name;
  blocks[index].text = name;
  hideAutocomplete();
  focusBlock(index, 'end');
  markDirty();
}

// ── Scene Navigator ──
function updateSceneNav() {
  sceneNavList.innerHTML = '';
  let n = 0;
  blocks.forEach((block, i) => {
    if (block.type === 'scene-heading') {
      n++;
      const item = document.createElement('div');
      item.className = 'scene-nav-item';
      item.dataset.blockIndex = i;
      
      const titleText = block.text.trim() || 'NEW SCENE';
      const beat = block.beat || '';
      const func = block.dramaturgicalFunction || '';
      
      item.innerHTML = `
        <div class="scene-nav-row">
          <span class="scene-num">${n}</span>
          <span class="scene-title">${escHtml(titleText)}</span>
        </div>
        <div class="scene-nav-meta">
          <div class="scene-nav-beat" title="Scene Beat">${escHtml(beat) || 'Add beat...'}</div>
          ${func ? `<div class="scene-nav-func-tag">${escHtml(func)}</div>` : ''}
        </div>
      `;
      
      item.addEventListener('click', (e) => {
        // If clicking meta, open beat editor
        if (e.target.closest('.scene-nav-meta')) {
          if (window.openBeatEditor) window.openBeatEditor(i);
        } else {
          focusBlock(i, 'start');
          getBlockEl(i)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      });

      sceneNavList.appendChild(item);

      // Set scene number on the block element
      const blockEl = getBlockEl(i);
      if (blockEl) blockEl.dataset.sceneNum = n;
    }
  });
  sceneCount = n;
}

function updateBlockMetadata(index, meta) {
  if (blocks[index]) {
    blocks[index] = { ...blocks[index], ...meta };
    fullRerender();
    updateSceneNav();
    markDirty();
    scheduleAutoSave();
  }
}

function updateSceneNavActive(blockIndex) {
  document.querySelectorAll('.scene-nav-item').forEach(item => {
    item.classList.toggle('active', parseInt(item.dataset.blockIndex) === blockIndex);
  });
}

// ── Status Bar ──
function updateStatusBar() {
  const wordCount = blocks.reduce((acc, b) => {
    return acc + (b.text ? b.text.trim().split(/\s+/).filter(Boolean).length : 0);
  }, 0);

  const charCount = blocks.reduce((acc, b) => acc + (b.text?.length || 0), 0);

  // Rough page estimate: ~55 lines per page, ~8 words per line average for scripts
  const pageEst = Math.max(1, Math.ceil(blocks.length / 45));

  document.getElementById('status-page').textContent = `Page ~${pageEst}`;
  document.getElementById('status-scenes').textContent = `${sceneCount} Scenes`;
  document.getElementById('status-words').textContent = `${wordCount} Words`;
  document.getElementById('status-chars').textContent = `${charCount} Chars`;
}

// ── Dirty State & Saving ──
function markDirty() {
  isDirty = true;
  saveIndicator.className = 'save-indicator unsaved';
  saveIndicator.title = 'Unsaved changes';
}

function markClean() {
  isDirty = false;
  saveIndicator.className = 'save-indicator saved';
  saveIndicator.title = 'All changes saved';
  setTimeout(() => {
    saveIndicator.className = 'save-indicator';
  }, 2000);
}

let autoSaveDebounce = null;
function scheduleAutoSave() {
  clearTimeout(autoSaveDebounce);
  autoSaveDebounce = setTimeout(saveScript, 8000);
}

async function saveScript() {
  if (!isDirty) return;
  syncAllBlocksFromDOM();

  const title = titleInput.value.trim() || 'Untitled Script';
  const wordCount = blocks.reduce((acc, b) =>
    acc + (b.text ? b.text.trim().split(/\s+/).filter(Boolean).length : 0), 0);

  // Try collab WebSocket save first
  if (window.ScriptCollab?.isConnected()) {
    window.ScriptCollab.send({
      type: 'save',
      title,
      content: blocks,
      scene_count: sceneCount,
      word_count: wordCount
    });
    markClean();
    return;
  }

  // Fallback: REST API
  try {
    const res = await Auth.apiFetch(`/api/scripts/${scriptId}`, {
      method: 'PUT',
      body: { title, content: blocks, scene_count: sceneCount, word_count: wordCount }
    });
    if (res?.ok) markClean();
  } catch (e) {
    console.error('Save failed', e);
  }
}

function syncAllBlocksFromDOM() {
  blocks.forEach((block, i) => {
    const el = getBlockEl(i);
    if (el) block.text = (el.innerText || el.textContent || '').trim();
  });
}

// Title input
titleInput.addEventListener('input', markDirty);

// Ctrl+S global
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    saveScript();
  }
});

// ── PDF Export ──
async function exportPdf() {
  const btn = document.getElementById('export-btn');
  btn.textContent = '⏳ Generating…';
  btn.disabled = true;

  try {
    const res = await Auth.apiFetch(`/api/scripts/${scriptId}/export/pdf`, { method: 'POST' });
    if (!res || !res.ok) throw new Error('Export failed');

    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(titleInput.value || 'script').replace(/\s+/g, '_')}.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e) {
    alert('PDF export failed: ' + e.message);
  } finally {
    btn.textContent = '⬇ PDF';
    btn.disabled = false;
  }
}

// ── Notes Panel ──
function toggleNotes() {
  const panel = document.getElementById('notes-panel');
  panel.classList.toggle('hidden');
}

// ── Invite ──
async function inviteCollaborator() {
  document.getElementById('invite-modal').classList.remove('hidden');
  document.getElementById('invite-link-input').value = '';
}

async function generateInviteLink() {
  const btn = document.getElementById('gen-invite-btn');
  btn.disabled = true;
  btn.textContent = 'Generating…';
  try {
    const res = await Auth.apiFetch(`/api/scripts/${scriptId}/invite`, { method: 'POST' });
    if (!res) return;
    const data = await res.json();
    const link = `${window.location.origin}/join/${data.token}`;
    document.getElementById('invite-link-input').value = link;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate Link';
  }
}

function copyInviteLink() {
  const input = document.getElementById('invite-link-input');
  if (!input.value) { generateInviteLink(); return; }
  navigator.clipboard.writeText(input.value).then(() => {
    const btn = document.querySelector('.invite-link-box .btn-accent');
    btn.textContent = 'Copied!';
    setTimeout(() => btn.textContent = 'Copy', 2000);
  });
}

function closeInviteModal() {
  document.getElementById('invite-modal').classList.add('hidden');
}

document.getElementById('invite-modal').addEventListener('click', e => {
  if (e.target === document.getElementById('invite-modal')) closeInviteModal();
});

// ── Load Script ──
async function loadScript() {
  const user = Auth.getUser();
  if (!user) { window.location.href = '/'; return; }

  const res = await Auth.apiFetch(`/api/scripts/${scriptId}`);
  if (!res) return;

  if (!res.ok) {
    alert('Script not found or access denied.');
    window.location.href = '/';
    return;
  }

  const data = await res.json();
  titleInput.value = data.title || 'Untitled Script';
  initBlocks(JSON.parse(data.content || '[]'));

  // Init collab
  if (window.initCollab) initCollab(scriptId, user);
}

// ── Helpers ──
function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── Expose for collab ──
window.ScriptEditor = {
  getBlocks: () => blocks,
  applyRemoteOp(op) {
    saveHistory(); // Snapshot before any remote/AI changes
    switch (op.type) {
      case 'insert':
        blocks.splice(op.index, 0, op.block);
        rerenderFrom(op.index);
        updateSceneNav();
        updateStatusBar();
        break;
      case 'delete':
        blocks.splice(op.index, 1);
        rerenderFrom(op.index > 0 ? op.index - 1 : 0);
        updateSceneNav();
        updateStatusBar();
        break;
      case 'typeChange':
        if (blocks[op.index]) {
          blocks[op.index].type = op.newType;
          refreshBlockElement(op.index);
        }
        break;
      case 'textUpdate':
        if (blocks[op.index]) {
          blocks[op.index].text = op.text;
          const el = getBlockEl(op.index);
          if (el) {
            if (el === document.activeElement) {
              // Preserve caret position for the active user
              const selection = window.getSelection();
              if (selection.rangeCount > 0) {
                const range = selection.getRangeAt(0);
                const offset = range.startOffset;
                el.textContent = op.text;
                // Try to restore caret
                try {
                  const newRange = document.createRange();
                  const textNode = el.childNodes[0] || el;
                  const newOffset = Math.min(offset, op.text.length);
                  newRange.setStart(textNode, newOffset);
                  newRange.collapse(true);
                  selection.removeAllRanges();
                  selection.addRange(newRange);
                } catch (e) {}
              } else {
                el.textContent = op.text;
              }
            } else {
              el.textContent = op.text;
            }
          }
        }
        break;
      case 'replaceBlocks':
        // op.startIndex, op.endIndex, op.newBlocks
        blocks.splice(op.startIndex, op.endIndex - op.startIndex + 1, ...op.newBlocks);
        rerenderFrom(Math.max(0, op.startIndex - 1));
        updateSceneNav();
        updateStatusBar();
        extractCharacterNames();
        break;
      case 'full':
        blocks = op.blocks;
        fullRerender();
        updateSceneNav();
        updateStatusBar();
        extractCharacterNames();
        break;
    }
  },
  updateTitle(t) { titleInput.value = t; },
  markClean,
};

// Boot
loadScript();

