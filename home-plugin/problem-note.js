const ROUND_HEADING =
  /^## (\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2})(?::\d{2})?)?\s*$/;

const PROBLEM_SECTION_HEADING = /^##\s+(.+?)\s*$/;

const CANON_SECTIONS = {
  表征: "represent",
  算子: "operators",
  策略: "strategies",
  执行: "attempts",
  验证: "feedback",
  存招: "move",
};

const REPRESENT_LABELS = {
  known: ["已知", "现状"],
  want: ["求", "想要"],
  constraint: ["约束"],
  stuck: ["卡在"],
};

const KIND_COPY = {
  stuck: {
    label: "卡题",
    represent: [
      { key: "known", label: "已知", prompt: "题里已经给了什么？" },
      { key: "want", label: "求", prompt: "要得到什么？" },
      { key: "constraint", label: "约束", prompt: "不能改的条件是什么？" },
      { key: "stuck", label: "卡在", prompt: "现在卡在哪一步？" },
    ],
    feedbackPrompt: "用了之后发生了什么？",
  },
  idea: {
    label: "想法",
    represent: [
      { key: "known", label: "现状", prompt: "现在是什么样？" },
      { key: "want", label: "想要", prompt: "想清楚之后会怎样？" },
      { key: "constraint", label: "约束", prompt: "时间、材料、规则上有什么限制？" },
      { key: "stuck", label: "卡在", prompt: "现在卡在哪一句？" },
    ],
    feedbackPrompt: "拿一份真材料试一次，结果如何？",
  },
};

const STUCK_MOVES = [
  { id: "restate", label: "重述", prompt: "换一种问法" },
  { id: "relax", label: "松约束", prompt: "哪条约束是你自己加的？" },
  { id: "chunk", label: "拆组块", prompt: "把哪一块拆开看？" },
  { id: "extreme", label: "特殊化·极端", prompt: "极端情况会怎样？" },
  { id: "backward", label: "反向", prompt: "假设结论成立，缺什么条件？" },
  { id: "analogy", label: "类比", prompt: "这像你做过的哪一类？" },
  { id: "reframe", label: "换表征", prompt: "换一张图 / 换一组符号" },
];

const ATTEMPT_RESULTS = [
  { id: "win", label: "成" },
  { id: "half", label: "半" },
  { id: "lose", label: "败" },
];

const RESULT_BY_LABEL = { 成: "win", 半: "half", 败: "lose" };
const LABEL_BY_RESULT = { win: "成", half: "半", lose: "败" };

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatProblemDate(now = new Date()) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}`;
}

function formatProblemStamp(now = new Date()) {
  return `${formatProblemDate(now)} ${pad(now.getHours())}:${pad(
    now.getMinutes()
  )}`;
}

function formatProblemIso(now = new Date()) {
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${formatProblemDate(now)}T${pad(now.getHours())}:${pad(
    now.getMinutes()
  )}:${pad(now.getSeconds())}${sign}${pad(Math.floor(abs / 60))}:${pad(
    abs % 60
  )}`;
}

function addDays(now, days) {
  const d = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + Number(days || 0)
  );
  return formatProblemDate(d);
}

function formatProblemWhen(heading, now = new Date()) {
  const m = String(heading || "").match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}:\d{2}))?/
  );
  if (!m) return heading || "";
  const key = `${m[1]}-${m[2]}-${m[3]}`;
  const time = m[4] || "";
  const today = formatProblemDate(now);
  const yest = addDays(now, -1);
  let day = `${Number(m[2])}月${Number(m[3])}日`;
  if (key === today) day = "今天";
  else if (key === yest) day = "昨天";
  return time ? `${day} ${time}` : day;
}

function titleFromPath(path) {
  const base = String(path || "").split("/").pop() || "";
  return base.replace(/\.md$/i, "").replace(/^\d{4}-\d{2}-\d{2}-/, "");
}

