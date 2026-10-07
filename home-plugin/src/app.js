const {
  Plugin,
  ItemView,
  Modal,
  Notice,
  PluginSettingTab,
  Setting,
  TFolder,
  TFile,
  Platform,
  setIcon,
  requestUrl,
} = require("obsidian");

const {
  TIMEBOX_ABANDON_MIN_MS,
  TimeboxEngine,
  clampDurationMs: clampTimeboxDurationMs,
  clampPresetMinutes: clampTimeboxPresetMinutes,
  createDefaultTimebox,
  formatFocusDuration,
  formatRemaining,
  formatTimeboxMinutes,
  formatTimeboxStatusBar,
  normalizeTimebox,
  mergeSessions: mergeTimeboxSessions,
  normalizeSession: normalizeTimeboxSession,
  parseTimeboxPresetMinutes,
  pruneSessions: pruneTimeboxSessions,
  summarizeTimeboxStats,
  timeboxProgressRatio,
  timeboxSessionId,
} = require("../timebox.js");
const {
  COMPOUND_DIR,
  COMPOUND_FIELD_MAX,
  COMPOUND_FIELDS,
  COMPOUND_TITLE,
  addCompoundDays,
  compoundDayEquals,
  compoundDayKeyFromTime,
  compoundDaysInWeek,
  compoundWeekLabel,
  compoundWeekPath,
  compoundWeekStart,
  compoundWeekdayLabel,
  emptyCompoundDay,
  isCompoundWeekNote,
  mergeCompoundDay,
  normalizeCompoundDay,
  parseCompoundDay,
  parseCompoundWeek,
  renderCompoundWeek,
  summarizeCompoundDay,
  yesterdayCompoundChange,
} = require("../compound.js");
const {
  HONGLOU_PUSH_FOLDER,
  LIBRARY_EXCLUDE_DIRS,
  LIBRARY_ROOT,
  REVIEW_LEDGER_PATH,
  buildLexiQueueItems,
  isLibraryArticlePath,
  ledgerEntryForArticle,
  ledgerEntryForHonglouRead,
  libraryArticleCategory,
  normalizeLedgerEntry,
  listDueProseEntries,
  normalizeLedger,
  pickDueProse,
  proseDueAfterGrade,
  shouldHideSubjectChild,
  staggerHonglouBackfill,
} = require("../review-queue.js");


const VIEW_TYPE_HOME = "meinc-home";
const MAILBOX_NOTE = "agent-inbox/meinc-mailbox/INBOX.md";
const MAILBOX_THREADS = "agent-inbox/meinc-mailbox/threads";
const MAILBOX_ACK = "agent-inbox/meinc-mailbox/ACK.md";
const MAILBOX_INBOX_DONE = "agent-inbox/meinc-mailbox/inbox-done.json";
const MAILBOX_TITLE = "AI 信箱";
const MAILBOX_WAKE_DEBOUNCE_MS = 1500;
const WAKE_ON_READ_STREAMS = new Set(["check-push"]);
const MAILBOX_RECIPIENTS = [
  "CEO",
  "Critic",
  "语文",
  "数理化",
  "首席信息官",
  "all",
];

const SUBJECTS = ["语文", "数学", "英语", "物理", "化学", "地理"];

const HOME_TILES = [
  { id: "agent", name: "Agent", icon: "sparkles", tint: "indigo", size: "wide" },
  { id: "review", name: "复习", icon: "rotate-cw", tint: "blue", size: "hero" },
  {
    id: "subjects",
    name: "学习/输出",
    path: "基础学科",
    icon: "graduation-cap",
    tint: "indigo",
    size: "hero",
  },
  { id: "inbox", name: "AI 信箱", icon: "inbox", tint: "teal", size: "wide" },
  { id: "folder", name: "手记", path: "手记", icon: "pencil", tint: "orange" },
  { id: "folder", name: "项目库", path: "项目库", icon: "folder", tint: "green" },
  { id: "today", name: "今日日记", icon: "calendar", tint: "red" },
  { id: "folder", name: "资料库", path: "资料库", icon: "archive", tint: "purple" },
];

const INBOX_STREAMS = [
  {
    id: "honglou",
    name: "红楼梦",
    folder: "基础学科/语文/红楼梦/每日推送",
    type: "read",
    tint: "orange",
    icon: "book-open",
  },
  {
    id: "check-push",
    name: "核验推送",
    folder: "项目库/高考工程/核验推送",
    type: "read",
    tint: "red",
    icon: "list-checks",
  },
  {
    id: "hotbrief",
    name: "热点早报",
    folder: "项目库/信息收集",
    type: "read",
    tint: "blue",
    icon: "newspaper",
    match: "每日热点早报",
  },
  {
    id: "grok-reply",
    name: "Grokbot 回信",
    folder: MAILBOX_THREADS,
    type: "read",
    tint: "indigo",
    icon: "mail",
    skipNames: ["README"],
  },
];

const SUBJECT_TINTS = ["orange", "blue", "green", "indigo", "teal", "yellow"];

const SKIP_NAMES = new Set([".DS_Store"]);
const PINNED_BOTTOM = new Set(["_模板"]);
const NOTE_EXT = new Set(["md", "canvas"]);
const WRITE_ROOTS = ["基础学科", "手记", "项目库", "资料库"];

const INBOX_SEED_KEEP_UNREAD = 4;
const TIMEBOX_SESSIONS_DIR = "agent-inbox/meinc-timebox";
const TIMEBOX_SESSION_SAVE_DEBOUNCE_MS = 800;

const DEFAULT_SETTINGS = {
  openOnStart: true,
  inboxSeeded: false,
  inboxBackfillRecent: false,
  inboxDone: {},
  mailboxWebhookUrl: "",
  mailboxSenderKey: "",
  timeboxDefaultMin: 15,
  timeboxPresetsText: "5, 10, 15, 25, 45",
  timeboxRememberLastDuration: true,
  timeboxLastDurationMs: null,
  timeboxDailyGoal: 4,
  timeboxExtendStepMin: 5,
  timeboxStartSoundOn: true,
  timeboxEndSoundOn: true,
  timeboxSoundOn: true,
  timeboxDeviceId: "",
  timebox: createDefaultTimebox(15),
};

function applyMeincHomeTheme(el) {
  if (!el) return;
  el.style.setProperty("--home-text", "var(--text-normal, #1d1d1f)");
  el.style.setProperty("--home-muted", "var(--text-muted, var(--text-faint, #6e6e73))");
  el.style.setProperty("--home-surface", "var(--background-primary, #ffffff)");
  el.style.setProperty("--home-line", "var(--background-modifier-border, rgba(0, 0, 0, 0.08))");
  el.style.setProperty(
    "--home-track",
    "color-mix(in srgb, var(--home-muted) 18%, transparent)"
  );
}

function formatHomeDate(now = new Date()) {
  const weeks = [
    "星期日",
    "星期一",
    "星期二",
    "星期三",
    "星期四",
    "星期五",
    "星期六",
  ];
  return {
    weekday: weeks[now.getDay()],
    date: `${now.getMonth() + 1} 月 ${now.getDate()} 日`,
  };
}

function displayName(file) {
  if (file instanceof TFolder) return file.name;
  if (file instanceof TFile) return file.basename;
  return String(file?.name || "").replace(/\.(md|canvas)$/i, "");
}

function isHiddenName(name) {
  return !name || name.startsWith(".") || SKIP_NAMES.has(name);
}

function childCount(folder) {
  if (!(folder instanceof TFolder)) return 0;
  return folder.children.filter((c) => !isHiddenName(c.name)).length;
}

function descendantCount(folder) {
  if (!(folder instanceof TFolder)) return 0;
  let n = 0;
  for (const child of folder.children) {
    if (isHiddenName(child.name)) continue;
    n += 1;
    if (child instanceof TFolder) n += descendantCount(child);
  }
  return n;
}

function inboxDateFromFile(app, file) {
  const fromName = String(file?.basename || "").match(/^(\d{4}-\d{2}-\d{2})/);
  if (fromName) return fromName[1];
  const raw = app.metadataCache.getFileCache(file)?.frontmatter?.date;
  if (!raw) return "";
  const match = String(raw).match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : String(raw).slice(0, 10);
}

function inboxTitle(file, dateStr) {
  let name = file instanceof TFile ? file.basename : displayName(file);
  if (dateStr && name.startsWith(dateStr)) {
    name = name.slice(dateStr.length).replace(/^[-_\s]+/, "");
  }
  return name || displayName(file);
}

function formatInboxDate(dateStr) {
  const match = String(dateStr || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return dateStr || "";
  return `${Number(match[2])}月${Number(match[3])}日`;
}

function inboxStreamAccepts(stream, file) {
  const name = String(file?.basename || "");
  if (stream.skipNames && stream.skipNames.includes(name)) return false;
  if (stream.match && !name.includes(stream.match)) return false;
  return true;
}

function inboxStreamForFile(file) {
  const path = String(file?.path || "");
  if (!path) return null;
  for (const stream of INBOX_STREAMS) {
    const folder = stream.folder;
    if (path !== folder && !path.startsWith(`${folder}/`)) continue;
    if (!inboxStreamAccepts(stream, file)) continue;
    return stream;
  }
  return null;
}

function formatInboxAckStamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  const offsetMin = -now.getTimezoneOffset();
  const sign = offsetMin >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMin);
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )}T${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(
    now.getSeconds()
  )}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

function formatInboxAckLine({ stream, path, now }) {
  const id = stream?.id || "unknown";
  return `- ${formatInboxAckStamp(now)} inbox_read ${id} ${path}`;
}

function formatMailboxStamp(now = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(
    now.getDate()
  )} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function formatMailboxBlock({ to, body, notePath, now }) {
  const who = String(to || "CEO").replace(/^@/, "");
  const lines = [`---`, `### ${formatMailboxStamp(now)} @${who}`, body.trim()];
  const path = String(notePath || "").trim();
  if (path) lines.push(`相关笔记路径：${path}`);
  lines.push("---", "");
  return lines.join("\n");
}

function mailboxContentHash(text) {
  let h = 5381;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h) ^ s.charCodeAt(i);
  }
  return (h >>> 0).toString(16);
}

function mailboxPreview(text) {
  return String(text || "").slice(-200);
}

function normalizeMailboxWebhookUrl(raw) {
  return String(raw || "").trim();
}

function normalizeMailboxSenderKey(raw) {
  return String(raw || "")
    .trim()
    .replace(/^Authorization:\s*/i, "")
    .replace(/^Bearer\s+/i, "")
    .trim();
}

