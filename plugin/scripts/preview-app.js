/**
 * Browser entry for the phone preview. Mocks the Obsidian element helpers.
 */
import { mountAgentApp } from '../src/ui/app-view.js';
import { createCompanionController } from '../src/ui/companion/shell.js';
import { previewMessages, previewNow, previewSessions, previewSkills } from '../tests/fixtures/mobile-preview-state.js';

function enhance(el) {
  if (!el || el.__aos) return el;
  el.__aos = true;
  el.createDiv = (opts) => make('div', opts, el);
  el.createEl = (tag, opts) => make(tag, opts, el);
  el.createSpan = (opts) => make('span', opts, el);
  el.empty = () => {
    el.replaceChildren();
  };
  el.addClass = (name) => el.classList.add(name);
  el.removeClass = (name) => el.classList.remove(name);
  el.toggleClass = (name, on) => el.classList.toggle(name, on);
  el.hasClass = (name) => el.classList.contains(name);
  el.setText = (text) => {
    el.textContent = text ?? '';
  };
  el.setAttr = (key, value) => el.setAttribute(key, value);
  return el;
}

function make(tag, opts, parent) {
  const el = enhance(document.createElement(tag));
  if (opts?.cls) el.className = opts.cls;
  if (opts?.text != null) el.textContent = opts.text;
  if (opts?.attr) {
    for (const [key, value] of Object.entries(opts.attr)) el.setAttribute(key, value);
  }
  parent?.appendChild(el);
  return el;
}

function miniMarkdown(markdown) {
  const escaped = String(markdown)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  return escaped
    .split(/\n\n/)
    .map((block) => {
      if (block.startsWith('|')) {
        const rows = block.split('\n').filter((row) => !/^\|\s*-+/.test(row.trim()));
        const cells = rows.map(
          (row) => `<tr>${row.split('|').filter((cell) => cell.trim()).map((cell) => `<td>${cell.trim()}</td>`).join('')}</tr>`
        );
        return `<table>${cells.join('')}</table>`;
      }
      if (block.startsWith('```')) {
        const code = block.replace(/^```.*\n?/, '').replace(/```$/, '');
        return `<pre><code>${code}</code></pre>`;
      }
      return `<p>${block.replace(/\n/g, '<br>')}</p>`;
    })
    .join('');
}

function fakePlugin(mode) {
  const live = mode !== 'offline' && mode !== 'pairing';
  return {
    settings: {
      agentName: 'Agent',
      agentId: 'main',
      quiet: false,
      skills: previewSkills.map((skill) => skill.id),
      hideMobileNavbar: (() => {
        const q = new URLSearchParams(
          location.hash.includes('&') ? location.hash.slice(location.hash.indexOf('&') + 1) : location.search.slice(1)
        );
        return q.get('hideNav') === '1';
      })(),
    },
    kernelModels: [{ id: 'default', name: 'Default' }],
    thinkingChoices: () => [
      { id: 'off', label: '关闭' },
      { id: 'low', label: '低' },
      { id: 'high', label: '高' },
    ],
    resolveOutgoingThinking: () => 'off',
    connectionPrefs: () => ({ model: 'default' }),
    ensureOperator: async () => null,
    takeChatLaunch: () => null,
    sessionStore: () => memorySessionStore,
    operator: {
      status: {
        state: mode === 'pairing' ? 'pairing' : live ? 'live' : 'offline',
        message: mode === 'pairing' ? '在运行插件的电脑上批准这台设备' : live ? '已连接' : '网关不在线',
        approveCommand: mode === 'pairing' ? 'openclaw devices approve demo' : '',
      },
      onStatus: () => () => {},
      prompt: async () => ({ runId: 'preview' }),
    },
  };
}

const memorySessionStore = (() => {
  const pending = {};
  const transcripts = {};
  return {
    loadTranscript: (key) => transcripts[key] || [],
    saveTranscript(key, rows) {
      transcripts[key] = rows;
    },
    saveSessions() {},
    saveActiveKey() {},
    loadSessions: () => [],
    loadActiveKey: () => '',
    listPending: (key) => Object.values(pending).filter((row) => !key || row.sessionKey === key),
    pendingFor: (id) => pending[id] || null,
    activePending(key) {
      return this.listPending(key).filter((row) => row.status !== 'sent');
    },
    saveTurnWithPending(sessionKey, messages, record) {
      pending[record.turnId] = { status: 'queued', attempts: 0, ...record, sessionKey };
      transcripts[sessionKey] = messages;
      return { ok: true, record: pending[record.turnId] };
    },
    markSending(id) {
      if (pending[id]) pending[id].status = 'sending';
      return { ok: true };
    },
    markSent(id) {
      if (pending[id]) pending[id].status = 'sent';
      return { ok: true };
    },
    markUnknown(id) {
      if (pending[id]) pending[id].status = 'unknown';
      return { ok: true };
    },
    markFailed(id, reason) {
      if (pending[id]) {
        pending[id].status = 'failed';
        pending[id].reason = reason || '';
      }
      return { ok: true };
    },
    markPending(id, patch) {
      if (pending[id]) Object.assign(pending[id], patch || {});
      return pending[id] || null;
    },
    markQueuedForRetry(id) {
      if (pending[id]) pending[id].status = 'queued';
      return { ok: true };
    },
    dropTurn(id) {
      delete pending[id];
      return { ok: true };
    },
  };
})();