function splitFrontmatter(text) {
  const s = String(text || "").replace(/^\uFEFF/, "");
  if (!s.startsWith("---\n") && !s.startsWith("---\r\n")) {
    return { frontmatter: {}, body: s };
  }
  const end = s.search(/\r?\n---\r?\n/);
  if (end < 0) return { frontmatter: {}, body: s };
  const nl = s[end] === "\r" ? 2 : 1;
  const raw = s.slice(4, end).replace(/^\r\n?/, "");
  const body = s.slice(end + nl + 3).replace(/^\r?\n/, "");
  const frontmatter = {};
  for (const line of raw.split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!match) continue;
    frontmatter[match[1]] = match[2].trim().replace(/^['"]|['"]$/g, "");
  }
  return { frontmatter, body };
}

function trimBlock(text) {
  return String(text || "").replace(/^\s+|\s+$/g, "");
}

function asStringList(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  const one = String(value || "").trim();
  return one ? [one] : [];
}

function emptyRepresent() {
  return { known: [], want: [], constraint: [], stuck: [] };
}

function normalizeKind(raw) {
  return raw === "idea" ? "idea" : "stuck";
}

function normalizeStatus(raw) {
  if (raw === "resolved" || raw === "incubating" || raw === "stored") {
    return raw;
  }
  return "open";
}

function kindCopy(kind) {
  return KIND_COPY[normalizeKind(kind)];
}

function representLabelMap() {
  const map = {};
  for (const [key, labels] of Object.entries(REPRESENT_LABELS)) {
    for (const label of labels) map[label] = key;
  }
  return map;
}

const REPRESENT_KEY_BY_LABEL = representLabelMap();

function parseBulletLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-*]\s+/, "").trim())
    .filter(Boolean);
}

function parseLabeledLine(line) {
  const m = String(line || "").match(/^([^：:]{1,12})\s*[：:]\s*(.*)$/);
  if (!m) return null;
  return { label: m[1].trim(), value: m[2].trim() };
}

function parseRepresent(text) {
  const represent = emptyRepresent();
  for (const line of parseBulletLines(text)) {
    const labeled = parseLabeledLine(line);
    if (!labeled) continue;
    const key = REPRESENT_KEY_BY_LABEL[labeled.label];
    if (key && labeled.value) represent[key].push(labeled.value);
  }
  return represent;
}

function serializeRepresent(represent, kind) {
  const copy = kindCopy(kind);
  const lines = [];
  for (const field of copy.represent) {
    for (const item of asStringList(represent && represent[field.key])) {
      lines.push(`- ${field.label}：${item}`);
    }
  }
  return lines.join("\n");
}

function representFilled(represent) {
  if (!represent) return false;
  return ["known", "want", "constraint", "stuck"].some(
    (key) => asStringList(represent[key]).length
  );
}

function representFirst(represent, key) {
  return asStringList(represent && represent[key])[0] || "";
}

function normalizeWikiLink(raw) {
  const text = String(raw || "").trim();
  if (!text) return "";
  const match = text.match(/\[\[(.+?)\]\]/);
  const name = (match ? match[1] : text).split("|")[0].trim();
  return name ? `[[${name}]]` : "";
}

function wikiLinkName(link) {
  const match = String(link || "").match(/\[\[(.+?)\]\]/);
  if (match) return match[1].split("|")[0].trim();
  return String(link || "").trim();
}

function parseOperatorLine(line) {
  const text = String(line || "").trim();
  const linkMatch = text.match(/\[\[.+?\]\]/);
  const link = linkMatch ? normalizeWikiLink(linkMatch[0]) : "";
  let summary = text;
  if (linkMatch) {
    summary = text
      .replace(linkMatch[0], "")
      .replace(/\s*·\s*$/g, "")
      .replace(/^\s*·\s*/g, "")
      .trim();
  }
  return { summary, link };
}

function formatOperatorLine(op) {
  if (typeof op === "string") return formatOperatorLine(parseOperatorLine(op));
  const summary = String((op && op.summary) || "").trim();
  const link = normalizeWikiLink(op && op.link);
  if (summary && link) return `${summary} · ${link}`;
  return summary || link;
}

function operatorLabel(op) {
  return String((op && op.summary) || "").trim() || wikiLinkName(op && op.link);
}

function parseOperators(text) {
  return parseBulletLines(text)
    .map(parseOperatorLine)
    .filter((item) => item.summary || item.link);
}