function mailboxWebhookProblem(url, key) {
  const u = normalizeMailboxWebhookUrl(url);
  const k = normalizeMailboxSenderKey(key);
  if (!u || !k) return "先在设置里贴 Grokbot Webhook URL 和 key";
  if (/^grokbot:/i.test(u) || /target=webhook-url/i.test(u)) {
    return "这是 Grok Bot 跳转链接，不是 POST 地址。请复制 https://api2.cursor.sh/automations/webhook/…";
  }
  if (!/^https:\/\//i.test(u)) return "Webhook URL 必须是 https:// 开头";
  if (/^grokbot:/i.test(k) || /target=webhook-key/i.test(k)) {
    return "这是 key 的跳转链接。请复制 crsr_ 开头的 sender key";
  }
  return "";
}

function countMeta(n) {
  if (!n) return "";
  return `${n} 项`;
}

function sortByName(a, b) {
  return displayName(a).localeCompare(displayName(b), "zh-CN");
}

function cloneNav(nav) {
  return (nav || []).map((s) => Object.assign({}, s));
}

function isWritablePath(p) {
  if (!p) return false;
  return WRITE_ROOTS.some((root) => p === root || p.startsWith(root + "/"));
}

function sanitizeName(raw) {
  return String(raw || "")
    .trim()
    .replace(/[\\/:*?"<>|]/g, "")
    .replace(/\s+/g, " ");
}

function uniquePath(app, folderPath, name, ext) {
  const base = ext ? `${folderPath}/${name}.${ext}` : `${folderPath}/${name}`;
  if (!app.vault.getAbstractFileByPath(base)) return base;
  let i = 2;
  while (
    app.vault.getAbstractFileByPath(
      ext ? `${folderPath}/${name} ${i}.${ext}` : `${folderPath}/${name} ${i}`
    )
  ) {
    i++;
  }
  return ext ? `${folderPath}/${name} ${i}.${ext}` : `${folderPath}/${name} ${i}`;
}

function isSelfOrDescendant(fromPath, destPath) {
  return destPath === fromPath || destPath.startsWith(fromPath + "/");
}

class ReviewArticlePickerModal extends Modal {
  constructor(app, plugin, paths, onPick) {
    super(app);
    this.plugin = plugin;
    this.paths = paths;
    this.onPick = onPick;
  }

  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-home-review-picker");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText("加入文章");
    const { contentEl } = this;
    const list = contentEl.createDiv({ cls: "meinc-home-group" });
    const max = 80;
    const shown = this.paths.slice(0, max);
    shown.forEach((path, index) => {
      const file = this.app.vault.getAbstractFileByPath(path);
      const row = list.createDiv({
        cls: "meinc-home-row",
        attr: { role: "button", tabindex: "0" },
      });
      row.style.setProperty("--i", String(index));
      const body = row.createDiv({ cls: "meinc-home-row-body" });
      body.createDiv({
        cls: "meinc-home-row-name",
        text: file instanceof TFile ? displayName(file) : path,
      });
      body.createDiv({
        cls: "meinc-home-row-meta",
        text: libraryArticleCategory(path),
      });
      row.onclick = () => {
        this.close();
        void this.onPick(path);
      };
    });
    if (this.paths.length > max) {
      contentEl.createDiv({
        cls: "meinc-home-empty-sub",
        text: `只显示前 ${max} 篇，可在资料库搜索后从笔记菜单加入`,
      });
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

class NameModal extends Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts;
    this.value = opts.initial || "";
  }

  onOpen() {
    this.modalEl.addClass("meinc-home-modal");
    this.titleEl.setText(this.opts.title || "名称");
    const { contentEl } = this;
    const input = contentEl.createEl("input", {
      cls: "meinc-home-name-input",
      type: "text",
      attr: { placeholder: this.opts.placeholder || "" },
    });
    input.value = this.value;
    input.addEventListener("input", () => {
      this.value = input.value;
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.submit();
      }
    });

    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.onclick = () => this.close();
    const ok = actions.createEl("button", {
      cls: "mod-cta",
      text: this.opts.confirm || "创建",
    });
    ok.onclick = () => this.submit();
    if (!Platform.isMobile) setTimeout(() => input.focus(), 20);
  }

  submit() {
    const name = sanitizeName(this.value);
    if (!name) {
      new Notice("名称不能为空");
      return;
    }
    this.close();
    this.opts.onSubmit(name);
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ActionSheet extends Modal {
  constructor(app, title, actions) {
    super(app);
    this.sheetTitle = title;
    this.actions = actions;
  }

  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-home-sheet");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText(this.sheetTitle || "");
    const { contentEl } = this;
    for (const action of this.actions) {
      const btn = contentEl.createEl("button", {
        cls: "meinc-home-sheet-btn" + (action.danger ? " is-danger" : ""),
        text: action.name,
      });
      btn.onclick = async () => {
        this.close();
        await action.onClick();
      };
    }
    const cancel = contentEl.createEl("button", {
      cls: "meinc-home-sheet-cancel",
      text: "取消",
    });
    cancel.onclick = () => this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class ConfirmModal extends Modal {
  constructor(app, opts) {
    super(app);
    this.opts = opts || {};
  }

  onOpen() {
    this.modalEl.addClass("meinc-home-modal");
    this.titleEl.setText(this.opts.title || "确认");
    const { contentEl } = this;
    if (this.opts.message) {
      contentEl.createEl("p", {
        cls: "meinc-home-confirm-msg",
        text: this.opts.message,
      });
    }
    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.onclick = () => this.close();
    const ok = actions.createEl("button", {
      cls: this.opts.danger ? "mod-warning" : "mod-cta",
      text: this.opts.confirmText || "确认",
    });
    ok.onclick = async () => {
      this.close();
      if (this.opts.onConfirm) await this.opts.onConfirm();
    };
  }

  onClose() {
    this.contentEl.empty();
  }
}

class MovePickerModal extends Modal {
  constructor(app, plugin, file) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.folderPath = file.parent?.path || "";
    if (!isWritablePath(this.folderPath)) this.folderPath = "";
  }

  onOpen() {
    this.modalEl.addClass("meinc-home-modal");
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();
    this.titleEl.setText("移动到");

    const here = this.folderPath || "选择位置";
    contentEl.createDiv({
      cls: "meinc-home-move-here",
      text: here,
    });

    const list = contentEl.createDiv({ cls: "meinc-home-group" });
    if (this.folderPath) {
      const up = list.createEl("button", { cls: "meinc-home-row", type: "button" });
      const ico = up.createDiv({ cls: "meinc-home-icon" });
      ico.style.background = "var(--home-gray)";
      setIcon(ico, "arrow-up");
      up.createDiv({ cls: "meinc-home-row-body" }).createDiv({
        cls: "meinc-home-row-name",
        text: "上一级",
      });
      up.onclick = () => {
        const parent = this.folderPath.split("/").slice(0, -1).join("/");
        this.folderPath = isWritablePath(parent) ? parent : "";
        this.render();
      };
    }

    const folders = this.listFolders();
    for (const folder of folders) {
      const blocked =
        this.file instanceof TFolder &&
        isSelfOrDescendant(this.file.path, folder.path);
      const row = list.createEl("button", {
        cls: "meinc-home-row" + (blocked ? " is-muted" : ""),
        type: "button",
      });
      const well = row.createDiv({ cls: "meinc-home-icon" });
      well.style.background = "var(--home-blue)";
      setIcon(well, "folder");
      const body = row.createDiv({ cls: "meinc-home-row-body" });
      body.createDiv({ cls: "meinc-home-row-name", text: folder.name });
      const chev = row.createDiv({ cls: "meinc-home-chevron" });
      setIcon(chev, "chevron-right");
      row.onclick = () => {
        if (blocked) {
          new Notice("不能移进自己里面");
          return;
        }
        this.folderPath = folder.path;
        this.render();
      };
    }

    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消" });
    cancel.onclick = () => this.close();
    const ok = actions.createEl("button", {
      cls: "mod-cta",
      text: "移到这里",
    });
    ok.disabled = !this.canDropHere();
    ok.onclick = () => this.confirm();
  }

  listFolders() {
    if (!this.folderPath) {
      return WRITE_ROOTS.map((root) =>
        this.app.vault.getAbstractFileByPath(root)
      ).filter((f) => f instanceof TFolder);
    }
    const folder = this.app.vault.getAbstractFileByPath(this.folderPath);
    if (!(folder instanceof TFolder)) return [];
    return folder.children
      .filter(
        (c) =>
          c instanceof TFolder &&
          !isHiddenName(c.name) &&
          !PINNED_BOTTOM.has(c.name)
      )
      .sort(sortByName);
  }

  canDropHere() {
    if (!isWritablePath(this.folderPath)) return false;
    if (this.file.parent?.path === this.folderPath) return false;
    if (
      this.file instanceof TFolder &&
      isSelfOrDescendant(this.file.path, this.folderPath)
    ) {
      return false;
    }
    return true;
  }

  async confirm() {
    if (!this.canDropHere()) return;
    const dest = `${this.folderPath}/${this.file.name}`;
    if (this.app.vault.getAbstractFileByPath(dest)) {
      new Notice("那里已经有同名文件");
      return;
    }
    try {
      await this.app.fileManager.renameFile(this.file, dest);
      new Notice("已移动");
      this.close();
    } catch (err) {
      new Notice("移动失败");
    }
  }

  onClose() {
    this.contentEl.empty();
  }
}

function mountTimeboxStatsBar(parent, plugin) {
  const stats = plugin.getTimeboxStats();
  const bar = parent.createDiv({ cls: "meinc-timebox-stats" });
  const weekHead = bar.createDiv({ cls: "meinc-timebox-stats-week-head" });
  weekHead.createDiv({ cls: "meinc-timebox-stats-week-kicker", text: "本周" });
  weekHead.createDiv({
    cls: "meinc-timebox-stats-week-total",
    text: stats.weekFocusLabel,
  });
  bar.createDiv({
    cls: "meinc-timebox-stats-week-range",
    text: stats.weekRangeLabel,
  });
  const todayRow = bar.createDiv({ cls: "meinc-timebox-stats-today-row" });
  todayRow.createDiv({ cls: "meinc-timebox-stats-today-label", text: stats.todayLabel });
  if (stats.streakLabel) {
    todayRow.createDiv({
      cls: "meinc-timebox-stats-streak",
      text: stats.streakLabel,
    });
  }
  const chart = bar.createDiv({ cls: "meinc-timebox-week-chart" });
  const maxMinutes = Math.max(1, ...stats.weekBars.map((item) => item.minutes));
  for (const item of stats.weekBars) {
    const col = chart.createDiv({
      cls:
        "meinc-timebox-week-col" +
        (item.isToday ? " is-today" : "") +
        (item.isFuture ? " is-future" : ""),
      attr: { "aria-label": item.ariaLabel },
    });
    col.createDiv({ cls: "meinc-timebox-week-weekday", text: item.weekday });
    const track = col.createDiv({ cls: "meinc-timebox-week-track" });
    if (item.minutes > 0 && !item.isFuture) {
      track.createDiv({
        cls: "meinc-timebox-week-fill",
        attr: {
          style: `height:${Math.round((item.minutes / maxMinutes) * 100)}%`,
        },
      });
    }
    col.createDiv({ cls: "meinc-timebox-week-date", text: item.dateLabel });
    if (item.shortLabel && !item.isFuture) {
      col.createDiv({ cls: "meinc-timebox-week-mini", text: item.shortLabel });
    }
  }
  if (stats.topTitles.length) {
    const top = bar.createDiv({ cls: "meinc-timebox-stats-top" });
    top.createDiv({ cls: "meinc-timebox-stats-top-kicker", text: "常做" });
    const maxTop = Math.max(1, stats.topTitles[0].minutes);
    for (const item of stats.topTitles) {
      const row = top.createDiv({ cls: "meinc-timebox-top-row" });
      row.createDiv({ cls: "meinc-timebox-top-title", text: item.title });
      const meter = row.createDiv({ cls: "meinc-timebox-top-meter" });
      meter.createDiv({
        cls: "meinc-timebox-top-fill",
        attr: {
          style: `width:${Math.round((item.minutes / maxTop) * 100)}%`,
        },
      });
      row.createDiv({
        cls: "meinc-timebox-top-duration",
        text: formatFocusDuration(item.minutes),
      });
    }
  }
  return bar;
}

function mountTimeboxDurationPicker(parent, plugin, initialMinutes, onChange) {
  const presets = plugin.getTimeboxPresetMinutes();
  let minutes = clampTimeboxPresetMinutes(initialMinutes);
  const row = parent.createDiv({ cls: "meinc-timebox-duration" });
  const presetRow = row.createDiv({ cls: "meinc-timebox-presets" });
  const presetButtons = presets.map((value) => {
    const btn = presetRow.createEl("button", {
      cls: "meinc-timebox-chip",
      text: `${value} 分`,
      attr: { type: "button" },
    });
    btn.onclick = () => {
      minutes = value;
      sync();
    };
    return { value, btn };
  });
  const stepper = row.createDiv({ cls: "meinc-timebox-stepper" });
  const minus = stepper.createEl("button", {
    cls: "meinc-timebox-step",
    text: "−",
    attr: { type: "button", "aria-label": "减少分钟" },
  });
  const valueEl = stepper.createDiv({ cls: "meinc-timebox-step-value" });
  const plus = stepper.createEl("button", {
    cls: "meinc-timebox-step",
    text: "+",
    attr: { type: "button", "aria-label": "增加分钟" },
  });
  const sync = () => {
    valueEl.setText(`${minutes} 分`);
    for (const item of presetButtons) {
      item.btn.classList.toggle("is-on", item.value === minutes);
    }
    onChange(minutes);
  };
  minus.onclick = () => {
    minutes = clampTimeboxPresetMinutes(minutes - 1);
    sync();
  };
  plus.onclick = () => {
    minutes = clampTimeboxPresetMinutes(minutes + 1);
    sync();
  };
  sync();
  return {
    getMinutes: () => minutes,
    setMinutes: (value) => {
      minutes = clampTimeboxPresetMinutes(value);
      sync();
    },
  };
}

class TimeboxStartModal extends Modal {
  constructor(app, plugin, opts = {}) {
    super(app);
    this.plugin = plugin;
    this.titleValue = String(opts.title || "").trim();
    this.initialMinutes = plugin.resolveTimeboxStartMinutes(opts.durationMs);
  }

  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-timebox-modal");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText("Timebox");
    const { contentEl } = this;
    mountTimeboxStatsBar(contentEl, this.plugin);
    const history = contentEl.createEl("button", {
      cls: "meinc-timebox-chip",
      text: "时间记录",
      attr: { type: "button" },
    });
    history.onclick = () => {
      this.close();
      const leaf = this.app.workspace.getLeavesOfType("meinc-home")[0];
      leaf?.view?.openTimeboxHistory?.();
    };

    const input = contentEl.createEl("input", {
      cls: "meinc-home-name-input meinc-timebox-title-input",
      type: "text",
      attr: { placeholder: "这块做什么" },
    });
    input.value = this.titleValue;
    input.addEventListener("input", () => {
      this.titleValue = input.value;
    });
    input.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter") {
        ev.preventDefault();
        this.submit();
        return;
      }
      if (ev.key === "ArrowUp") {
        ev.preventDefault();
        this.picker.setMinutes(this.picker.getMinutes() + 1);
      }
      if (ev.key === "ArrowDown") {
        ev.preventDefault();
        this.picker.setMinutes(this.picker.getMinutes() - 1);
      }
    });

    contentEl.createDiv({ cls: "meinc-timebox-recent-label", text: "时长" });
    this.minutes = this.initialMinutes;
    this.picker = mountTimeboxDurationPicker(contentEl, this.plugin, this.minutes, (m) => {
      this.minutes = m;
      this.syncSubmitLabel();
    });

    const fillTitle = (title) => {
      this.titleValue = title;
      input.value = title;
      if (!Platform.isMobile) input.focus();
    };

    const recent = this.plugin.timebox?.state.recentTitles || [];
    if (recent.length) {
      contentEl.createDiv({ cls: "meinc-timebox-recent-label", text: "最近" });
      const row = contentEl.createDiv({ cls: "meinc-timebox-recent" });
      for (const title of recent) {
        const chip = row.createEl("button", {
          cls: "meinc-timebox-chip",
          text: title,
          attr: { type: "button" },
        });
        chip.onclick = () => fillTitle(title);
      }
    }

    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const cancel = actions.createEl("button", { text: "取消", attr: { type: "button" } });
    cancel.onclick = () => this.close();
    this.okBtn = actions.createEl("button", {
      cls: "mod-cta meinc-timebox-start-btn",
      attr: { type: "button" },
    });
    this.okBtn.onclick = () => this.submit();
    this.syncSubmitLabel();
    if (!Platform.isMobile) setTimeout(() => input.focus(), 20);
  }

  syncSubmitLabel() {
    if (this.okBtn) this.okBtn.setText(`开始 ${this.minutes} 分钟`);
  }

  submit() {
    const title = String(this.titleValue || "").trim();
    if (!title) {
      new Notice("先写这块要做什么");
      return;
    }
    const minutes = this.picker?.getMinutes() || this.minutes;
    if (!this.plugin.startTimebox(title, minutes * 60_000)) return;
    this.close();
  }

  onClose() {
    this.contentEl.empty();
  }
}

class TimeboxControlModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.abandonArmed = false;
    this.abandonTimer = null;
    this.tickTimer = null;
  }

  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-timebox-modal", "is-control");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText("Timebox");
    this.renderBody();
    this.tickTimer = window.setInterval(() => this.renderBody(true), 500);
  }

  renderBody(soft = false) {
    const state = this.plugin.timebox?.state;
    if (!state || state.status === "idle") {
      this.close();
      return;
    }
    if (!soft || !this.ringEl) {
      this.contentEl.empty();
      this.abandonArmed = false;
      if (this.abandonTimer) window.clearTimeout(this.abandonTimer);
      const { contentEl } = this;
      const ringWrap = contentEl.createDiv({ cls: "meinc-timebox-ring-wrap" });
      this.ringEl = ringWrap.createDiv({ cls: "meinc-timebox-ring" });
      this.timeEl = ringWrap.createDiv({ cls: "meinc-timebox-ring-time" });
      this.titleEl2 = ringWrap.createDiv({ cls: "meinc-timebox-ring-title" });
      const actions = contentEl.createDiv({ cls: "meinc-timebox-control-actions" });
      const primary = actions.createEl("button", {
        cls: "meinc-timebox-control-primary",
        attr: { type: "button" },
      });
      primary.onclick = () => {
        if (state.status === "running") this.plugin.pauseTimebox();
        else this.plugin.resumeTimebox();
        this.renderBody(false);
      };
      this.primaryBtn = primary;
      const extend = actions.createEl("button", {
        cls: "meinc-timebox-control-secondary",
        text: `+${this.plugin.settings.timeboxExtendStepMin || 5} 分`,
        attr: { type: "button" },
      });
      extend.onclick = () => {
        this.plugin.extendTimebox(
          (this.plugin.settings.timeboxExtendStepMin || 5) * 60_000
        );
        this.renderBody(false);
      };
      const early = actions.createEl("button", {
        cls: "meinc-timebox-control-secondary",
        text: "提前完成",
        attr: { type: "button" },
      });
      early.onclick = () => {
        this.plugin.finishTimeboxEarly();
        this.close();
      };
      this.abandonBtn = actions.createEl("button", {
        cls: "meinc-timebox-control-danger",
        text: "放弃",
        attr: { type: "button" },
      });
      this.abandonBtn.onclick = () => {
        if (!this.abandonArmed) {
          this.abandonArmed = true;
          this.abandonBtn.setText("再点放弃");
          this.abandonTimer = window.setTimeout(() => {
            this.abandonArmed = false;
            if (this.abandonBtn) this.abandonBtn.setText("放弃");
          }, 2500);
          return;
        }
        this.plugin.abandonTimebox();
        this.close();
      };
    }
    const ratio = timeboxProgressRatio(state);
    const deg = Math.round(ratio * 360);
    this.ringEl.style.background = `conic-gradient(var(--home-blue) ${deg}deg, var(--home-track, transparent) 0)`;
    this.timeEl.setText(formatRemaining(state.remainingMs));
    this.titleEl2.setText(state.title || "Timebox");
    if (this.primaryBtn) {
      this.primaryBtn.setText(state.status === "running" ? "暂停" : "继续");
    }
  }

  onClose() {
    if (this.tickTimer) window.clearInterval(this.tickTimer);
    if (this.abandonTimer) window.clearTimeout(this.abandonTimer);
    this.contentEl.empty();
    this.ringEl = null;
  }
}