function installDomHelpers() {
  const proto = HTMLElement.prototype;
  if (proto.createDiv) return;
  proto.createDiv = function (opts) {
    return make('div', opts, this);
  };
  proto.createEl = function (tag, opts) {
    return make(tag, opts, this);
  };
  proto.createSpan = function (opts) {
    return make('span', opts, this);
  };
  proto.empty = function () {
    this.replaceChildren();
  };
  proto.addClass = function (name) {
    this.classList.add(name);
  };
  proto.removeClass = function (name) {
    this.classList.remove(name);
  };
  proto.toggleClass = function (name, on) {
    this.classList.toggle(name, on);
  };
  proto.hasClass = function (name) {
    return this.classList.contains(name);
  };
  proto.setText = function (text) {
    this.textContent = text ?? '';
  };
  proto.setAttr = function (key, value) {
    this.setAttribute(key, value);
  };
}

const hashBody = (location.hash || '#peek').replace(/^#/, '');
const mode = hashBody.split('&')[0] || 'peek';
const theme = new URLSearchParams(hashBody.includes('&') ? hashBody.slice(hashBody.indexOf('&') + 1) : location.search).get('theme');
document.body.classList.add('is-mobile', 'is-phone', theme === 'light' ? 'theme-light' : 'theme-dark');

const host = enhance(document.getElementById('app'));
const plugin = fakePlugin(mode);
const chatModes = new Set(['chat', 'drawer', 'pairing', 'tools', 'empty', 'offline', 'history']);
const surface = new URLSearchParams(hashBody.includes('&') ? hashBody.slice(hashBody.indexOf('&') + 1) : '').get('surface');

function mountChatPreview() {
  const which = mode === 'tools' ? 'tools' : mode === 'empty' || mode === 'offline' || mode === 'pairing' || mode === 'drawer' ? 'empty' : 'thread';
  mountAgentApp(host, {
    app: { isMobile: true, vault: { getAbstractFileByPath: () => null } },
    plugin,
    mode: 'fullscreen',
    preview: {
      sessions: previewSessions,
      messages: mode === 'history' ? previewMessages('thread') : previewMessages(which),
      activeKey: 'agent:main:main',
      drawer: mode === 'drawer',
      keyboard: '',
      now: previewNow,
    },
    MarkdownRenderer: {
      render: async (_app, markdown, el) => {
        el.innerHTML = miniMarkdown(markdown);
      },
    },
    Notice: (message) => {
      document.body.dataset.notice = String(message || '');
    },
  });
}

function mountCompanionPreview() {
  installDomHelpers();
  const poem = '莽莽万重山，孤城山谷间。\n无风云出塞，不夜月临关。\n属国归何晚，楼兰斩未还。';
  const note = host.createDiv({ cls: 'markdown-preview-view aos-preview-note' });
  note.createEl('h1', { text: '诗歌鉴赏' });
  for (const line of poem.split('\n')) note.createEl('p', { text: line });
  const editor = {
    getSelection: () => '无风云出塞，不夜月临关。',
    getCursor: () => ({ line: 1, ch: 0 }),
    getValue: () => poem,
    coordsAtPos: () => ({ left: 48, right: 250, top: 196, bottom: 228 }),
  };
  const app = {
    workspace: {
      getActiveViewOfType: () => ({
        file: { path: '诗.md', basename: '诗歌鉴赏' },
        editor,
      }),
      on: () => ({ id: 'preview' }),
    },
    vault: { getAbstractFileByPath: () => null, read: async () => poem },
  };
  const state = {
    sessions: previewSessions,
    activeKey: 'agent:main:main',
    messages: previewMessages('thread'),
    busy: false,
    progressLabel: '',
    startedAt: 0,
  };
  plugin.ensureChatController = () => ({
    state,
    connectionState: () => ({ state: 'live' }),
    subscribe: () => () => {},
    attachView: () => () => {},
    loadLocalCache() {},
    refreshSessions: async () => {},
    send: async () => ({ ok: true }),
    abort() {},
    regenerate() {},
    continueRecent() {},
    pendingAction() {},
  });
  plugin.registerEvent = () => {};
  plugin.isChatViewActive = () => false;
  plugin.activateView = () => {};
  plugin.settings.commandBarEnabled = true;
  plugin.settings.activeNoteMaxChars = 4000;
  plugin.setConnectionPrefs = async () => {};
  plugin.setKernelModel = () => {};
  const companion = createCompanionController(app, plugin, {
    Notice: (message) => {
      document.body.dataset.notice = String(message || '');
    },
    MarkdownRenderer: {
      render: async (_app, markdown, el) => {
        el.innerHTML = miniMarkdown(markdown);
      },
    },
    previewViewport:
      mode === 'keyboard'
        ? () => ({
            width: window.innerWidth,
            height: Math.max(280, Math.round(window.innerHeight * 0.46)),
            offsetTop: 0,
            offsetLeft: 0,
            scale: 1,
          })
        : null,
  });
  if (mode === 'expanded' || mode === 'keyboard') companion.expand();
  else if (mode === 'capsule') companion.collapse();
  else companion.open();
}

if (surface === 'chat' || chatModes.has(mode)) mountChatPreview();
else mountCompanionPreview();