function parseStrategyLine(line) {
  const text = String(line || "").trim();
  const structure = (text.match(/结构：\s*([^·]*)/) || [])[1];
  const ops = (text.match(/算子：\s*([^·]*)/) || [])[1];
  const action = (text.match(/做法：\s*(.+)$/) || [])[1];
  if (structure != null || ops != null || action != null) {
    return {
      structure: String(structure || "").trim(),
      operators: String(ops || "")
        .split(/[、,，]/)
        .map((item) => item.trim())
        .filter(Boolean),
      action: String(action || "").trim(),
    };
  }
  return { structure: "", operators: [], action: text };
}

function formatStrategyLine(item) {
  const parts = [];
  if (item.structure) parts.push(`结构：${item.structure}`);
  if ((item.operators || []).length) {
    parts.push(`算子：${item.operators.join("、")}`);
  }
  if (item.action) parts.push(`做法：${item.action}`);
  return parts.join(" · ");
}

function strategyFilled(item) {
  return !!(
    item &&
    (String(item.structure || "").trim() || String(item.action || "").trim())
  );
}

function parseStrategies(text) {
  return parseBulletLines(text).map(parseStrategyLine).filter(strategyFilled);
}

function parseFeedbackLine(line) {
  const retest = String(line || "").match(
    /^(\d{4}-\d{2}-\d{2})\s*·\s*(闭卷|回访)\s*·\s*(成|败)\s*(?:·\s*(.*))?$/
  );
  if (retest) {
    return {
      heading: retest[1],
      stamp: retest[1],
      result: RESULT_BY_LABEL[retest[3]],
      strategy: "",
      note: [retest[2], (retest[4] || "").trim()].filter(Boolean).join(" · "),
    };
  }
  const match = String(line || "").match(
    /^(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2})?)\s*·\s*(成|半|败)\s*(?:·\s*(.*))?$/
  );
  if (!match) return null;
  const rest = (match[3] || "").trim();
  const parts = rest ? rest.split(/\s*·\s*/) : [];
  let strategy = "";
  let note = rest;
  if (parts.length >= 2) {
    strategy = parts[0];
    note = parts.slice(1).join(" · ");
  }
  return {
    heading: match[1],
    stamp: match[1].includes("T") ? match[1] : match[1].replace(" ", "T"),
    result: RESULT_BY_LABEL[match[2]],
    strategy,
    note,
  };
}

function formatFeedbackLine(item) {
  const heading = item.heading || item.stamp || formatProblemStamp();
  const label = LABEL_BY_RESULT[item.result] || "半";
  const strategy = String(item.strategy || "").trim();
  const note = String(item.note || "").trim();
  if (strategy && note) return `${heading} · ${label} · ${strategy} · ${note}`;
  if (strategy) return `${heading} · ${label} · ${strategy}`;
  if (note) return `${heading} · ${label} · ${note}`;
  return `${heading} · ${label}`;
}

function parseFeedbackLines(text) {
  const items = [];
  for (const line of parseBulletLines(text)) {
    const parsed = parseFeedbackLine(line);
    if (parsed) items.push(parsed);
  }
  return items;
}

function parseMove(text) {
  const move = { trigger: "", action: "", why: "", bound: "" };
  const keys = {
    触发: "trigger",
    动作: "action",
    为什么: "why",
    边界: "bound",
  };
  for (const line of parseBulletLines(text)) {
    const labeled = parseLabeledLine(line);
    if (!labeled) continue;
    const key = keys[labeled.label];
    if (key) move[key] = labeled.value;
  }
  return move;
}

function moveFilled(move) {
  return !!(move && (move.trigger || move.action || move.why || move.bound));
}

function finalizeRound(current) {
  const heading = current.time
    ? `${current.date} ${current.time}`
    : current.date;
  return {
    heading,
    date: current.date,
    time: current.time,
    stamp: current.time ? `${current.date}T${current.time}` : current.date,
    body: trimBlock(current.lines.join("\n")),
  };
}