class TimeboxDoneModal extends Modal {
  constructor(app, plugin, payload) {
    super(app);
    this.plugin = plugin;
    this.payload = payload;
    this.saved = false;
  }

  onOpen() {
    this.modalEl.addClass("meinc-home-modal", "meinc-timebox-modal", "is-done");
    applyMeincHomeTheme(this.modalEl);
    this.titleEl.setText("这块完成了");
    const { contentEl } = this;
    const stats = this.plugin.getTimeboxStats([this.payload]);
    contentEl.createDiv({
      cls: "meinc-timebox-done-title",
      text: this.payload.title || "Timebox",
    });
    contentEl.createDiv({
      cls: "meinc-timebox-done-meta",
      text: `${formatTimeboxMinutes(this.payload.focusedMs || this.payload.plannedMs)} 分钟 · 今天第 ${stats.todayBlocks} 块`,
    });
    if (stats.goal > 0) {
      const dots = contentEl.createDiv({ cls: "meinc-timebox-goal-dots is-large" });
      for (let i = 0; i < stats.goal; i += 1) {
        dots.createSpan({
          cls: "meinc-timebox-goal-dot" + (i < stats.goalDots ? " is-on" : ""),
        });
      }
    }
    const note = contentEl.createEl("input", {
      cls: "meinc-home-name-input meinc-timebox-done-input",
      type: "text",
      attr: { placeholder: "做到哪了（可选）", maxlength: "120" },
    });
    const actions = contentEl.createDiv({ cls: "meinc-home-modal-actions" });
    const rest = actions.createEl("button", { text: "休息", attr: { type: "button" } });
    rest.onclick = () => {
      this.save(note.value);
      this.close();
    };
    const again = actions.createEl("button", {
      cls: "mod-cta",
      text: "再来一块",
      attr: { type: "button" },
    });
    again.onclick = () => {
      this.save(note.value);
      this.close();
      this.plugin.openTimeboxStart({
        title: this.payload.title,
        durationMs: this.payload.plannedMs,
      });
    };
  }

  save(noteValue) {
    if (this.saved) return;
    this.payload.note = String(noteValue || "").trim();
    this.plugin.finalizeTimeboxSession(this.payload);
    this.saved = true;
  }

  onClose() {
    if (!this.saved) this.save("");
    this.contentEl.empty();
  }
}

function reviewCardExamples(entry) {
  if (!entry || !Array.isArray(entry.examples)) return [];
  return entry.examples.filter((item) => item && String(item.text || "").trim());
}

function appendReviewWordBack(parent, entry) {
  if (entry.pos) {
    parent.createDiv({ cls: "meinc-home-review-pos", text: entry.pos });
  }
  if (entry.phonetic) {
    parent.createDiv({ cls: "meinc-home-review-meta", text: entry.phonetic });
  }
  const defs = Array.isArray(entry.definitions)
    ? entry.definitions.filter(Boolean)
    : [];
  const body = parent.createDiv({ cls: "meinc-home-review-body" });
  if (defs.length) {
    const ul = body.createEl("ul", { cls: "meinc-home-review-defs" });
    defs.forEach((line) => ul.createEl("li", { text: line }));
  } else {
    body.createDiv({ text: entry.note || "暂无释义" });
  }
  const examples = reviewCardExamples(entry);
  if (examples.length) {
    const quotes = parent.createDiv({ cls: "meinc-home-review-examples" });
    examples.forEach((item) => {
      quotes.createDiv({ cls: "meinc-home-review-example", text: item.text });
    });
  }
  if (entry.deck) {
    parent.createDiv({ cls: "meinc-home-review-source", text: entry.deck });
  }
}

