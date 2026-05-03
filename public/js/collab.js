/* collab.js — Real-time collaboration layer
   WebSocket-based: presence awareness, op broadcasting, auto-reconnect
*/

let ws = null;
let reconnectTimer = null;
let clientId = null;
let isConnected = false;
let pendingOps = [];

const connIndicator = document.getElementById('conn-indicator');
const presenceBar = document.getElementById('presence-bar');

window.ScriptCollab = {
  isConnected: () => isConnected,
  send(msg) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else {
      pendingOps.push(msg);
    }
  },
  broadcastOp(op) {
    this.send({ type: 'doc-update', ops: [op] });
  }
};

function initCollab(scriptId, user) {
  const token = Auth.getToken();
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${proto}//${window.location.host}/collab?scriptId=${scriptId}&token=${encodeURIComponent(token)}`;

  connect(wsUrl);
}

function connect(url) {
  if (ws) { try { ws.close(); } catch {} }

  ws = new WebSocket(url);

  ws.addEventListener('open', () => {
    isConnected = true;
    setConnStatus(true);

    // Flush pending ops
    pendingOps.forEach(op => ws.send(JSON.stringify(op)));
    pendingOps = [];
  });

  ws.addEventListener('message', (event) => {
    let msg;
    try { msg = JSON.parse(event.data); } catch { return; }

    switch (msg.type) {
      case 'init':
        clientId = msg.clientId;
        // Server sends initial content — merge if editor already has blocks
        // (prefer server content as source of truth on initial load)
        if (msg.content && Array.isArray(msg.content)) {
          window.ScriptEditor?.applyRemoteOp({ type: 'full', blocks: msg.content });
        }
        if (msg.title) window.ScriptEditor?.updateTitle(msg.title);
        break;

      case 'doc-update':
        // Apply remote operations (ignore our own echoes)
        if (msg.clientId !== clientId && msg.ops) {
          msg.ops.forEach(op => window.ScriptEditor?.applyRemoteOp(op));
        }
        break;

      case 'presence':
        renderPresence(msg.clients);
        break;

      case 'saved':
        window.ScriptEditor?.markClean();
        break;

      case 'awareness':
        // Cursor awareness (future enhancement)
        break;
    }
  });

  ws.addEventListener('close', (event) => {
    isConnected = false;
    setConnStatus(false);
    if (event.code !== 4001 && event.code !== 4003) {
      // Auto-reconnect with backoff
      clearTimeout(reconnectTimer);
      reconnectTimer = setTimeout(() => connect(url), 3000);
    }
  });

  ws.addEventListener('error', () => {
    isConnected = false;
    setConnStatus(false);
  });
}

function setConnStatus(online) {
  connIndicator.textContent = online ? '⬤ Online' : '⬤ Offline';
  connIndicator.className = 'conn-indicator ' + (online ? 'online' : 'offline');
}

function renderPresence(clients) {
  presenceBar.innerHTML = '';
  if (!clients || clients.length === 0) return;

  clients.slice(0, 8).forEach(client => {
    if (!client?.user) return;
    const avatar = document.createElement('div');
    avatar.className = 'presence-avatar';
    avatar.style.background = client.user.color || '#c9a84c';
    avatar.title = client.user.name;
    avatar.textContent = (client.user.name || '?').charAt(0).toUpperCase();
    presenceBar.appendChild(avatar);
  });
}

window.initCollab = initCollab;