function parseProblemNote(text, path = "") {
  const { frontmatter, body } = splitFrontmatter(text);
  const lines = String(body || "").split(/\r?\n/);
  let i = 0;
  while (i < lines.length && !lines[i].trim()) i += 1;

  let title = "";
  if (lines[i] && /^#\s+/.test(lines[i])) {
    title = lines[i].replace(/^#\s+/, "").trim();
    i += 1;
    if (lines[i] === "") i += 1;
  }

  const lead = [];
  const records = [];
  const extras = [];
  const collected = {
    represent: [],
    operators: [],
    strategies: [],
    attempts: [],
    feedback: [],
    move: [],
  };

  let mode = "lead";
  let extra = null;
  let currentRound = null;

  const flushExtra = () => {
    if (!extra) return;
    extras.push({
      heading: extra.heading,
      body: trimBlock(extra.lines.join("\n")),
    });
    extra = null;
  };

  const flushRound = () => {
    if (!currentRound) return;
    records.push(finalizeRound(currentRound));
    currentRound = null;
  };

  for (; i < lines.length; i += 1) {
    const roundMatch = lines[i].match(ROUND_HEADING);
    if (roundMatch) {
      flushRound();
      flushExtra();
      mode = "record";
      currentRound = {
        date: roundMatch[1],
        time: roundMatch[2] || "",
        lines: [],
      };
      continue;
    }
    const sectionMatch = lines[i].match(PROBLEM_SECTION_HEADING);
    if (sectionMatch) {
      flushRound();
      flushExtra();
      const heading = sectionMatch[1];
      const canon = CANON_SECTIONS[heading];
      if (canon) {
        mode = canon;
        continue;
      }
      mode = "extra";
      extra = { heading, lines: [] };
      continue;
    }
    if (mode === "lead") lead.push(lines[i]);
    else if (mode === "record") currentRound.lines.push(lines[i]);
    else if (mode === "extra") extra.lines.push(lines[i]);
    else if (collected[mode]) collected[mode].push(lines[i]);
  }
  flushRound();
  flushExtra();

  const strategies = parseStrategies(collected.strategies.join("\n"));
  const move = parseMove(collected.move.join("\n"));
  if (moveFilled(move)) {
    strategies.push({
      structure: move.trigger || "",
      operators: [],
      action: move.action || move.why || "",
    });
  }

  const feedback = [
    ...parseFeedbackLines(collected.attempts.join("\n")),
    ...parseFeedbackLines(collected.feedback.join("\n")),
  ];

  return {
    title: title || titleFromPath(path) || "未命名问题",
    statement: trimBlock(lead.join("\n")),
    status: normalizeStatus(frontmatter.status),
    kind: normalizeKind(frontmatter.kind),
    subject: String(frontmatter.subject || "").trim(),
    created: frontmatter.created || "",
    updated: frontmatter.updated || "",
    due: /^\d{4}-\d{2}-\d{2}$/.test(frontmatter.due || "")
      ? frontmatter.due
      : "",
    type: frontmatter.type || "problem",
    represent: parseRepresent(collected.represent.join("\n")),
    operators: parseOperators(collected.operators.join("\n")),
    strategies,
    feedback,
    records,
    extras,
    rounds: records,
  };
}

function pushSection(lines, heading, body) {
  const text = trimBlock(body);
  if (!text) return;
  lines.push(`## ${heading}`, "", text, "");
}

function serializeProblemNote(problem) {
  const title = String(problem.title || "未命名问题").trim() || "未命名问题";
  const status = normalizeStatus(problem.status);
  const kind = normalizeKind(problem.kind);
  const created = problem.created || formatProblemIso();
  const updated = problem.updated || created;
  const subject = String(problem.subject || "").trim();
  const due = /^\d{4}-\d{2}-\d{2}$/.test(problem.due || "") ? problem.due : "";
  const lines = [
    "---",
    "type: problem",
    `kind: ${kind}`,
    `status: ${status}`,
  ];
  if (subject) lines.push(`subject: ${subject}`);
  lines.push(`created: ${created}`, `updated: ${updated}`);
  if (due) lines.push(`due: ${due}`);
  lines.push("---", "", `# ${title}`, "");

  const statement = trimBlock(problem.statement);
  if (statement) lines.push(statement, "");

  pushSection(lines, "表征", serializeRepresent(problem.represent, kind));
  pushSection(
    lines,
    "算子",
    (problem.operators || [])
      .map((item) => `- ${formatOperatorLine(item)}`)
      .join("\n")
  );
  pushSection(
    lines,
    "策略",
    (problem.strategies || [])
      .filter(strategyFilled)
      .map((item) => `- ${formatStrategyLine(item)}`)
      .join("\n")
  );
  pushSection(
    lines,
    "验证",
    (problem.feedback || [])
      .map((item) => `- ${formatFeedbackLine(item)}`)
      .join("\n")
  );

  for (const extra of problem.extras || []) {
    pushSection(lines, extra.heading, extra.body);
  }

  const records = problem.records || problem.rounds || [];
  for (const round of records) {
    const heading = String(round.heading || "").trim() || formatProblemStamp();
    lines.push(`## ${heading}`, "", trimBlock(round.body), "");
  }
  return lines.join("\n");
}

function problemPreview(text, max = 72) {
  const one = String(text || "").replace(/\s+/g, " ").trim();
  if (!one) return "";
  if (one.length <= max) return one;
  return `${one.slice(0, max).trimEnd()}…`;
}

function problemProgress(problem) {
  const flags = [
    representFilled(problem.represent),
    !!(problem.operators || []).length,
    (problem.strategies || []).some(strategyFilled),
    !!(problem.feedback || []).length,
  ];
  return {
    done: flags.filter(Boolean).length,
    total: 4,
    flags,
  };
}

function firstIncomplete(problem) {
  return problemProgress(problem).flags.findIndex((flag) => !flag);
}

function shouldNudge(feedback) {
  if (!feedback || feedback.length < 2) return false;
  const last = feedback[feedback.length - 1];
  const prev = feedback[feedback.length - 2];
  return last.result !== "win" && prev.result !== "win";
}

function isProblemDue(problem, now = new Date()) {
  if (normalizeStatus(problem.status) === "stored") return false;
  const due = String(problem.due || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(due)) return false;
  return due <= formatProblemDate(now);
}

function problemStatusLabel(status) {
  if (status === "stored") return "已存";
  if (status === "resolved") return "有策略";
  if (status === "incubating") return "放着";
  return "在想";
}

function problemListPreview(problem) {
  const stuck = representFirst(problem.represent, "stuck");
  if (stuck) return problemPreview(stuck);
  const strategy = (problem.strategies || []).find(strategyFilled);
  if (strategy) return problemPreview(strategy.action || strategy.structure);
  const latest = (problem.feedback || [])[(problem.feedback || []).length - 1];
  if (latest && latest.note) return problemPreview(latest.note);
  const records = problem.records || problem.rounds || [];
  const latestRecord = records[records.length - 1];
  if (latestRecord && latestRecord.body) return problemPreview(latestRecord.body);
  return problemPreview(problem.statement);
}

function isLongRound(body) {
  const text = String(body || "");
  if (!text) return false;
  return text.length > 280 || text.split(/\n/).length > 8;
}

function blankProblem(fields = {}) {
  return {
    title: fields.title || "未命名问题",
    statement: "",
    status: "open",
    kind: normalizeKind(fields.kind),
    subject: fields.subject || "",
    created: fields.created || "",
    updated: fields.updated || "",
    due: "",
    type: "problem",
    represent: emptyRepresent(),
    operators: [],
    strategies: [],
    feedback: [],
    records: [],
    extras: [],
    rounds: [],
  };
}

module.exports = {
  ATTEMPT_RESULTS,
  KIND_COPY,
  ROUND_HEADING,
  STUCK_MOVES,
  addDays,
  asStringList,
  blankProblem,
  emptyRepresent,
  firstIncomplete,
  formatFeedbackLine,
  formatOperatorLine,
  formatProblemDate,
  formatProblemIso,
  formatProblemStamp,
  formatProblemWhen,
  formatStrategyLine,
  isLongRound,
  isProblemDue,
  kindCopy,
  normalizeKind,
  normalizeStatus,
  normalizeWikiLink,
  operatorLabel,
  parseFeedbackLine,
  parseOperatorLine,
  parseProblemNote,
  parseStrategyLine,
  problemListPreview,
  problemPreview,
  problemProgress,
  problemStatusLabel,
  representFilled,
  representFirst,
  serializeProblemNote,
  shouldNudge,
  strategyFilled,
  titleFromPath,
  wikiLinkName,
};