class HomeView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.nav = [{ type: "home" }];
    this.mailboxDraft = { to: "CEO", body: "", notePath: "" };
    this._scrollKey = "";
    this._renderSeq = 0;
    this.timeboxRefs = null;
    this.compoundEditor = null;
    this.reviewSession = null;
    this.onTimebox = (reason) => this.refreshTimebox(reason);
  }

  getViewType() {
    return VIEW_TYPE_HOME;
  }

  getDisplayText() {
    return "首页";
  }

  getIcon() {
    return "home";
  }

  async onOpen() {
    this.containerEl.addClass("meinc-home-view");
    this.registerEvent(this.app.vault.on("create", () => this.refreshListing()));
    this.registerEvent(this.app.vault.on("delete", () => this.refreshListing()));
    this.registerEvent(this.app.vault.on("rename", () => this.refreshListing()));
    this.plugin.addTimeboxListener(this.onTimebox);
    this.render();
  }

  refreshListing() {
    this.render();
  }

  async onClose() {
    if (this.current().type === "compound") {
      await this.saveCompoundEditor({ quiet: true });
    }
    this.plugin.removeTimeboxListener(this.onTimebox);
    this.timeboxRefs = null;
    this.contentEl.empty();
  }

  async resetToHome() {
    if (this.current().type === "compound") {
      const ok = await this.saveCompoundEditor({ quiet: true });
      if (!ok) return false;
    }
    this.nav = [{ type: "home" }];
    this.compoundEditor = null;
    this.render();
    return true;
  }

  current() {
    return this.nav[this.nav.length - 1] || { type: "home" };
  }

  push(screen) {
    this.nav.push(screen);
    this.render();
  }

  back() {
    if (this.current().type === "compound") {
      void this.leaveCompound();
      return;
    }
    if (this.nav.length > 1) this.nav.pop();
    this.render();
  }

  async leaveCompound() {
    const ok = await this.saveCompoundEditor({ quiet: true });
    if (!ok) return;
    if (this.current().type === "compound" && this.nav.length > 1) this.nav.pop();
    this.compoundEditor = null;
    this.render();
  }

  screenKey(screen) {
    if (screen.type === "review") {
      return `review:${screen.mode || "hub"}`;
    }
    if (screen.type === "editor") return `editor:${screen.path || ""}`;
    if (screen.type === "reader") return `reader:${screen.path || ""}`;
    return `${screen.type}:${screen.path || screen.folder || ""}`;
  }

  async render() {
    const token = (this._renderSeq += 1);
    const screen = this.current();
    const key = this.screenKey(screen);
    const prevScroll =
      key === this._scrollKey
        ? this.contentEl.querySelector(".meinc-home-scroll")?.scrollTop || 0
        : 0;
    if (token !== this._renderSeq) return;

    const host = this.contentEl;
    host.empty();
    host.addClass("meinc-home");
    const root = host.createDiv({ cls: "meinc-home-scroll" });

    if (screen.type === "home") this.renderHome(root);
    else if (screen.type === "inbox") this.renderInbox(root);
    else if (screen.type === "review") this.renderReview(root);
    else if (screen.type === "compound") this.renderCompound(root);
    else if (screen.type === "editor") this.renderEditor(root);
    else if (screen.type === "reader") this.renderReader(root);
    else if (screen.type === "library") this.renderLibrary(root);
    else if (screen.type === "writing-list") this.renderWritingList(root);
    else if (screen.type === "projects") this.renderProjects(root);
    else if (screen.type === "timebox-history") this.renderTimeboxHistory(root);
    else this.renderFolder(root, screen);

    this._scrollKey = key;
    root.scrollTop = prevScroll;
  }

  renderHome(root) {
    const { weekday, date } = formatHomeDate();
    const hero = root.createDiv({ cls: "meinc-home-hero" });
    const dateCol = hero.createDiv({ cls: "meinc-home-hero-date" });
    dateCol.createDiv({ cls: "meinc-home-kicker", text: weekday });
    dateCol.createEl("h1", { cls: "meinc-home-date", text: date });
    const focus = hero.createDiv({ cls: "meinc-home-focus" });
    this.mountCompoundChip(focus);
    this.mountTimebox(focus);

    const grid = root.createDiv({ cls: "meinc-home-grid" });
    HOME_TILES.forEach((tile, index) => {
      const agentPlugin = this.app.plugins?.plugins?.["obsidian-agent-os"];
      this.addTile(grid, {
        name:
          tile.id === "agent"
            ? agentPlugin?.settings?.agentName || tile.name
            : tile.name,
        icon: tile.icon,
        tint: tile.tint,
        size: tile.size,
        index,
        meta:
          tile.id === "review"
            ? this.plugin.reviewMeta()
            : tile.id === "inbox"
              ? this.plugin.inboxMeta()
              : tile.id === "agent"
                ? "OpenClaw"
                : undefined,
        onClick: () => this.handleHomeTile(tile),
      });
    });
  }

  mountTimebox(hero) {
    hero.querySelector(".meinc-home-timebox")?.remove();
    this.buildTimeboxChip(hero);
  }

  buildTimeboxChip(parent) {
    const state = this.plugin.timebox?.state || createDefaultTimebox();
    const chip = parent.createDiv({
      cls: `meinc-home-timebox is-${state.status}`,
      attr: { role: "button", tabindex: "0" },
    });
    const ring = chip.createDiv({ cls: "meinc-home-timebox-ring" });
    const inner = chip.createDiv({ cls: "meinc-home-timebox-inner" });
    const copy = inner.createDiv({ cls: "meinc-home-timebox-copy" });
    const kicker = copy.createDiv({ cls: "meinc-home-timebox-kicker" });
    const main = copy.createDiv({ cls: "meinc-home-timebox-main" });
    const title = copy.createDiv({ cls: "meinc-home-timebox-title" });

    if (state.status === "idle") {
      kicker.setText("Timebox");
      main.setText("开始一块");
      title.setText(this.plugin.getTimeboxStats().todayLine);
      title.hidden = false;
      ring.style.background = "";
    } else if (state.status === "paused") {
      kicker.setText("已暂停");
      main.setText(formatRemaining(state.remainingMs));
      title.setText(state.title);
      title.hidden = !state.title;
      this.paintTimeboxRing(ring, state);
    } else {
      kicker.setText(state.title || "Timebox");
      main.setText(formatRemaining(state.remainingMs));
      title.setText("进行中");
      title.hidden = false;
      this.paintTimeboxRing(ring, state);
    }

    chip.addEventListener("click", () => this.handleTimeboxClick());
    chip.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        this.handleTimeboxClick();
      }
    });

    this.timeboxRefs = { chip, ring, kicker, main, title };
    return chip;
  }

  paintTimeboxRing(ringEl, state) {
    if (!ringEl || !state || state.status === "idle") return;
    const ratio = timeboxProgressRatio(state);
    const deg = Math.round(ratio * 360);
    ringEl.style.background = `conic-gradient(var(--home-blue) ${deg}deg, var(--home-track, transparent) 0)`;
  }

  handleTimeboxClick() {
    const status = this.plugin.timebox?.state.status || "idle";
    if (status === "idle") this.showTimeboxStart();
    else this.plugin.openTimeboxControl();
  }

  showTimeboxStart(title) {
    this.plugin.openTimeboxStart({ title });
  }

  mountCompoundChip(parent) {
    parent.querySelector(".meinc-home-compound-chip")?.remove();
    const summary = summarizeCompoundDay(this.plugin.compoundToday);
    const chip = parent.createDiv({
      cls: "meinc-home-compound-chip" + (summary.filled ? " has-entry" : ""),
      attr: { role: "button", tabindex: "0" },
    });
    const copy = chip.createDiv({ cls: "meinc-home-timebox-copy" });
    copy.createDiv({ cls: "meinc-home-timebox-kicker", text: COMPOUND_TITLE });
    copy.createDiv({ cls: "meinc-home-timebox-main", text: summary.main });
    const preview = copy.createDiv({ cls: "meinc-home-timebox-title" });
    preview.setText(summary.preview);
    preview.hidden = !summary.preview;
    chip.addEventListener("click", () => {
      void this.openCompound();
    });
    chip.addEventListener("keydown", (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        void this.openCompound();
      }
    });
    return chip;
  }

  async openCompound() {
    if (this.current().type === "compound") return;
    const today = compoundDayKeyFromTime(Date.now());
    await this.loadCompoundEditor(today);
    this.push({ type: "compound", title: COMPOUND_TITLE });
  }

  async loadCompoundEditor(dayKey) {
    const today = compoundDayKeyFromTime(Date.now());
    const key = !parseCompoundDay(dayKey) || dayKey > today ? today : dayKey;
    const weekStart = compoundWeekStart(key);
    const path = compoundWeekPath(weekStart);
    const file = this.app.vault.getAbstractFileByPath(path);
    let text = "";
    if (file instanceof TFile) {
      try {
        text = await this.app.vault.read(file);
      } catch (_) {}
    }
    const parsed = parseCompoundWeek(text);
    const saved = normalizeCompoundDay(parsed.days[key]);
    let yesterday = "";
    if (key === today) {
      const previousKey = addCompoundDays(today, -1);
      if (compoundWeekStart(previousKey) === weekStart) {
        yesterday = yesterdayCompoundChange(today, parsed.days, {});
      } else {
        const prevPath = compoundWeekPath(previousKey);
        const prev = this.app.vault.getAbstractFileByPath(prevPath);
        let prevDays = {};
        if (prev instanceof TFile) {
          try {
            prevDays = parseCompoundWeek(await this.app.vault.read(prev)).days;
          } catch (_) {}
        }
        yesterday = yesterdayCompoundChange(today, parsed.days, prevDays);
      }
    }
    this.compoundEditor = {
      dayKey: key,
      today,
      weekStart,
      path,
      days: parsed.days,
      exists: file instanceof TFile,
      yesterday,
      draft: { ...saved },
      saved: { ...saved },
      saving: null,
      writing: false,
    };
  }

  compoundDirty() {
    const editor = this.compoundEditor;
    if (!editor) return false;
    return !compoundDayEquals(editor.draft, editor.saved);
  }

  async saveCompoundEditor(opts = {}) {
    const editor = this.compoundEditor;
    if (!editor) return true;
    if (compoundDayEquals(editor.draft, editor.saved)) {
      if (!opts.quiet) new Notice("已记下");
      return true;
    }
    if (editor.saving) return editor.saving;
    const job = (async () => {
      editor.writing = true;
      try {
        const result = await this.plugin.saveCompoundDay(editor.dayKey, editor.draft);
        if (result.skipped) return false;
        const saved = normalizeCompoundDay(editor.draft);
        editor.saved = saved;
        editor.draft = { ...saved };
        editor.days = result.days || {};
        editor.exists = !result.deleted;
        editor.path = result.path;
        if (!opts.quiet) new Notice(result.deleted ? "这一天已清空" : "已记下");
        this.refreshCompoundChip();
        if (!opts.quiet && this.current().type === "compound") this.render();
        return true;
      } catch (_) {
        new Notice("没记下，再试一次");
        return false;
      } finally {
        editor.writing = false;
      }
    })();
    editor.saving = job;
    try {
      return await job;
    } finally {
      if (editor.saving === job) editor.saving = null;
    }
  }

  async switchCompoundDay(dayKey) {
    const today = compoundDayKeyFromTime(Date.now());
    if (!parseCompoundDay(dayKey) || dayKey > today) return;
    const ok = await this.saveCompoundEditor({ quiet: true });
    if (!ok) return;
    await this.loadCompoundEditor(dayKey);
    if (this.current().type === "compound") this.render();
  }

  async openCompoundNote() {
    const ok = await this.saveCompoundEditor({ quiet: true });
    if (!ok) return;
    const editor = this.compoundEditor;
    if (!editor?.exists) return;
    const file = this.app.vault.getAbstractFileByPath(editor.path);
    if (file instanceof TFile) await this.plugin.openFile(file);
  }

  renderCompound(root) {
    const header = root.createDiv({ cls: "meinc-home-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" },
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", {
      cls: "meinc-home-title",
      text: COMPOUND_TITLE,
    });

    const editor = this.compoundEditor;
    const page = root.createDiv({ cls: "meinc-home-compound-page" });
    if (!editor) {
      page.createDiv({ cls: "meinc-home-empty", text: "正在打开" });
      const today = compoundDayKeyFromTime(Date.now());
      void this.loadCompoundEditor(today).then(() => {
        if (this.current().type === "compound") this.render();
      });
      return;
    }

    page.createDiv({
      cls: "meinc-home-compound-range",
      text: compoundWeekLabel(editor.weekStart),
    });
    page.createDiv({
      cls: "meinc-home-compound-day-label",
      text: `${editor.dayKey} ${compoundWeekdayLabel(editor.dayKey)}`,
    });

    if (editor.yesterday) {
      const box = page.createDiv({ cls: "meinc-home-compound-yesterday" });
      box.createDiv({ cls: "meinc-home-compound-yesterday-kicker", text: "昨天要改的" });
      box.createDiv({ cls: "meinc-home-compound-yesterday-body", text: editor.yesterday });
    }

    for (const field of COMPOUND_FIELDS) {
      const wrap = page.createDiv({ cls: "meinc-home-compound-field" });
      wrap.createDiv({ cls: "meinc-home-compound-label", text: field.title });
      const area = wrap.createEl("textarea", {
        cls: "meinc-home-compound-input",
        attr: { maxlength: String(COMPOUND_FIELD_MAX) },
      });
      area.value = editor.draft[field.key] || "";
      area.addEventListener("input", () => {
        editor.draft[field.key] = area.value;
      });
    }

    const save = page.createEl("button", {
      cls: "meinc-home-compound-save",
      text: "记下",
      attr: { type: "button" },
    });
    save.onclick = () => {
      void this.saveCompoundEditor();
    };

    if (editor.dayKey !== editor.today) {
      const backToday = page.createEl("button", {
        cls: "meinc-home-compound-day",
        text: "回到今天",
        attr: { type: "button" },
      });
      backToday.onclick = () => {
        void this.switchCompoundDay(editor.today);
      };
    }

    const others = compoundDaysInWeek(editor.weekStart, editor.days, editor.today).filter(
      (key) => key !== editor.dayKey
    );
    if (others.length) {
      page.createDiv({ cls: "meinc-home-compound-days-label", text: "本周已记" });
      const list = page.createDiv({ cls: "meinc-home-compound-days" });
      for (const key of others) {
        const preview = summarizeCompoundDay(editor.days[key]).preview;
        const btn = list.createEl("button", {
          cls: "meinc-home-compound-day",
          attr: { type: "button" },
        });
        btn.createSpan({
          cls: "meinc-home-compound-day-date",
          text: `${key.slice(5)} ${compoundWeekdayLabel(key)}`,
        });
        if (preview) {
          btn.createSpan({ cls: "meinc-home-compound-day-preview", text: preview });
        }
        btn.onclick = () => {
          void this.switchCompoundDay(key);
        };
      }
    }

    if (editor.exists) {
      const open = page.createEl("button", {
        cls: "meinc-home-compound-open",
        text: "打开本周笔记",
        attr: { type: "button" },
      });
      open.onclick = () => {
        void this.openCompoundNote();
      };
    }
  }

  refreshCompoundChip() {
    const screen = this.current();
    if (screen.type !== "home") return;
    const focus = this.contentEl.querySelector(".meinc-home-focus");
    if (!focus) return;
    focus.empty();
    this.mountCompoundChip(focus);
    this.mountTimebox(focus);
  }

  updateTimeboxChip() {
    const refs = this.timeboxRefs;
    const state = this.plugin.timebox?.state;
    if (!refs || !state) return;
    refs.chip?.classList.remove("is-idle", "is-running", "is-paused");
    refs.chip?.classList.add(`is-${state.status}`);
    if (state.status === "idle") {
      refs.kicker.setText("Timebox");
      refs.main.setText("开始一块");
      if (refs.title) {
        refs.title.setText(this.plugin.getTimeboxStats().todayLine);
        refs.title.hidden = false;
      }
      if (refs.ring) refs.ring.style.background = "";
      return;
    }
    if (state.status === "paused") {
      refs.kicker.setText("已暂停");
      refs.main.setText(formatRemaining(state.remainingMs));
      if (refs.title) {
        refs.title.setText(state.title || "");
        refs.title.hidden = !state.title;
      }
      this.paintTimeboxRing(refs.ring, state);
      return;
    }
    refs.kicker.setText(state.title || "Timebox");
    refs.main.setText(formatRemaining(state.remainingMs));
    if (refs.title) {
      refs.title.setText("进行中");
      refs.title.hidden = false;
    }
    this.paintTimeboxRing(refs.ring, state);
  }

  refreshTimebox(reason) {
    const screen = this.current();
    if (screen.type !== "home") {
      this.timeboxRefs = null;
      return;
    }
    if (reason === "tick") {
      this.updateTimeboxChip();
      return;
    }
    if (reason === "sessions") {
      this.updateTimeboxChip();
      return;
    }
    const focus = this.contentEl.querySelector(".meinc-home-focus");
    if (!focus) return;
    focus.empty();
    this.mountCompoundChip(focus);
    this.mountTimebox(focus);
  }

  handleHomeTile(tile) {
    if (tile.id === "agent") {
      this.plugin.openAgent();
      return;
    }
    if (tile.id === "review") {
      void this.openReview();
      return;
    }
    if (tile.id === "today") {
      this.plugin.openToday();
      return;
    }
    if (tile.id === "inbox") {
      this.push({ type: "inbox", title: MAILBOX_TITLE });
      return;
    }
    if (tile.id === "subjects") {
      this.push({
        type: "folder",
        path: "基础学科",
        title: "学习/输出",
        mode: "subjects",
      });
      return;
    }
    this.push({
      type: "folder",
      path: tile.path,
      title: tile.name,
    });
  }

  renderInbox(root) {
    const header = root.createDiv({ cls: "meinc-home-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" },
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", {
      cls: "meinc-home-title",
      text: MAILBOX_TITLE,
    });

    this.renderMailboxCompose(root);

    const items = this.plugin.listInboxItems();
    if (!items.length) {
      const empty = root.createDiv({ cls: "meinc-home-empty" });
      empty.createDiv({ text: "收件箱是空的" });
      empty.createDiv({
        cls: "meinc-home-empty-sub",
        text: "今天没有待处理的推送",
      });
      return;
    }

    const group = root.createDiv({ cls: "meinc-home-group" });
    items.forEach((item, index) => {
      this.addRow(group, {
        name: item.title,
        meta: `${item.stream.name} · ${formatInboxDate(item.date) || "未标日期"}`,
        icon: item.stream.icon || "inbox",
        tint: item.stream.tint || "teal",
        index,
        file: item.file,
        sheet: "inbox",
        onClick: () => this.plugin.openFile(item.file),
      });
    });
  }

  openReview() {
    this.reviewSession = null;
    this.push({ type: "review", title: "复习", mode: "hub" });
  }

  async startEnglishReview() {
    this.reviewSession = await this.plugin.buildEnglishReviewSession();
    this.push({ type: "review", title: "英语", mode: "english" });
  }

  async startChineseReview() {
    this.reviewSession = await this.plugin.buildChineseReviewSession();
    this.push({ type: "review", title: "语文", mode: "chinese" });
  }

  renderReviewHub(root) {
    const header = root.createDiv({ cls: "meinc-home-header meinc-home-review-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" },
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", { cls: "meinc-home-title", text: "复习" });

    const moreBtn = header.createEl("button", {
      cls: "meinc-home-add",
      attr: { type: "button", "aria-label": "更多" },
    });
    setIcon(moreBtn, "more-horizontal");
    moreBtn.onclick = (ev) => this.showReviewMoreMenu(ev);

    const counts = this.plugin.reviewHubCounts();
    const group = root.createDiv({ cls: "meinc-home-group" });
    this.addRow(group, {
      name: "英语",
      meta: counts.english > 0 ? `今日 ${counts.english}` : "暂无待复习",
      icon: "languages",
      tint: "blue",
      index: 0,
      onClick: () => void this.startEnglishReview(),
    });
    this.addRow(group, {
      name: "语文",
      meta: counts.chinese > 0 ? `今日 ${counts.chinese}` : "暂无待复习",
      icon: "book-open",
      tint: "orange",
      index: 1,
      onClick: () => void this.startChineseReview(),
    });
  }

  currentReviewItem() {
    const session = this.reviewSession;
    if (!session || !Array.isArray(session.queue)) return null;
    return session.queue[session.index] || null;
  }

  renderReview(root) {
    const screen = this.current();
    if (screen.mode === "hub" || !screen.mode) {
      this.renderReviewHub(root);
      return;
    }

    const session = this.reviewSession;
    const header = root.createDiv({ cls: "meinc-home-header meinc-home-review-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" },
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", {
      cls: "meinc-home-title",
      text: screen.title || "复习",
    });

    if (screen.mode === "english") {
      const libBtn = header.createEl("button", {
        cls: "meinc-home-add",
        attr: { type: "button", "aria-label": "词库" },
      });
      setIcon(libBtn, "library");
      libBtn.onclick = () => this.plugin.openLexiDeck();
    }

    const moreBtn = header.createEl("button", {
      cls: "meinc-home-add",
      attr: { type: "button", "aria-label": "更多" },
    });
    setIcon(moreBtn, "more-horizontal");
    moreBtn.onclick = (ev) => this.showReviewMoreMenu(ev);

    if (!session || !session.queue.length) {
      const empty = root.createDiv({ cls: "meinc-home-empty" });
      empty.createDiv({ text: "今天没有待复习" });
      const actions = empty.createDiv({ cls: "meinc-home-review-actions" });
      const addArticle = actions.createEl("button", {
        cls: "mod-cta",
        text: "加入文章",
        attr: { type: "button" },
      });
      addArticle.onclick = () => this.showReviewArticlePicker();
      const openLexi = actions.createEl("button", {
        text: "打开词库",
        attr: { type: "button" },
      });
      openLexi.onclick = () => this.plugin.openLexiDeck();
      return;
    }

    const total = session.queue.length;
    root.createDiv({
      cls: "meinc-home-review-progress",
      text: `${Math.min(session.index + 1, total)} / ${total}`,
    });

    const stage = root.createDiv({ cls: "meinc-home-review-stage" });
    const card = this.currentReviewItem();
    if (!card) {
      session.queue = [];
      const done = root.createDiv({ cls: "meinc-home-empty" });
      done.createDiv({ text: "今天的复习刷完了" });
      return;
    }

    const flash = stage.createDiv({
      cls:
        "meinc-home-review-card" +
        (session.flipped ? " is-flipped" : "") +
        (card.type === "prose" ? " is-prose" : ""),
      attr: { role: "button", tabindex: "0" },
    });
    flash.onclick = () => {
      session.flipped = !session.flipped;
      this.render();
    };
    flash.onkeydown = (ev) => {
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        session.flipped = !session.flipped;
        this.render();
      }
    };

    if (card.type === "word" || card.type === "sentence") {
      const entry = card.card || {};
      if (!session.flipped) {
        flash.createDiv({
          cls: "meinc-home-review-main",
          text:
            card.type === "word"
              ? entry.word || ""
              : entry.text || "",
        });
        flash.createDiv({
          cls: "meinc-home-review-hint",
          text: "点一下翻面",
        });
      } else if (card.type === "word") {
        appendReviewWordBack(flash, entry);
      } else {
        flash.createDiv({
          cls: "meinc-home-review-body",
          text: entry.translation || entry.note || "暂无译文",
        });
        if (entry.source) {
          flash.createDiv({ cls: "meinc-home-review-source", text: entry.source });
        }
      }
    } else {
      flash.createDiv({ cls: "meinc-home-review-kicker", text: card.source || "文章" });
      flash.createDiv({ cls: "meinc-home-review-main", text: card.title || card.path });
      if (session.flipped) {
        const open = flash.createEl("button", {
          cls: "meinc-home-review-open",
          text: "打开原文",
          attr: { type: "button" },
        });
        open.onclick = (ev) => {
          ev.stopPropagation();
          const file = this.app.vault.getAbstractFileByPath(card.path);
          if (file instanceof TFile) void this.plugin.openFile(file);
        };
        flash.createDiv({
          cls: "meinc-home-review-hint",
          text: "读完再选间隔",
        });
      } else {
        flash.createDiv({
          cls: "meinc-home-review-hint",
          text: "点一下翻面",
        });
      }
    }

    const grades = root.createDiv({ cls: "meinc-home-review-grades" });
    const gradeDefs =
      card.type === "prose"
        ? [
            { id: "again", label: "明天" },
            { id: "hard", label: "3 天" },
            { id: "good", label: "7 天" },
          ]
        : [
            { id: "again", label: "不会" },
            { id: "hard", label: "模糊" },
            { id: "good", label: "会了" },
          ];
    for (const g of gradeDefs) {
      const btn = grades.createEl("button", {
        cls: `meinc-home-review-grade is-${g.id}`,
        text: g.label,
        attr: { type: "button" },
      });
      btn.onclick = () => void this.gradeReviewCard(g.id);
    }

    if (screen.mode === "chinese") {
      const foot = root.createDiv({ cls: "meinc-home-review-foot" });
      const addArticle = foot.createEl("button", {
        text: "加入文章",
        attr: { type: "button" },
      });
      addArticle.onclick = () => this.showReviewArticlePicker();
    }
  }

  async gradeReviewCard(rating) {
    const session = this.reviewSession;
    const card = this.currentReviewItem();
    if (!session || !card) return;
    if (card.type === "word" || card.type === "sentence") {
      const lexideck = this.app.plugins?.plugins?.lexideck;
      if (!lexideck || typeof lexideck.gradeEntry !== "function") {
        new Notice("LexiDeck 未就绪");
        return;
      }
      const ok = await lexideck.gradeEntry(card.kind, card.id, rating);
      if (!ok) {
        new Notice("评分失败");
        return;
      }
    } else {
      await this.plugin.gradeReviewProse(card.path, rating);
    }
    session.queue.splice(session.index, 1);
    if (session.index >= session.queue.length) session.index = 0;
    session.flipped = false;
    this.render();
  }

  showReviewMoreMenu(evt) {
    const menu = document.createElement("div");
    menu.className = "meinc-home-review-menu";
    const add = (label, onClick) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.className = "meinc-home-review-menu-btn";
      btn.onclick = () => {
        menu.remove();
        onClick();
      };
      menu.appendChild(btn);
    };
    add("加入文章", () => this.showReviewArticlePicker());
    add("词汇笔记", () => {
      this.push({
        type: "folder",
        path: "基础学科/英语/01-词汇",
        title: "词汇笔记",
      });
    });
    add("背诵默写", () => {
      this.push({
        type: "folder",
        path: "基础学科/语文",
        title: "背诵默写",
        mode: "memorization",
      });
    });
    add("打开词库", () => this.plugin.openLexiDeck());
    document.body.appendChild(menu);
    const rect = evt.currentTarget.getBoundingClientRect();
    menu.style.position = "fixed";
    menu.style.top = `${rect.bottom + 6}px`;
    menu.style.right = `${window.innerWidth - rect.right}px`;
    const close = (ev) => {
      if (!menu.contains(ev.target)) {
        menu.remove();
        document.removeEventListener("click", close, true);
      }
    };
    window.setTimeout(() => document.addEventListener("click", close, true), 0);
  }

  showReviewArticlePicker() {
    const paths = this.plugin.listLibraryArticlePaths();
    if (!paths.length) {
      new Notice("资料库里没有可加的文章");
      return;
    }
    new ReviewArticlePickerModal(this.app, this.plugin, paths, async (path) => {
      await this.plugin.addArticleToReview(path);
      const screen = this.current();
      if (screen.mode === "chinese") {
        this.reviewSession = await this.plugin.buildChineseReviewSession();
      }
      this.render();
      new Notice("已加入复习");
    }).open();
  }

  renderMailboxCompose(root) {
    const card = root.createDiv({ cls: "meinc-home-compose" });
    card.createDiv({ cls: "meinc-home-compose-label", text: "写信" });

    const chips = card.createDiv({ cls: "meinc-home-compose-to" });
    for (const name of MAILBOX_RECIPIENTS) {
      const chip = chips.createEl("button", {
        cls:
          "meinc-home-chip" +
          (this.mailboxDraft.to === name ? " is-on" : ""),
        attr: { type: "button" },
        text: `@${name}`,
      });
      chip.onclick = () => {
        this.mailboxDraft.to = name;
        chips.querySelectorAll(".meinc-home-chip").forEach((el) => {
          el.classList.toggle("is-on", el.textContent === `@${name}`);
        });
      };
    }

    const body = card.createEl("textarea", {
      cls: "meinc-home-compose-body",
      attr: { rows: "4", placeholder: "题干或问题……" },
    });
    body.value = this.mailboxDraft.body;
    body.addEventListener("input", () => {
      this.mailboxDraft.body = body.value;
    });

    const path = card.createEl("input", {
      cls: "meinc-home-compose-path",
      type: "text",
      attr: { placeholder: "相关笔记路径（可选）" },
    });
    path.value = this.mailboxDraft.notePath;
    path.addEventListener("input", () => {
      this.mailboxDraft.notePath = path.value;
    });

    const send = card.createEl("button", {
      cls: "meinc-home-compose-send",
      attr: { type: "button" },
      text: "发送",
    });
    send.onclick = async () => {
      const text = String(this.mailboxDraft.body || "").trim();
      if (!text) {
        new Notice("先写正文");
        return;
      }
      send.disabled = true;
      try {
        await this.plugin.appendMailboxMessage({
          to: this.mailboxDraft.to,
          body: text,
          notePath: this.mailboxDraft.notePath,
        });
        this.mailboxDraft.body = "";
        this.mailboxDraft.notePath = "";
        body.value = "";
        path.value = "";
        if (this.plugin.hasMailboxWebhook()) new Notice("已投递");
        else new Notice("已写入信箱。去设置里贴 Webhook，否则要等定时扫");
      } catch (_) {
        new Notice("发送失败");
      } finally {
        send.disabled = false;
      }
    };
  }

  renderFolder(root, screen) {
    const header = root.createDiv({ cls: "meinc-home-header" });
    const back = header.createEl("button", {
      cls: "meinc-home-back",
      attr: { "aria-label": "返回", type: "button" },
    });
    setIcon(back, "chevron-left");
    back.onclick = () => this.back();
    header.createEl("h1", {
      cls: "meinc-home-title",
      text: screen.title || screen.path,
    });
    if (isWritablePath(screen.path)) {
      const add = header.createEl("button", {
        cls: "meinc-home-add",
        attr: { type: "button", "aria-label": "新建" },
      });
      setIcon(add, "plus");
      add.onclick = () => this.showCreateSheet(screen);
    }

    const tiles = this.listTiles(screen);
    if (!tiles.length) {
      const empty = root.createDiv({ cls: "meinc-home-empty" });
      empty.createDiv({ text: "这里还没有内容" });
      if (isWritablePath(screen.path)) {
        const btn = empty.createEl("button", {
          cls: "mod-cta",
          text: "新建笔记",
        });
        btn.onclick = () => this.createNote(screen.path);
      }
      return;
    }

    if (screen.mode === "subjects") {
      const grid = root.createDiv({ cls: "meinc-home-grid" });
      tiles.forEach((tile, index) => this.addTile(grid, { ...tile, index }));
      return;
    }

    const group = root.createDiv({ cls: "meinc-home-group" });
    tiles.forEach((tile, index) => this.addRow(group, { ...tile, index }));
  }

  listTiles(screen) {
    if (screen.mode === "subjects") {
      return SUBJECTS.map((name, i) => {
        const path = `基础学科/${name}`;
        const folder = this.app.vault.getAbstractFileByPath(path);
        if (!(folder instanceof TFolder)) return null;
        return {
          name,
          meta: countMeta(childCount(folder)),
          icon: "book-open",
          tint: SUBJECT_TINTS[i % SUBJECT_TINTS.length],
          onClick: () =>
            this.push({
              type: "folder",
              path,
              title: name,
            }),
        };
      }).filter(Boolean);
    }

    const folder = this.app.vault.getAbstractFileByPath(screen.path);
    if (!(folder instanceof TFolder)) return [];

    const folders = [];
    const bottom = [];
    const notes = [];
    const underSubjects = String(screen.path || "").startsWith("基础学科");
    for (const child of folder.children) {
      if (isHiddenName(child.name)) continue;
      if (screen.mode === "memorization") {
        if (!(child instanceof TFile) || !NOTE_EXT.has(child.extension)) continue;
        if (!child.name.startsWith("高考背诵默写")) continue;
      } else if (underSubjects && shouldHideSubjectChild(child.path, child.name)) {
        continue;
      }
      if (child instanceof TFolder) {
        if (PINNED_BOTTOM.has(child.name)) bottom.push(child);
        else folders.push(child);
      } else if (child instanceof TFile && NOTE_EXT.has(child.extension)) {
        notes.push(child);
      }
    }
    folders.sort(sortByName);
    bottom.sort(sortByName);
    notes.sort(sortByName);

    const tiles = [];
    const addFolder = (item, muted = false) => {
      tiles.push({
        name: item.name,
        meta: countMeta(childCount(item)),
        muted,
        icon: "folder",
        tint: muted ? "gray" : "blue",
        file: item,
        onClick: () =>
          this.push({
            type: "folder",
            path: item.path,
            title: item.name,
          }),
      });
    };
    folders.forEach((item) => addFolder(item));
    notes.forEach((item) => {
      tiles.push({
        name: displayName(item),
        icon: "file-text",
        tint: "gray",
        file: item,
        onClick: () => this.plugin.openFile(item),
      });
    });
    bottom.forEach((item) => addFolder(item, true));
    return tiles;
  }

  addTile(grid, { name, meta, muted, icon, tint, size, index, due, onClick }) {
    const cls = [
      "meinc-home-tile",
      muted ? "is-muted" : "",
      due ? "is-due" : "",
      size === "hero" ? "is-hero" : "",
      size === "wide" ? "is-wide" : "",
      tint ? `is-${tint}` : "",
    ]
      .filter(Boolean)
      .join(" ");
    const btn = grid.createEl("button", {
      cls,
      attr: { type: "button" },
    });
    btn.style.setProperty("--i", String(index || 0));
    if (icon) {
      const well = btn.createDiv({ cls: "meinc-home-icon" });
      setIcon(well, icon);
    }
    if (size === "wide") {
      const body = btn.createDiv({ cls: "meinc-home-tile-body" });
      body.createDiv({ cls: "meinc-home-tile-name", text: name });
      if (meta) body.createDiv({ cls: "meinc-home-tile-meta", text: meta });
    } else {
      btn.createDiv({ cls: "meinc-home-tile-name", text: name });
      if (meta) {
        btn.createDiv({ cls: "meinc-home-tile-meta", text: meta });
      }
    }
    btn.onclick = onClick;
  }

  addRow(group, { name, meta, muted, icon, tint, index, file, sheet, onClick }) {
    const row = group.createDiv({
      cls: "meinc-home-row" + (muted ? " is-muted" : ""),
      attr: { role: "button", tabindex: "0" },
    });
    row.style.setProperty("--i", String(index || 0));
    if (tint) row.addClass(`is-${tint}`);
    if (icon) {
      const well = row.createDiv({
        cls: "meinc-home-icon" + (tint ? ` is-${tint}` : ""),
      });
      if (tint) well.style.background = `var(--home-${tint})`;
      setIcon(well, icon);
    }
    const body = row.createDiv({ cls: "meinc-home-row-body" });
    body.createDiv({ cls: "meinc-home-row-name", text: name });
    if (meta) body.createDiv({ cls: "meinc-home-row-meta", text: meta });
    if (file && (sheet === "inbox" || isWritablePath(file.path))) {
      const more = row.createEl("button", {
        cls: "meinc-home-more",
        attr: { type: "button", "aria-label": "更多" },
      });
      setIcon(more, "ellipsis");
      more.onclick = (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        if (sheet === "inbox") this.showInboxSheet(file);
        else this.showItemSheet(file);
      };
    }
    const chevron = row.createDiv({ cls: "meinc-home-chevron" });
    setIcon(chevron, "chevron-right");
    row.addEventListener("click", onClick);
    row.addEventListener("keydown", (ev) => {
      if (ev.target !== row) return;
      if (ev.key === "Enter" || ev.key === " ") {
        ev.preventDefault();
        onClick(ev);
      }
    });
  }

  showCreateSheet(screen) {
    new ActionSheet(this.app, "新建", [
      {
        name: "笔记",
        onClick: () => this.createNote(screen.path),
      },
      {
        name: "文件夹",
        onClick: () => this.createFolder(screen.path),
      },
    ]).open();
  }

  showItemSheet(file) {
    new ActionSheet(this.app, displayName(file), [
      {
        name: "移动",
        onClick: () => new MovePickerModal(this.app, this.plugin, file).open(),
      },
      {
        name: "重命名",
        onClick: () => this.renameItem(file),
      },
      {
        name: "删除",
        danger: true,
        onClick: () => this.deleteItem(file),
      },
    ]).open();
  }

  showInboxSheet(file) {
    new ActionSheet(this.app, displayName(file), [
      {
        name: "已读",
        onClick: async () => {
          await this.plugin.markInboxRead(file);
          new Notice("已读");
          this.render();
        },
      },
    ]).open();
  }

  deleteItem(file) {
    if (!isWritablePath(file.path)) return;
    const name = displayName(file);
    let message = `确定删除「${name}」？可在废纸篓找回。`;
    if (file instanceof TFolder) {
      const n = descendantCount(file);
      message = n
        ? `将删除文件夹「${name}」及其中 ${n} 项。可在废纸篓找回。`
        : `确定删除文件夹「${name}」？可在废纸篓找回。`;
    }
    new ConfirmModal(this.app, {
      title: "删除",
      message,
      confirmText: "删除",
      danger: true,
      onConfirm: async () => {
        try {
          await this.app.fileManager.trashFile(file);
          new Notice("已删除");
        } catch (_) {
          new Notice("删除失败");
        }
      },
    }).open();
  }

  createNote(folderPath) {
    if (!isWritablePath(folderPath)) return;
    new NameModal(this.app, {
      title: "新建笔记",
      placeholder: "笔记名称",
      confirm: "创建",
      onSubmit: async (name) => {
        const path = uniquePath(this.app, folderPath, name, "md");
        try {
          const file = await this.app.vault.create(path, "");
          if (file instanceof TFile) await this.plugin.openFile(file);
        } catch (_) {
          new Notice("创建失败");
        }
      },
    }).open();
  }

  createFolder(folderPath) {
    if (!isWritablePath(folderPath)) return;
    new NameModal(this.app, {
      title: "新建文件夹",
      placeholder: "文件夹名称",
      confirm: "创建",
      onSubmit: async (name) => {
        const path = uniquePath(this.app, folderPath, name, "");
        try {
          await this.app.vault.createFolder(path);
          new Notice("已创建文件夹");
          this.render();
        } catch (_) {
          new Notice("创建失败");
        }
      },
    }).open();
  }

  renameItem(file) {
    if (!isWritablePath(file.path)) return;
    new NameModal(this.app, {
      title: "重命名",
      placeholder: "新名称",
      initial: displayName(file),
      confirm: "完成",
      onSubmit: async (name) => {
        const parent = file.parent?.path;
        if (!parent) return;
        const dest =
          file instanceof TFile
            ? `${parent}/${name}.${file.extension}`
            : `${parent}/${name}`;
        if (dest === file.path) return;
        if (this.app.vault.getAbstractFileByPath(dest)) {
          new Notice("已有同名文件");
          return;
        }
        try {
          await this.app.fileManager.renameFile(file, dest);
          new Notice("已重命名");
        } catch (_) {
          new Notice("重命名失败");
        }
      },
    }).open();
  }
}

