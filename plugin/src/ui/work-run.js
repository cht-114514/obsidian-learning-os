/**
 * Collapsed "已工作 …" summary for one assistant turn.
 */

const VERBS = [
  ['read', '读取', '正在读取', '已读取'],
  ['write', '写入', '正在写入', '已写入'],
  ['edit', '修改', '正在修改', '已修改'],
  ['patch', '修改', '正在修改', '已修改'],
  ['exec', '执行', '正在执行', '已执行'],
  ['bash', '执行', '正在执行', '已执行'],
  ['shell', '执行', '正在执行', '已执行'],
  ['search', '搜索', '正在搜索', '已搜索'],
  ['grep', '搜索', '正在搜索', '已搜索'],
  ['fetch', '获取', '正在获取', '已获取'],
  ['web', '获取', '正在获取', '已获取'],
];

function verbRow(name) {
  const key = String(name || '').toLowerCase();
  return VERBS.find(([token]) => key.includes(token)) || null;
}

/**
 * A path or "Read from …" title becomes a short note name.
 * The full string is kept for a tap-to-expand line.
 * @param {string} raw
 */
export function shortToolTarget(raw) {
  const full = String(raw || '').replace(/\s+/g, ' ').trim();
  let text = full.replace(
    /^(?:read from|reading|read|write to|wrote to|wrote|edit(?:ing)?|search(?:ing)?(?: for)?)\s+/i,
    ''
  ).trim();
  const pathLike = /[/\\]/.test(text) || text.startsWith('~');
  let name = text;
  if (pathLike) {
    const parts = text.split(/[/\\]/).filter(Boolean);
    name = parts[parts.length - 1] || text;
  }
  const stripped = name.replace(/\.(md|markdown|txt|canvas)$/i, '');
  const head = (stripped.split(/[：:]/)[0] || stripped).trim();
  const shortened = head !== stripped || head !== name;
  const display = !head ? '' : head.length > 12 ? `${head.slice(0, 12)}…` : shortened ? `${head}…` : head;
  return { name: display, full, pathLike };
}

/**
 * One line for the in-thread card, and a different short label for the stop strip,
 * so the same Read path is not printed twice.
 * @param {{ tools?: any[], status?: string }} [activity]
 * @returns {{ specific: boolean, card: string, strip: string, full: string }}
 */
export function liveActivityLine(activity) {
  const tools = activity?.tools || [];
  const active = [...tools].reverse().find((tool) => tool.phase !== 'done' && tool.phase !== 'error');
  const current = active || tools[tools.length - 1];
  if (!current) return { specific: false, card: '', strip: '', full: '' };
  const row = verbRow(current.name);
  const action = row ? row[1] : '调用';
  const short = shortToolTarget(current.title || current.args || current.name || '');
  const what = row?.[0] === 'read' ? `${action}笔记` : action;
  const card = short.name ? `正在做… ${what} · ${short.name}` : `正在做… ${what}`;
  return { specific: true, card, strip: '进行中', full: short.full };
}

/**
 * @param {{ name?: string, title?: string, phase?: string, args?: string }} tool
 */
export function describeTool(tool) {
  const row = verbRow(tool?.name);
  const phase = tool?.phase === 'error' ? 'error' : tool?.phase === 'done' ? 'done' : 'start';
  const verb = row ? (phase === 'done' ? row[3] : phase === 'start' ? row[2] : row[1]) : phase === 'done' ? '已调用' : '正在调用';
  const short = shortToolTarget(tool?.title || tool?.args || '');
  const target = short.name;
  return {
    verb,
    target,
    full: short.full,
    label: target ? `${verb} ${target}` : verb,
    phase,
  };
}

/**
 * @param {number} ms
 */
export function formatDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return '';
  if (ms < 1000) return '不到 1 秒';
  const total = Math.round(ms / 1000);
  if (total < 60) return `${total} 秒`;
  const m = Math.floor(total / 60);
  const s = total % 60;
  return s ? `${m} 分 ${s} 秒` : `${m} 分`;
}

function toolSpan(tools) {
  const starts = tools.map((tool) => tool.startedAt).filter((n) => n > 0);
  const ends = tools.map((tool) => tool.endedAt).filter((n) => n > 0);
  if (!starts.length || !ends.length) return null;
  const span = Math.max(...ends) - Math.min(...starts);
  return span > 0 ? span : null;
}

/**
 * @param {{ reasoning?: string, status?: string, tools?: any[], startedAt?: number }} activity
 * @param {{ streaming?: boolean, now?: number }} [opts]
 */
export function workHeadline(activity, opts = {}) {
  const tools = activity?.tools || [];
  const streaming = !!opts.streaming;
  if (streaming) {
    const line = liveActivityLine(activity);
    if (line.specific) return line.card;
    return activity?.status || '思考中';
  }
  if (!tools.length) return activity?.reasoning ? '思考过程' : '';
  const n = tools.length;
  const calls = n === 1 ? '1 次工具调用' : `${n} 次工具调用`;
  const dur = formatDuration(toolSpan(tools));
  return dur ? `已工作 ${dur} · ${calls}` : calls;
}

/**
 * @param {HTMLElement} parent Obsidian-enhanced element
 * @param {any} activity
 * @param {{ streaming?: boolean }} [opts]
 */
export function renderWorkRun(parent, activity, opts = {}) {
  const wasOpen = !!parent.querySelector?.('details.aos-work')?.open;
  const openPaths = new Set(
    [...(parent.querySelectorAll?.('.aos-work-path:not([hidden])') || [])].map((el) => el.textContent || '')
  );
  parent.empty();
  const tools = activity?.tools || [];
  const reasoning = String(activity?.reasoning || '').trim();
  const streaming = !!opts.streaming;
  if (parent.dataset) parent.dataset.aosLive = streaming ? '1' : '';
  const headline = workHeadline(activity, { streaming });
  if (!headline && !tools.length && !reasoning) return;

  const details = parent.createEl('details', { cls: `aos-work${streaming ? ' is-live' : ''}` });
  // Stay collapsed unless the person opened it. A running turn is one line
  // until they tap; that open state survives later refreshes.
  if (wasOpen) details.setAttr('open', 'open');
  const summary = details.createEl('summary', { cls: 'aos-work-summary' });
  if (streaming) summary.createSpan({ cls: 'aos-live-dot' });
  summary.createSpan({ cls: 'aos-work-title', text: headline });

  const body = details.createDiv({ cls: 'aos-work-body' });
  if (tools.length) {
    const list = body.createDiv({ cls: 'aos-work-list' });
    for (const tool of tools) {
      const described = describeTool(tool);
      const row = list.createDiv({ cls: `aos-work-tool is-${described.phase}` });
      row.createSpan({ cls: 'aos-work-mark' });
      row.createSpan({ cls: 'aos-work-verb', text: described.verb });
      if (described.target) row.createSpan({ cls: 'aos-work-target', text: described.target });
      if (described.full && described.full !== described.target) {
        row.setAttr('title', described.full);
        const path = row.createDiv({ cls: 'aos-work-path', text: described.full });
        path.hidden = !openPaths.has(described.full);
        row.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
          path.hidden = !path.hidden;
        });
      }
    }
  }
  if (reasoning) {
    const thought = body.createEl('details', { cls: 'aos-thought' });
    thought.createEl('summary', { text: '思考过程' });
    thought.createDiv({ cls: 'aos-thought-text', text: reasoning });
  }
}