class HomeDock {
  constructor(plugin) {
    this.plugin = plugin;
    this.el = null;
  }

  mount() {
    if (this.el) return;
    const btn = document.createElement("button");
    btn.className = "meinc-home-dock";
    btn.type = "button";
    btn.setAttribute("aria-label", "打开首页");
    setIcon(btn, "home");
    btn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (this.plugin.folderResume()) {
        this.plugin.activateHome({ restore: true });
      } else {
        this.plugin.activateHome();
      }
    });
    document.body.appendChild(btn);
    this.el = btn;

    this._onViewport = () => this.position();
    window.visualViewport?.addEventListener("resize", this._onViewport);
    window.visualViewport?.addEventListener("scroll", this._onViewport);
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("active-leaf-change", () => this.sync())
    );
    this.plugin.registerEvent(
      this.plugin.app.workspace.on("layout-change", () => this.sync())
    );
    this.sync();
    this.position();
  }

  position() {
    if (!this.el) return;
    const vv = window.visualViewport;
    if (!vv) {
      this.el.style.bottom = "calc(12px + env(safe-area-inset-bottom))";
      return;
    }
    const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
    this.el.style.bottom = `${12 + kb}px`;
  }

  sync() {
    if (!this.el) return;
    const onHome = !!this.plugin.app.workspace.getActiveViewOfType(HomeView);
    const resume = this.plugin.folderResume();
    if (onHome) {
      this.el.classList.add("is-hidden");
      this.el.classList.remove("is-back");
      return;
    }
    this.el.classList.remove("is-hidden");
    this.el.replaceChildren();
    if (resume) {
      this.el.classList.add("is-back");
      const ico = document.createElement("span");
      ico.className = "meinc-home-dock-ico";
      setIcon(ico, "chevron-left");
      const lab = document.createElement("span");
      lab.className = "meinc-home-dock-label";
      lab.textContent = resume.title;
      this.el.appendChild(ico);
      this.el.appendChild(lab);
      this.el.setAttribute("aria-label", `返回${resume.title}`);
    } else {
      this.el.classList.remove("is-back");
      setIcon(this.el, "home");
      this.el.setAttribute("aria-label", "打开首页");
    }
  }

  unmount() {
    window.visualViewport?.removeEventListener("resize", this._onViewport);
    window.visualViewport?.removeEventListener("scroll", this._onViewport);
    this.el?.remove();
    this.el = null;
  }
}

class HomeSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "首页" });

    new Setting(containerEl)
      .setName("启动时打开首页")
      .setDesc("打开这个库时，先进入 App 首页")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.openOnStart).onChange(async (v) => {
          this.plugin.settings.openOnStart = v;
          await this.plugin.saveSettings();
        })
      );

    containerEl.createEl("h3", { text: "Timebox" });

    new Setting(containerEl)
      .setName("时长预设")
      .setDesc("逗号分隔，例如 5, 10, 15, 25, 45")
      .addText((t) => {
        t.setValue(String(this.plugin.settings.timeboxPresetsText || "")).onChange(
          async (v) => {
            this.plugin.settings.timeboxPresetsText = String(v || "").trim();
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("默认分钟")
      .setDesc("未记住上次时，开始一块预选的时长")
      .addText((t) => {
        t.inputEl.type = "number";
        t.setValue(String(this.plugin.settings.timeboxDefaultMin)).onChange(
          async (v) => {
            const minutes = clampTimeboxPresetMinutes(Number(v) || 15);
            this.plugin.settings.timeboxDefaultMin = minutes;
            if (this.plugin.timebox?.state.status === "idle") {
              this.plugin.timebox.defaultMin = minutes;
              this.plugin.timebox.state.durationMs = minutes * 60_000;
              this.plugin.timebox.state.remainingMs = minutes * 60_000;
              this.plugin.settings.timebox = this.plugin.timebox.snapshot();
            }
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("记住上次时长")
      .setDesc("打开开始小窗时优先选中上一次用的分钟数")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.timeboxRememberLastDuration !== false)
          .onChange(async (v) => {
            this.plugin.settings.timeboxRememberLastDuration = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("每日目标（块）")
      .setDesc("0 表示关闭目标圆点")
      .addText((t) => {
        t.inputEl.type = "number";
        t.setValue(String(this.plugin.settings.timeboxDailyGoal ?? 4)).onChange(
          async (v) => {
            this.plugin.settings.timeboxDailyGoal = Math.max(
              0,
              Math.round(Number(v) || 0)
            );
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("加时步长（分）")
      .setDesc("控制小窗里「+N 分」的 N")
      .addText((t) => {
        t.inputEl.type = "number";
        t.setValue(String(this.plugin.settings.timeboxExtendStepMin ?? 5)).onChange(
          async (v) => {
            this.plugin.settings.timeboxExtendStepMin = clampTimeboxPresetMinutes(
              Number(v) || 5
            );
            await this.plugin.saveSettings();
          }
        );
      });

    new Setting(containerEl)
      .setName("开始提示音")
      .setDesc("点「开始」时轻响一声")
      .addToggle((t) =>
        t
          .setValue(this.plugin.settings.timeboxStartSoundOn !== false)
          .onChange(async (v) => {
            this.plugin.settings.timeboxStartSoundOn = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("结束提示音")
      .setDesc("一块走完时响一声")
      .addToggle((t) =>
        t.setValue(this.plugin.settings.timeboxEndSoundOn !== false).onChange(
          async (v) => {
            this.plugin.settings.timeboxEndSoundOn = v;
            this.plugin.settings.timeboxSoundOn = v;
            await this.plugin.saveSettings();
          }
        )
      );

    containerEl.createEl("h3", { text: "Grokbot 信箱" });
    containerEl.createEl("p", {
      cls: "setting-item-description",
      text: "桌面版打开 routine「Me.Inc 信箱唤醒」，点 POST to / key 字段本身复制。要的是 https://api2.cursor.sh/… 和 crsr_…，不要复制 grokbot:// 跳转链接。不要写进笔记。",
    });

    new Setting(containerEl)
      .setName("Webhook URL")
      .setDesc("https://api2.cursor.sh/automations/webhook/…")
      .addText((t) => {
        t.setPlaceholder("https://api2.cursor.sh/automations/webhook/…")
          .setValue(this.plugin.settings.mailboxWebhookUrl)
          .onChange(async (v) => {
            this.plugin.settings.mailboxWebhookUrl =
              normalizeMailboxWebhookUrl(v);
            await this.plugin.saveSettings();
          });
        t.inputEl.setAttribute("autocomplete", "off");
      });

    new Setting(containerEl)
      .setName("Sender key")
      .setDesc("crsr_ 开头；若复制了整段 header，会自动去掉 Bearer")
      .addText((t) => {
        t.setPlaceholder("crsr_…")
          .setValue(this.plugin.settings.mailboxSenderKey)
          .onChange(async (v) => {
            this.plugin.settings.mailboxSenderKey =
              normalizeMailboxSenderKey(v);
            await this.plugin.saveSettings();
          });
        t.inputEl.type = "password";
        t.inputEl.setAttribute("autocomplete", "off");
      });

    new Setting(containerEl)
      .setName("测试唤醒")
      .setDesc("立刻 POST 一次。200 只表示开始跑，不表示回信写完。")
      .addButton((b) =>
        b.setButtonText("测试").onClick(async () => {
          await this.plugin.testMailboxWake();
        })
      );
  }
}

class MeincHomePlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.resumeState = null;
    this.mailboxWakeTimer = null;
    this.inboxReadWakeTimer = null;
    this.inboxReadWakePending = null;
    this.mailboxLastHash = "";
    this.timeboxListeners = new Set();
    this.timeboxSessions = [];
    this.timeboxSessionSaveTimer = null;
    this.timeboxPendingReconcile = false;
    this.timeboxControlModal = null;
    this.ensureTimeboxDeviceId();
    this.timebox = new TimeboxEngine({
      initialState: this.settings.timebox,
      defaultMin: this.settings.timeboxDefaultMin,
      onChange: (state, reason) => this.handleTimeboxChange(state, reason),
      onComplete: (session) => this.handleTimeboxComplete(session, { reconcile: false }),
      onAbandon: (session) => this.handleTimeboxAbandon(session),
    });
    this.timeboxPendingReconcile = true;
    this.timebox.reconcile();
    this.timeboxPendingReconcile = false;
    this.settings.timebox = this.timebox.snapshot();
    this.compoundToday = emptyCompoundDay();
    this.reviewLedger = null;
    void this.reloadTimeboxSessions();
    void this.reloadCompoundToday();

    this.registerView(VIEW_TYPE_HOME, (leaf) => new HomeView(leaf, this));

    this.addRibbonIcon("home", "打开首页", () => {
      this.activateHome();
    });

    this.addCommand({
      id: "open-home",
      name: "打开首页",
      icon: "home",
      callback: () => this.activateHome(),
    });


    this.addCommand({
      id: "start-pause-timebox",
      name: "开始或暂停 Timebox",
      icon: "timer",
      callback: () => this.toggleTimebox(),
    });

    this.addCommand({
      id: "abandon-timebox",
      name: "放弃 Timebox",
      callback: () => this.abandonTimebox(),
    });

    this.statusBar = this.addStatusBarItem();
    this.statusBar.addClass("meinc-home-timebox-status");
    this.statusBar.addEventListener("click", () => this.handleTimeboxStatusBarClick());
    this.updateTimeboxStatusBar();
    this.registerInterval(window.setInterval(() => this.timebox.tick(), 500));

    this.addCommand({
      id: "back",
      name: "返回上一层",
      icon: "chevron-left",
      callback: () => {
        if (this.folderResume()) this.activateHome({ restore: true });
        else this.activateHome();
      },
    });

    this.addSettingTab(new HomeSettingTab(this.app, this));

    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.migrateInboxDone(oldPath, file?.path);
        void this.migrateReviewLedgerPath(oldPath, file?.path);
      })
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.clearInboxDone(file?.path);
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile) || file.path !== MAILBOX_NOTE) return;
        this.scheduleMailboxWake(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile) || file.path !== MAILBOX_NOTE) return;
        this.scheduleMailboxWake(file);
      })
    );
    this.registerEvent(
      this.app.vault.on("modify", (file) => {
        if (!(file instanceof TFile)) return;
        if (!file.path.startsWith(`${TIMEBOX_SESSIONS_DIR}/sessions-`)) return;
        void this.reloadTimeboxSessions();
      })
    );
    this.registerEvent(
      this.app.vault.on("create", (file) => {
        if (!(file instanceof TFile)) return;
        if (!file.path.startsWith(`${TIMEBOX_SESSIONS_DIR}/sessions-`)) return;
        void this.reloadTimeboxSessions();
      })
    );
    const onCompoundFile = (file, oldPath) => {
      const paths = [file?.path, oldPath].filter(Boolean);
      for (const item of paths) void this.handleCompoundVaultChange(item);
    };
    this.registerEvent(this.app.vault.on("modify", (file) => onCompoundFile(file)));
    this.registerEvent(this.app.vault.on("create", (file) => onCompoundFile(file)));
    this.registerEvent(this.app.vault.on("delete", (file) => onCompoundFile(file)));
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => onCompoundFile(file, oldPath))
    );

    this.dock = new HomeDock(this);
    this.app.workspace.onLayoutReady(async () => {
      await this.primeMailboxHash();
      await this.seedInboxIfNeeded();
      await this.backfillRecentInboxIfNeeded();
      await this.syncInboxDoneMirror();
      await this.ensureReviewLedgerReady();
      this.dock.mount();
      if (!this.settings.openOnStart) return;
      window.setTimeout(() => this.activateHome(), 80);
    });
  }

  onunload() {
    if (this.mailboxWakeTimer) {
      window.clearTimeout(this.mailboxWakeTimer);
      this.mailboxWakeTimer = null;
    }
    if (this.inboxReadWakeTimer) {
      window.clearTimeout(this.inboxReadWakeTimer);
      this.inboxReadWakeTimer = null;
    }
    if (this.timeboxSessionSaveTimer) {
      window.clearTimeout(this.timeboxSessionSaveTimer);
      this.timeboxSessionSaveTimer = null;
    }
    this.inboxReadWakePending = null;
    this.dock?.unmount();
  }

  hasMailboxWebhook() {
    return !mailboxWebhookProblem(
      this.settings.mailboxWebhookUrl,
      this.settings.mailboxSenderKey
    );
  }

  async primeMailboxHash() {
    const file = this.app.vault.getAbstractFileByPath(MAILBOX_NOTE);
    if (!(file instanceof TFile)) return;
    try {
      const text = await this.app.vault.read(file);
      this.mailboxLastHash = mailboxContentHash(text);
    } catch (_) {}
  }

  scheduleMailboxWake(file) {
    if (this.mailboxWakeTimer) window.clearTimeout(this.mailboxWakeTimer);
    this.mailboxWakeTimer = window.setTimeout(() => {
      this.mailboxWakeTimer = null;
      this.wakeMailbox(file, { silentIfUnchanged: true });
    }, MAILBOX_WAKE_DEBOUNCE_MS);
  }

  async wakeMailbox(file, opts = {}) {
    if (!(file instanceof TFile)) return false;
    let text = "";
    try {
      text = await this.app.vault.read(file);
    } catch (_) {
      return false;
    }
    const etag = mailboxContentHash(text);
    if (opts.silentIfUnchanged && etag === this.mailboxLastHash) return false;
    this.mailboxLastHash = etag;
    return this.postMailboxWebhook(
      {
        path: MAILBOX_NOTE,
        etag,
        preview: mailboxPreview(text),
      },
      {
        notifyOk: opts.notifyOk,
        notifyProblem: !opts.silentIfUnchanged,
      }
    );
  }

  async postMailboxWebhook(body, opts = {}) {
    const url = normalizeMailboxWebhookUrl(this.settings.mailboxWebhookUrl);
    const key = normalizeMailboxSenderKey(this.settings.mailboxSenderKey);
    const problem = mailboxWebhookProblem(url, key);
    if (problem) {
      if (opts.notifyProblem) new Notice(problem);
      return false;
    }

    try {
      const res = await requestUrl({
        url,
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });
      if (res.status !== 200) {
        new Notice(`唤醒失败：${res.status}`);
        return false;
      }
      if (opts.notifyOk) new Notice("已唤醒 Grokbot");
      return true;
    } catch (err) {
      const status = err && err.status;
      const hint = status ? `唤醒失败：${status}` : "唤醒失败：网络或地址无效";
      new Notice(hint);
      return false;
    }
  }

  scheduleInboxReadWake(stream, path) {
    if (!stream || !WAKE_ON_READ_STREAMS.has(stream.id)) return;
    this.inboxReadWakePending = {
      event: "inbox_read",
      stream: stream.id,
      path,
    };
    if (this.inboxReadWakeTimer) window.clearTimeout(this.inboxReadWakeTimer);
    this.inboxReadWakeTimer = window.setTimeout(() => {
      this.inboxReadWakeTimer = null;
      const pending = this.inboxReadWakePending;
      this.inboxReadWakePending = null;
      if (!pending) return;
      this.postMailboxWebhook(pending);
    }, MAILBOX_WAKE_DEBOUNCE_MS);
  }

  async testMailboxWake() {
    const file = this.app.vault.getAbstractFileByPath(MAILBOX_NOTE);
    if (!(file instanceof TFile)) {
      new Notice("找不到 INBOX.md");
      return;
    }
    this.mailboxLastHash = "";
    await this.wakeMailbox(file, { notifyOk: true });
  }

  async appendMailboxMessage({ to, body, notePath }) {
    const block = formatMailboxBlock({ to, body, notePath });
    await this.ensureFolders(MAILBOX_NOTE);
    let file = this.app.vault.getAbstractFileByPath(MAILBOX_NOTE);
    if (!(file instanceof TFile)) {
      const seed = [
        "# Me.Inc ↔ Obsidian 异步信箱",
        "",
        "<!-- 新问题从下面 append -->",
        "",
        block,
      ].join("\n");
      await this.app.vault.create(MAILBOX_NOTE, seed);
      return;
    }
    const current = await this.app.vault.read(file);
    const sep = current.endsWith("\n") ? "\n" : "\n\n";
    await this.app.vault.modify(file, current + sep + block);
  }

  async loadSettings() {
    const saved = (await this.loadData()) || {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, saved);
    this.settings.inboxDone =
      saved.inboxDone && typeof saved.inboxDone === "object"
        ? Object.assign({}, saved.inboxDone)
        : {};
    this.settings.mailboxWebhookUrl = normalizeMailboxWebhookUrl(
      this.settings.mailboxWebhookUrl
    );
    this.settings.mailboxSenderKey = normalizeMailboxSenderKey(
      this.settings.mailboxSenderKey
    );
    this.settings.timeboxDefaultMin = clampTimeboxPresetMinutes(
      this.settings.timeboxDefaultMin || 15
    );
    if (!String(this.settings.timeboxPresetsText || "").trim()) {
      this.settings.timeboxPresetsText = DEFAULT_SETTINGS.timeboxPresetsText;
    }
    this.settings.timeboxRememberLastDuration =
      this.settings.timeboxRememberLastDuration !== false;
    this.settings.timeboxDailyGoal = Math.max(
      0,
      Math.round(Number(this.settings.timeboxDailyGoal) || 0)
    );
    this.settings.timeboxExtendStepMin = clampTimeboxPresetMinutes(
      this.settings.timeboxExtendStepMin || 5
    );
    this.settings.timeboxStartSoundOn = this.settings.timeboxStartSoundOn !== false;
    if (saved.timeboxEndSoundOn == null && saved.timeboxSoundOn != null) {
      this.settings.timeboxEndSoundOn = saved.timeboxSoundOn !== false;
    } else {
      this.settings.timeboxEndSoundOn = this.settings.timeboxEndSoundOn !== false;
    }
    this.settings.timeboxSoundOn = this.settings.timeboxEndSoundOn;
    if (this.settings.timeboxLastDurationMs != null) {
      this.settings.timeboxLastDurationMs = clampTimeboxDurationMs(
        this.settings.timeboxLastDurationMs
      );
    }
    this.settings.timebox = normalizeTimebox(
      saved.timebox,
      this.settings.timeboxDefaultMin
    );
    if (Object.prototype.hasOwnProperty.call(saved, "timeboxTodos")) {
      delete this.settings.timeboxTodos;
      await this.saveSettings();
    }
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  addTimeboxListener(fn) {
    if (!this.timeboxListeners) this.timeboxListeners = new Set();
    this.timeboxListeners.add(fn);
  }

  removeTimeboxListener(fn) {
    this.timeboxListeners?.delete(fn);
  }

  notifyTimebox(reason) {
    for (const fn of this.timeboxListeners || []) {
      try {
        fn(reason);
      } catch (_) {}
    }
  }

  handleTimeboxChange(state, reason) {
    this.settings.timebox = state;
    this.updateTimeboxStatusBar();
    this.notifyTimebox(reason);
    if (reason !== "tick") void this.saveSettings();
  }

  handleTimeboxComplete(session, opts = {}) {
    const payload = normalizeTimeboxSession(session);
    if (!payload) return;
    payload.deviceId = this.ensureTimeboxDeviceId();
    if (this.timeboxPendingReconcile || opts.reconcile) {
      this.appendTimeboxSession(payload);
      void this.flushTimeboxSessions();
      return;
    }
    this.settings.timeboxLastDurationMs = payload.plannedMs;
    void this.saveSettings();
    if (this.settings.timeboxEndSoundOn !== false) this.playTimeboxChime();
    this.timeboxControlModal?.close();
    this.timeboxControlModal = null;
    new TimeboxDoneModal(this.app, this, payload).open();
  }

  handleTimeboxAbandon(session) {
    const payload = normalizeTimeboxSession(session);
    if (!payload) return;
    if (payload.focusedMs < TIMEBOX_ABANDON_MIN_MS) return;
    payload.deviceId = this.ensureTimeboxDeviceId();
    this.appendTimeboxSession(payload);
    void this.flushTimeboxSessions();
    this.timeboxControlModal?.close();
    this.timeboxControlModal = null;
  }

  ensureTimeboxDeviceId() {
    if (!this.settings.timeboxDeviceId) {
      this.settings.timeboxDeviceId = timeboxSessionId();
      void this.saveSettings();
    }
    return this.settings.timeboxDeviceId;
  }

  timeboxSessionsFilePath() {
    return `${TIMEBOX_SESSIONS_DIR}/sessions-${this.ensureTimeboxDeviceId()}.json`;
  }

  async ensureTimeboxSessionsFolder() {
    const parts = TIMEBOX_SESSIONS_DIR.split("/");
    let path = "";
    for (const part of parts) {
      path = path ? `${path}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(path)) {
        await this.app.vault.createFolder(path);
      }
    }
  }

  getTimeboxPresetMinutes() {
    return parseTimeboxPresetMinutes(this.settings.timeboxPresetsText);
  }

  resolveTimeboxStartMinutes(durationMs) {
    if (durationMs) {
      return clampTimeboxPresetMinutes(Math.round(Number(durationMs) / 60_000));
    }
    if (
      this.settings.timeboxRememberLastDuration !== false &&
      this.settings.timeboxLastDurationMs
    ) {
      return clampTimeboxPresetMinutes(
        Math.round(this.settings.timeboxLastDurationMs / 60_000)
      );
    }
    return clampTimeboxPresetMinutes(this.settings.timeboxDefaultMin || 15);
  }

  getTimeboxStats(extraSessions = []) {
    return summarizeTimeboxStats(
      mergeTimeboxSessions(this.timeboxSessions, extraSessions),
      Date.now(),
      { goal: this.settings.timeboxDailyGoal || 0 }
    );
  }

  async reloadTimeboxSessions() {
    const folder = this.app.vault.getAbstractFileByPath(TIMEBOX_SESSIONS_DIR);
    if (!(folder instanceof TFolder)) {
      this.timeboxSessions = [];
      this.notifyTimebox("sessions");
      return;
    }
    const lists = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile)) continue;
      if (!child.name.startsWith("sessions-") || !child.name.endsWith(".json")) {
        continue;
      }
      try {
        const raw = JSON.parse(await this.app.vault.read(child));
        if (Array.isArray(raw)) lists.push(raw);
      } catch (_) {}
    }
    this.timeboxSessions = pruneTimeboxSessions(mergeTimeboxSessions(...lists));
    this.notifyTimebox("sessions");
  }

  appendTimeboxSession(session) {
    const normalized = normalizeTimeboxSession(session);
    if (!normalized) return;
    this.timeboxSessions = pruneTimeboxSessions(
      mergeTimeboxSessions(this.timeboxSessions, [normalized])
    );
  }

  scheduleTimeboxSessionSave() {
    if (this.timeboxSessionSaveTimer) {
      window.clearTimeout(this.timeboxSessionSaveTimer);
    }
    this.timeboxSessionSaveTimer = window.setTimeout(() => {
      this.timeboxSessionSaveTimer = null;
      void this.flushTimeboxSessions();
    }, TIMEBOX_SESSION_SAVE_DEBOUNCE_MS);
  }

  async flushTimeboxSessions() {
    await this.ensureTimeboxSessionsFolder();
    const deviceId = this.ensureTimeboxDeviceId();
    const mine = this.timeboxSessions.filter(
      (session) => !session.deviceId || session.deviceId === deviceId
    );
    const path = this.timeboxSessionsFilePath();
    const payload = JSON.stringify(
      pruneTimeboxSessions(mine).map((session) => ({
        ...session,
        deviceId,
      })),
      null,
      2
    );
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!(file instanceof TFile)) {
      await this.app.vault.create(path, payload);
      return;
    }
    if (file instanceof TFile) await this.app.vault.modify(file, payload);
  }

  finalizeTimeboxSession(session) {
    const payload = normalizeTimeboxSession(session);
    if (!payload) return;
    payload.deviceId = this.ensureTimeboxDeviceId();
    this.appendTimeboxSession(payload);
    this.scheduleTimeboxSessionSave();
    this.notifyTimebox("sessions");
  }

  openTimeboxStart(opts = {}) {
    if ((this.timebox?.state.status || "idle") !== "idle") {
      new Notice("先停掉当前这块");
      return;
    }
    new TimeboxStartModal(this.app, this, opts).open();
  }

  openTimeboxControl() {
    const status = this.timebox?.state.status || "idle";
    if (status === "idle") {
      this.openTimeboxStart();
      return;
    }
    this.timeboxControlModal?.close();
    this.timeboxControlModal = new TimeboxControlModal(this.app, this);
    this.timeboxControlModal.open();
  }

  handleTimeboxStatusBarClick() {
    const status = this.timebox?.state.status || "idle";
    if (status === "idle") {
      void this.activateHome();
      return;
    }
    this.openTimeboxControl();
  }

  isCompoundNotePath(filePath) {
    return (
      typeof filePath === "string" &&
      filePath.startsWith(`${COMPOUND_DIR}/`) &&
      filePath.endsWith(".md")
    );
  }

  refreshCompoundViews() {
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HOME)) {
      if (leaf.view instanceof HomeView) leaf.view.refreshCompoundChip();
    }
  }

  async reloadCompoundToday() {
    const today = compoundDayKeyFromTime(Date.now());
    const path = compoundWeekPath(today);
    const file = this.app.vault.getAbstractFileByPath(path);
    let day = emptyCompoundDay();
    if (file instanceof TFile) {
      try {
        const parsed = parseCompoundWeek(await this.app.vault.read(file));
        day = normalizeCompoundDay(parsed.days[today]);
      } catch (_) {}
    }
    this.compoundToday = day;
    this.refreshCompoundViews();
  }

  async handleCompoundVaultChange(filePath) {
    if (!this.isCompoundNotePath(filePath)) return;
    await this.reloadCompoundToday();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE_HOME)) {
      const view = leaf.view;
      if (!(view instanceof HomeView)) continue;
      const editor = view.compoundEditor;
      if (
        view.current().type !== "compound" ||
        !editor ||
        editor.writing ||
        view.compoundDirty()
      ) {
        continue;
      }
      const weekPath = compoundWeekPath(editor.weekStart);
      const yesterdayPath = compoundWeekPath(addCompoundDays(editor.today, -1));
      if (filePath !== weekPath && filePath !== yesterdayPath) continue;
      await view.loadCompoundEditor(editor.dayKey);
      if (view.current().type === "compound") view.render();
    }
  }

  async saveCompoundDay(dayKey, entry) {
    const weekStart = compoundWeekStart(dayKey);
    const path = compoundWeekPath(weekStart);
    if (!weekStart || !path) throw new Error("bad compound day");
    await this.ensureFolders(path);
    let file = this.app.vault.getAbstractFileByPath(path);
    let existing = "";
    if (file instanceof TFile) existing = await this.app.vault.read(file);
    if (file instanceof TFile && existing.trim() && !isCompoundWeekNote(existing)) {
      new Notice("这周的笔记不是复利格式，没有覆盖");
      return { path, deleted: false, skipped: true };
    }
    const parsed = parseCompoundWeek(existing);
    const days = mergeCompoundDay(parsed.days, dayKey, entry);
    const payload = renderCompoundWeek(weekStart, days);
    const kept = parseCompoundWeek(payload).days;
    if (!Object.keys(kept).length) {
      if (file instanceof TFile && isCompoundWeekNote(existing)) {
        if (typeof this.app.vault.trash === "function") await this.app.vault.trash(file);
        else await this.app.vault.delete(file);
      }
      if (dayKey === compoundDayKeyFromTime(Date.now())) {
        this.compoundToday = emptyCompoundDay();
        this.refreshCompoundViews();
      }
      return { path, deleted: true, days: {} };
    }
    if (!(file instanceof TFile)) {
      try {
        await this.app.vault.create(path, payload);
      } catch (_) {
        file = this.app.vault.getAbstractFileByPath(path);
        if (!(file instanceof TFile)) throw new Error("create compound week failed");
        await this.app.vault.modify(file, payload);
      }
    } else if (existing !== payload) {
      await this.app.vault.modify(file, payload);
    }
    if (dayKey === compoundDayKeyFromTime(Date.now())) {
      this.compoundToday = normalizeCompoundDay(entry);
      this.refreshCompoundViews();
    }
    return { path, deleted: false, days: kept };
  }

  playTimeboxStartSound() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const start = context.currentTime;
      oscillator.type = "sine";
      oscillator.frequency.value = 392;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.06, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
      oscillator.connect(gain).connect(context.destination);
      oscillator.start(start);
      oscillator.stop(start + 0.2);
      window.setTimeout(() => context.close(), 400);
    } catch (_) {}
  }

  playTimeboxChime() {
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const context = new AudioContext();
      const notes = [523.25, 659.25];
      notes.forEach((frequency, index) => {
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        const start = context.currentTime + index * 0.16;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.exponentialRampToValueAtTime(0.08, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.42);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start);
        oscillator.stop(start + 0.44);
      });
      window.setTimeout(() => context.close(), 1000);
    } catch (_) {}
  }

  updateTimeboxStatusBar() {
    if (!this.statusBar || !this.timebox) return;
    const text = formatTimeboxStatusBar(this.timebox.state);
    this.statusBar.textContent = text;
    this.statusBar.style.display = text ? "" : "none";
    this.statusBar.setAttribute("aria-label", text || "Timebox");
  }

  startTimebox(title, durationMs) {
    const source = this.pendingTimeboxSource || "";
    this.pendingTimeboxSource = "";
    const ok = this.timebox.start(title, durationMs, source);
    if (!ok) return false;
    this.settings.timeboxLastDurationMs = clampTimeboxDurationMs(durationMs);
    if (this.settings.timeboxStartSoundOn !== false) this.playTimeboxStartSound();
    void this.saveSettings();
    return true;
  }

  extendTimebox(ms) {
    return this.timebox.extend(ms);
  }

  finishTimeboxEarly() {
    return this.timebox.finishEarly();
  }

  pauseTimebox() {
    return this.timebox.pause();
  }

  resumeTimebox() {
    return this.timebox.resume();
  }

  abandonTimebox() {
    if (!this.timebox.abandon()) {
      new Notice("现在没有进行中的 Timebox");
      return false;
    }
    return true;
  }

  async toggleTimebox() {
    const status = this.timebox?.state.status || "idle";
    if (status === "running" || status === "paused") {
      this.openTimeboxControl();
      return;
    }
    this.openTimeboxStart();
  }

  newestInboxPaths(items, n) {
    return new Set(items.slice(-n).map((item) => item.file.path));
  }

  async seedInboxIfNeeded() {
    if (this.settings.inboxSeeded) return;
    const now = new Date().toISOString();
    const items = this.listInboxItems({ includeDone: true });
    const keepUnread = this.newestInboxPaths(items, INBOX_SEED_KEEP_UNREAD);
    for (const item of items) {
      if (keepUnread.has(item.file.path)) continue;
      if (!this.settings.inboxDone[item.file.path]) {
        this.settings.inboxDone[item.file.path] = now;
      }
    }
    this.settings.inboxSeeded = true;
    this.settings.inboxBackfillRecent = true;
    await this.saveSettings();
    await this.syncInboxDoneMirror();
  }

  async backfillRecentInboxIfNeeded() {
    if (this.settings.inboxBackfillRecent) return;
    const items = this.listInboxItems({ includeDone: true });
    for (const path of this.newestInboxPaths(items, INBOX_SEED_KEEP_UNREAD)) {
      delete this.settings.inboxDone[path];
    }
    this.settings.inboxBackfillRecent = true;
    await this.saveSettings();
    await this.syncInboxDoneMirror();
  }

  listInboxItems(opts = {}) {
    const includeDone = !!opts.includeDone;
    const items = [];
    for (const stream of INBOX_STREAMS) {
      const folder = this.app.vault.getAbstractFileByPath(stream.folder);
      if (!(folder instanceof TFolder)) continue;
      for (const child of folder.children) {
        if (!(child instanceof TFile) || !NOTE_EXT.has(child.extension)) continue;
        if (isHiddenName(child.name)) continue;
        if (!inboxStreamAccepts(stream, child)) continue;
        const done = !!this.settings.inboxDone[child.path];
        if (!includeDone && done) continue;
        const date = inboxDateFromFile(this.app, child);
        items.push({
          file: child,
          stream,
          date,
          done,
          title: inboxTitle(child, date),
        });
      }
    }
    items.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return displayName(a.file).localeCompare(displayName(b.file), "zh-CN");
    });
    return items;
  }

  inboxMeta() {
    const n = this.listInboxItems().length;
    return n > 0 ? `${n} 则未读` : "";
  }

  reviewHubCounts(now = Date.now()) {
    const lexideck = this.app.plugins?.plugins?.lexideck;
    const english = buildLexiQueueItems(lexideck, now).length;
    const ledger = this.reviewLedger || normalizeLedger({});
    const chinese = listDueProseEntries(ledger, now).length;
    return { english, chinese };
  }

  reviewMeta() {
    const now = Date.now();
    const { english, chinese } = this.reviewHubCounts(now);
    const lexideck = this.app.plugins?.plugins?.lexideck;
    const streak =
      lexideck && typeof lexideck.getDueCount === "function"
        ? lexideck.getDueCount(now).streak
        : 0;
    const parts = [];
    if (english > 0) parts.push(`英 ${english}`);
    if (chinese > 0) parts.push(`语 ${chinese}`);
    if (!parts.length) {
      if (streak > 0) return `已刷完 · 🔥${streak}`;
      return "";
    }
    let line = parts.join(" · ");
    if (streak > 0) line += ` · 🔥${streak}`;
    return line;
  }

  async loadReviewLedger() {
    let raw = {};
    const file = this.app.vault.getAbstractFileByPath(REVIEW_LEDGER_PATH);
    if (file instanceof TFile) {
      try {
        raw = JSON.parse(await this.app.vault.read(file));
      } catch (_) {}
    }
    this.reviewLedger = normalizeLedger(raw);
  }

  async saveReviewLedger() {
    if (!this.reviewLedger) this.reviewLedger = normalizeLedger({});
    const payload = `${JSON.stringify(this.reviewLedger, null, 2)}\n`;
    await this.ensureFolders(REVIEW_LEDGER_PATH);
    let file = this.app.vault.getAbstractFileByPath(REVIEW_LEDGER_PATH);
    if (!(file instanceof TFile)) {
      await this.app.vault.create(REVIEW_LEDGER_PATH, payload);
      return;
    }
    await this.app.vault.modify(file, payload);
  }

  listHonglouPushPaths() {
    const folder = this.app.vault.getAbstractFileByPath(HONGLOU_PUSH_FOLDER);
    if (!(folder instanceof TFolder)) return [];
    const paths = [];
    for (const child of folder.children) {
      if (!(child instanceof TFile) || child.extension !== "md") continue;
      if (isHiddenName(child.name)) continue;
      paths.push(child.path);
    }
    return paths.sort();
  }

  listLibraryArticlePaths() {
    const root = this.app.vault.getAbstractFileByPath(LIBRARY_ROOT);
    if (!(root instanceof TFolder)) return [];
    const out = [];
    const walk = (folder) => {
      for (const child of folder.children) {
        if (isHiddenName(child.name)) continue;
        if (child instanceof TFolder) {
          const top = child.path.slice(LIBRARY_ROOT.length + 1).split("/")[0];
          if (LIBRARY_EXCLUDE_DIRS.has(top) || LIBRARY_EXCLUDE_DIRS.has(child.name)) {
            continue;
          }
          walk(child);
        } else if (child instanceof TFile && child.extension === "md") {
          if (isLibraryArticlePath(child.path)) out.push(child.path);
        }
      }
    };
    walk(root);
    return out.sort((a, b) => a.localeCompare(b, "zh-CN"));
  }

  buildDueProseItems(now = Date.now(), opts = {}) {
    const ledger = this.reviewLedger || normalizeLedger({});
    const picked = opts.allDue
      ? listDueProseEntries(ledger, now)
      : pickDueProse(ledger, now);
    return picked.map((item) => {
      const file = this.app.vault.getAbstractFileByPath(item.path);
      const title = file instanceof TFile ? displayName(file) : item.path;
      const source =
        item.kind === "honglou" ? "红楼梦" : libraryArticleCategory(item.path);
      return {
        type: "prose",
        path: item.path,
        kind: item.kind,
        title,
        source,
      };
    });
  }

  async buildEnglishReviewSession() {
    const now = Date.now();
    const lexideck = this.app.plugins?.plugins?.lexideck;
    const queue = buildLexiQueueItems(lexideck, now);
    return { track: "english", queue, index: 0, flipped: false };
  }

  async buildChineseReviewSession() {
    await this.ensureReviewLedgerReady();
    const now = Date.now();
    const queue = this.buildDueProseItems(now, { allDue: true });
    return { track: "chinese", queue, index: 0, flipped: false };
  }

  async ensureReviewLedgerReady() {
    if (!this.reviewLedger) await this.loadReviewLedger();
    if (this.reviewLedger.staggered) return;
    const paths = this.listHonglouPushPaths();
    const backfill = staggerHonglouBackfill(
      this.settings.inboxDone,
      paths,
      Date.now()
    );
    for (const [path, entry] of Object.entries(backfill)) {
      if (!this.reviewLedger.entries[path]) {
        this.reviewLedger.entries[path] = entry;
      }
    }
    this.reviewLedger.staggered = true;
    await this.saveReviewLedger();
  }

  async registerHonglouRead(path, now = Date.now()) {
    if (!path) return;
    await this.ensureReviewLedgerReady();
    this.reviewLedger.entries[path] = ledgerEntryForHonglouRead(now);
    await this.saveReviewLedger();
  }

  async gradeReviewProse(path, rating) {
    if (!path) return;
    await this.ensureReviewLedgerReady();
    const prev =
      this.reviewLedger.entries[path] ||
      normalizeLedgerEntry({ kind: "article" }, path);
    this.reviewLedger.entries[path] = {
      ...prev,
      kind: prev.kind,
      due: proseDueAfterGrade(rating, Date.now()),
      addedAt: prev.addedAt || Date.now(),
    };
    await this.saveReviewLedger();
  }

  async addArticleToReview(path) {
    if (!path || !isLibraryArticlePath(path)) return;
    await this.ensureReviewLedgerReady();
    this.reviewLedger.entries[path] = ledgerEntryForArticle(path);
    await this.saveReviewLedger();
  }

  async migrateReviewLedgerPath(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return;
    if (!this.reviewLedger) await this.loadReviewLedger();
    if (!this.reviewLedger.entries[oldPath]) return;
    this.reviewLedger.entries[newPath] = this.reviewLedger.entries[oldPath];
    delete this.reviewLedger.entries[oldPath];
    await this.saveReviewLedger();
  }

  async markInboxRead(file) {
    if (!(file instanceof TFile)) return;
    const now = new Date();
    this.settings.inboxDone[file.path] = now.toISOString();
    await this.saveSettings();
    await this.syncInboxDoneMirror();
    const stream = inboxStreamForFile(file);
    if (stream?.id === "honglou") {
      await this.registerHonglouRead(file.path, now.getTime());
    }
    await this.appendInboxAck(file, stream, now);
    this.scheduleInboxReadWake(stream, file.path);
  }

  async migrateInboxDone(oldPath, newPath) {
    if (!oldPath || !newPath || oldPath === newPath) return;
    if (!this.settings.inboxDone[oldPath]) return;
    this.settings.inboxDone[newPath] = this.settings.inboxDone[oldPath];
    delete this.settings.inboxDone[oldPath];
    await this.saveSettings();
    await this.syncInboxDoneMirror();
  }

  async clearInboxDone(filePath) {
    if (!filePath || !this.settings.inboxDone[filePath]) return;
    delete this.settings.inboxDone[filePath];
    await this.saveSettings();
    await this.syncInboxDoneMirror();
  }

  async syncInboxDoneMirror() {
    try {
      const payload = `${JSON.stringify(this.settings.inboxDone || {}, null, 2)}\n`;
      await this.ensureFolders(MAILBOX_INBOX_DONE);
      let file = this.app.vault.getAbstractFileByPath(MAILBOX_INBOX_DONE);
      if (!(file instanceof TFile)) {
        await this.app.vault.create(MAILBOX_INBOX_DONE, payload);
        return;
      }
      await this.app.vault.modify(file, payload);
    } catch (_) {}
  }

  async appendInboxAck(file, stream, now) {
    if (!(file instanceof TFile)) return;
    const line = formatInboxAckLine({
      stream,
      path: file.path,
      now: now || new Date(),
    });
    try {
      await this.ensureFolders(MAILBOX_ACK);
      let ack = this.app.vault.getAbstractFileByPath(MAILBOX_ACK);
      if (!(ack instanceof TFile)) {
        await this.app.vault.create(
          MAILBOX_ACK,
          ["# AI 信箱已读", "", line, ""].join("\n")
        );
        return;
      }
      const current = await this.app.vault.read(ack);
      const sep = current.endsWith("\n") ? "" : "\n";
      await this.app.vault.modify(ack, `${current}${sep}${line}\n`);
    } catch (_) {}
  }

  folderResume() {
    const nav = this.resumeState?.nav;
    if (!nav || nav.length < 2) return null;
    const last = nav[nav.length - 1];
    return {
      title: last.title || last.path || "返回",
      nav,
    };
  }

  captureResumeFromHome() {
    const home = this.app.workspace.getActiveViewOfType(HomeView);
    if (!home || !Array.isArray(home.nav)) {
      return;
    }
    this.resumeState = { nav: cloneNav(home.nav) };
  }

  async activateHome(opts = {}) {
    const restore = !!(opts.restore && this.folderResume());
    const saved = restore ? cloneNav(this.resumeState.nav) : null;
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_HOME)[0];
    if (!leaf) {
      leaf = workspace.getLeaf(false);
      await leaf.setViewState({ type: VIEW_TYPE_HOME, active: true });
    }
    if (leaf.view instanceof HomeView) {
      if (saved) {
        leaf.view.nav = saved;
        leaf.view.render();
      } else {
        const ok = await leaf.view.resetToHome();
        if (ok === false) {
          workspace.revealLeaf(leaf);
          this.dock?.sync();
          return;
        }
      }
    }
    this.resumeState = null;
    workspace.revealLeaf(leaf);
    this.dock?.sync();
  }

  openLexiDeck() {
    const ok = this.app.commands.executeCommandById("lexideck:open-library");
    if (!ok) new Notice("还没有启用 LexiDeck");
  }

  openAgent() {
    const plugin = this.app.plugins?.plugins?.["obsidian-agent-os"];
    if (plugin && typeof plugin.activateView === "function") {
      void plugin.activateView();
      return;
    }
    const ok = this.app.commands.executeCommandById(
      "obsidian-agent-os:obsidian-agent-os-open"
    );
    if (!ok) new Notice("还没有启用 Obsidian Agent OS");
  }

  async openFile(file, mode) {
    if (!(file instanceof TFile)) return;
    this.captureResumeFromHome();
    const leaf = this.app.workspace.getLeaf(false);
    await leaf.setViewState(
      {
        type: "markdown",
        state: {
          file: file.path,
          mode: mode || "source",
          source: false,
        },
        active: true,
      },
      { history: true }
    );
    this.app.workspace.revealLeaf(leaf);
    this.dock?.sync();
  }

  async openToday() {
    const ids = [
      "daily-notes:goto-today",
      "daily-notes:open-todays-daily-note",
    ];
    for (const id of ids) {
      if (this.app.commands.executeCommandById(id)) return;
    }
    await this.openTodayFallback();
  }

  async openTodayFallback() {
    const plugin = this.app.internalPlugins?.plugins?.["daily-notes"];
    const opts = plugin?.instance?.options || {};
    const folder = String(opts.folder || "手记/日记").replace(/\/$/, "");
    const format = opts.format || "YYYY/MM-MMMM/YYYY-MM-DD";
    const moment = window.moment;
    if (!moment) {
      new Notice("无法打开今日日记");
      return;
    }
    const path = `${folder}/${moment().format(format)}.md`;
    await this.ensureFolders(path);
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      try {
        file = await this.app.vault.create(path, "");
      } catch (err) {
        file = this.app.vault.getAbstractFileByPath(path);
        if (!file) {
          new Notice("无法创建今日日记");
          return;
        }
      }
    }
    if (file instanceof TFile) await this.openFile(file);
  }

  async ensureFolders(filePath) {
    const parts = filePath.split("/");
    parts.pop();
    let acc = "";
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part;
      if (this.app.vault.getAbstractFileByPath(acc)) continue;
      try {
        await this.app.vault.createFolder(acc);
      } catch (_) {}
    }
  }
}

require("./activity-ui.js").install(HomeView, MeincHomePlugin);
module.exports = MeincHomePlugin;
