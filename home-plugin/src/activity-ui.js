const { MarkdownRenderer, Notice, TFile, TFolder, setIcon } = require("obsidian");
const {
  contentHash,
  continueItems,
  dayKeyFromTime,
  mergeEvents,
  parseActivityJsonl,
  readingShelves,
  recordsForDay,
  serializeActivityJsonl,
} = require("../activity.js");
const { newWritingNote } = require("../drafts.js");
const { freshRound, gradeRound, prosePrompt, skipRound } = require("../review-round.js");
const {
  appendNextStep,
  extractNextStep,
  latestNextLine,
  pickWorkPath,
  projectFolderFromPath,
} = require("../projects.js");
const { COMPOUND_FIELDS, formatDayRecords } = require("../compound.js");
const {
  buildHistoryBars,
  daySessionDetails,
  resolveHistoryRange,
  sessionMinuteParts,
  shiftCustomRange,
  shiftHistoryAnchor,
} = require("../timebox.js");
const {
  buildLexiQueueItems,
  ledgerEntryForOutput,
  ledgerEntryForPassage,
  listDueProseEntries,
} = require("../review-queue.js");

const ACTIVITY_DIR = "agent-inbox/meinc-home";

function weeksAndDate(now = new Date()) {
  const weeks = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
  return {
    weekday: weeks[now.getDay()],
    date: `${now.getMonth() + 1} 月 ${now.getDate()} 日`,
  };
}

function splitFrontmatter(markdown) {
  const text = String(markdown ?? "");
  const match = text.match(/^---\n[\s\S]*?\n---\n?/);
  if (!match) return { meta: "", body: text };
  return { meta: match[0], body: text.slice(match[0].length) };
}

async function writeText(plugin, path, text) {
  await plugin.ensureFolders(path);
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (file instanceof TFile) {
    await plugin.app.vault.modify(file, text);
    return file;
  }
  return plugin.app.vault.create(path, text);
}

async function readText(plugin, path) {
  const file = plugin.app.vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return null;
  return plugin.app.vault.read(file);
}

function header(view, root, title, onBack) {
  const bar = root.createDiv({ cls: "meinc-home-header" });
  const back = bar.createEl("button", {
    cls: "meinc-home-back",
    attr: { "aria-label": "返回", type: "button" },
  });
  setIcon(back, "chevron-left");
  back.onclick = () => {
    if (onBack) onBack();
    else view.back();
  };
  bar.createEl("h1", { cls: "meinc-home-title", text: title });
  return bar;
}

function renderActivityHome(view, root) {
  const { weekday, date } = weeksAndDate();
  const hero = root.createDiv({ cls: "meinc-home-hero" });
  const dateCol = hero.createDiv({ cls: "meinc-home-hero-date" });
  dateCol.createDiv({ cls: "meinc-home-kicker", text: weekday });
  dateCol.createEl("h1", { cls: "meinc-home-date", text: date });
  const focus = hero.createDiv({ cls: "meinc-home-focus" });
  view.mountCompoundChip(focus);
  view.mountTimebox(focus);

  const items = continueItems(view.plugin.activityEvents || []);
  const cont = root.createDiv({ cls: "meinc-home-continue" });
  cont.createDiv({ cls: "meinc-home-kicker", text: "继续做" });
  if (!items.length) {
    const row = cont.createDiv({ cls: "meinc-home-empty-actions" });
    row.createEl("button", { text: "开始写", attr: { type: "button" } }).onclick = () =>
      view.openDraft({ kind: "writing" });
    row.createEl("button", { text: "选篇文章", attr: { type: "button" } }).onclick = () =>
      view.openLibrary();
    row.createEl("button", { text: "开始复习", attr: { type: "button" } }).onclick = () =>
      view.startStudyRound();
  } else {
    const group = cont.createDiv({ cls: "meinc-home-group" });
    items.forEach((item, index) => {
      view.addRow(group, {
        name: item.title,
        meta: item.kind === "read" ? "接着读" : item.kind === "review" ? "接着复习" : "接着写",
        icon: item.kind === "read" ? "book-open" : item.kind === "review" ? "rotate-cw" : "pencil",
        tint: "orange",
        index,
        onClick: () => openContinue(view, item),
      });
    });
  }

  const activities = root.createDiv({ cls: "meinc-home-group" });
  const actions = [
    ["阅读", "book-open", () => view.openLibrary()],
    ["复习", "rotate-cw", () => view.startStudyRound()],
    ["输出", "pen-line", () => view.openDraft({ kind: "output", resume: true })],
    ["写作", "pencil", () => view.openWriting()],
    ["项目", "folder", () => view.openProjects()],
  ];
  actions.forEach(([name, icon, onClick], index) => {
    view.addRow(activities, { name, icon, tint: "blue", index, onClick });
  });

  const aux = root.createDiv({ cls: "meinc-home-group" });
  [
    ["Timebox", "timer", () => view.plugin.openTimeboxStart()],
    ["时间记录", "bar-chart-3", () => view.openTimeboxHistory()],
    ["复利", "sprout", () => view.openCompound()],
    ["Agent", "sparkles", () => view.plugin.openAgent()],
    ["AI 信箱", "inbox", () => view.push({ type: "inbox", title: "AI 信箱" })],
  ].forEach(([name, icon, onClick], index) => {
    view.addRow(aux, { name, icon, tint: "teal", index, onClick });
  });
}

function openContinue(view, item) {
  if (item.kind === "review") {
    view.reviewSession = rehydrateRound(view, {
      queue: item.event.queue || [],
      index: item.event.index || 0,
      revealed: false,
      skipped: [],
      done: false,
    });
    view.push({ type: "review", mode: "round", title: "复习" });
    return;
  }
  if (item.kind === "read" && item.path) {
    view.push({ type: "reader", path: item.path, title: item.title });
    return;
  }
  if (item.path) void view.openDraft({ path: item.path, kind: item.event?.kind || "writing" });
}

function renderLibrary(view, root) {
  header(view, root, "阅读");
  const shelves = readingShelves(view.plugin.activityEvents || [], view.plugin.listLibraryArticlePaths());
  const query = root.createEl("input", {
    cls: "meinc-home-name-input",
    attr: { type: "search", placeholder: "搜索" },
  });
  const host = root.createDiv();
  const draw = () => {
    host.empty();
    const q = query.value.trim();
    const match = (path) => !q || path.toLowerCase().includes(q.toLowerCase());
    section(view, host, "正在读", shelves.reading.filter((item) => match(item.path)).map((item) => item.path));
    section(view, host, "稍后读", shelves.later.filter(match));
    const categories = new Set(shelves.all.map((path) => path.split("/")[1]).filter(Boolean));
    if (categories.size) {
      const chips = host.createDiv({ cls: "meinc-home-compose-to" });
      for (const name of categories) {
        chips.createEl("button", { cls: "meinc-home-chip", text: name, attr: { type: "button" } }).onclick =
          () => {
            query.value = name;
            draw();
          };
      }
    }
    section(view, host, "全部材料", shelves.all.filter(match));
  };
  query.addEventListener("input", draw);
  draw();
}

function section(view, host, title, paths) {
  if (!paths.length) return;
  host.createDiv({ cls: "meinc-home-kicker", text: title });
  const group = host.createDiv({ cls: "meinc-home-group" });
  paths.slice(0, 40).forEach((path, index) => {
    const name = path.split("/").pop().replace(/\.md$/, "");
    view.addRow(group, {
      name,
      meta: path.split("/")[1] || "",
      icon: "file-text",
      tint: "purple",
      index,
      onClick: () => view.push({ type: "reader", path, title: name }),
    });
  });
}

function renderReader(view, root) {
  const screen = view.current();
  header(view, root, screen.title || "阅读");
  const page = root.createDiv({ cls: "meinc-reader" });
  const tools = page.createDiv({ cls: "meinc-reader-tools" });
  tools.createEl("button", { text: "目录", attr: { type: "button" } });
  const status = page.createDiv({ cls: "meinc-reader-status", text: "正在打开" });
  void loadReader(view, page, status, tools);
}

async function loadReader(view, page, status, tools) {
  const screen = view.current();
  const text = await readText(view.plugin, screen.path);
  if (view.current().path !== screen.path) return;
  if (text == null) {
    status.setText("没有找到这篇");
    return;
  }
  if (/\.(pdf|epub)$/i.test(screen.path)) {
    const file = view.app.vault.getAbstractFileByPath(screen.path);
    if (file instanceof TFile) await view.plugin.openFile(file);
    return;
  }
  status.remove();
  const parts = splitFrontmatter(text);
  view.readerState = {
    path: screen.path,
    title: screen.title || screen.path,
    markdown: text,
    progress: 0,
  };
  if (parts.meta) {
    const meta = page.createEl("details", { cls: "meinc-reader-meta" });
    meta.createEl("summary", { text: "来源" });
    meta.createEl("pre", { text: parts.meta });
  }
  const body = page.createDiv({ cls: "meinc-reader-page" });
  await MarkdownRenderer.render(view.app, parts.body, body, screen.path, view);
  const saved = (view.plugin.activityEvents || []).find(
    (event) => event.id === `read:${screen.path}`
  );
  const scroller = page.closest(".meinc-home-scroll");
  if (scroller && saved && Number.isFinite(saved.progress)) {
    requestAnimationFrame(() => {
      scroller.scrollTop = saved.progress * scroller.scrollHeight;
    });
  }
  const bar = page.createDiv({ cls: "meinc-reader-selection" });
  bar.hidden = true;
  const remember = () => {
    const ratio = scroller && scroller.scrollHeight
      ? scroller.scrollTop / scroller.scrollHeight
      : 0;
    view.readerState.progress = ratio;
    view.plugin.scheduleActivity({
      id: `read:${screen.path}`,
      type: "read",
      path: screen.path,
      title: view.readerState.title,
      progress: ratio,
    });
  };
  if (view._readerScroll && scroller) {
    scroller.removeEventListener("scroll", view._readerScroll);
  }
  view._readerScroll = remember;
  scroller?.addEventListener("scroll", view._readerScroll, { passive: true });
  body.addEventListener("pointerup", () => {
    const selected = String(window.getSelection?.() || "").trim();
    view.readerSelection = selected;
    bar.hidden = !selected;
    bar.empty();
    if (!selected) return;
    bar.createEl("button", { text: "写几句", attr: { type: "button" } }).onclick = () => {
      view.openDraft({
        kind: "output",
        seed: `> ${selected}\n\n`,
      });
    };
    bar.createEl("button", { text: "加入复习", attr: { type: "button" } }).onclick = () => {
      void view.plugin.addPassageToReview(screen.path, selected);
      new Notice("已加入复习");
    };
    bar.createEl("button", { text: "问 Agent", attr: { type: "button" } }).onclick = () => {
      void askAgent(view.plugin, "请根据我正在读的这一篇和选中的段落回答。不要改文件。");
    };
  });
  tools.querySelector("button").onclick = () => {
    const headings = Array.from(body.querySelectorAll("h1, h2, h3"));
    if (!headings.length) {
      new Notice("这篇没有目录");
      return;
    }
    headings[0].scrollIntoView({ block: "start" });
  };
  page.createEl("button", { text: "稍后读", attr: { type: "button" } }).onclick = () => {
    void view.plugin.appendActivity({
      id: `later:${screen.path}`,
      type: "later",
      path: screen.path,
      title: view.readerState.title,
    });
    new Notice("已放进稍后读");
  };
  const size = page.createDiv({ cls: "meinc-reader-tools" });
  size.createEl("button", { text: "字号", attr: { type: "button" } }).onclick = () => {
    const current = Number(body.dataset.size || 18);
    const next = current >= 22 ? 16 : current + 2;
    body.dataset.size = String(next);
    body.style.fontSize = `${next}px`;
  };
  size.createEl("button", { text: "行距", attr: { type: "button" } }).onclick = () => {
    body.style.lineHeight = body.style.lineHeight === "2" ? "1.75" : "2";
  };
  size.createEl("button", { text: "深色", attr: { type: "button" } }).onclick = () => {
    page.classList.toggle("is-reader-dark");
  };
  const clock = page.createEl("button", { text: "开始计时", attr: { type: "button" } });
  clock.onclick = () => {
    view.plugin.pendingTimeboxSource = screen.path;
    view.plugin.openTimeboxStart({ title: view.readerState.title });
  };
}

function renderWriting(view, root) {
  header(view, root, "写作");
  const actions = root.createDiv({ cls: "meinc-home-empty-actions" });
  actions.createEl("button", { text: "新的一篇", attr: { type: "button" } }).onclick = () =>
    view.openDraft({ kind: "writing" });
  actions.createEl("button", { text: "今日日记", attr: { type: "button" } }).onclick = () =>
    view.plugin.openToday();
  const folder = view.app.vault.getAbstractFileByPath("手记");
  const group = root.createDiv({ cls: "meinc-home-group" });
  const files = [];
  const walk = (node) => {
    if (!(node instanceof TFolder)) return;
    for (const child of node.children) {
      if (child instanceof TFolder) walk(child);
      else if (child instanceof TFile && child.extension === "md") files.push(child);
    }
  };
  walk(folder);
  files
    .sort((a, b) => b.stat.mtime - a.stat.mtime)
    .slice(0, 30)
    .forEach((file, index) => {
      view.addRow(group, {
        name: file.basename,
        meta: file.parent?.name || "",
        icon: "pencil",
        tint: "orange",
        index,
        onClick: () => view.openDraft({ path: file.path, kind: "writing", existing: true }),
      });
    });
}

function renderRound(view, root) {
  header(view, root, "复习");
  const session = view.reviewSession;
  if (!session || session.done || !session.queue.length) {
    const empty = root.createDiv({ cls: "meinc-home-empty" });
    empty.createDiv({ text: session && session.done ? "这一组做完了" : "现在没有待复习" });
    const actions = empty.createDiv({ cls: "meinc-home-empty-actions" });
    actions.createEl("button", { text: "再来一组", attr: { type: "button" } }).onclick = () =>
      view.startStudyRound({ fresh: true });
    actions.createEl("button", { text: "先停", attr: { type: "button" } }).onclick = () =>
      view.resetToHome();
    return;
  }
  const card = session.queue[session.index];
  root.createDiv({
    cls: "meinc-home-review-progress",
    text: `${Math.min(session.index + 1, session.queue.length)} / ${session.queue.length}`,
  });
  const stage = root.createDiv({ cls: "meinc-home-review-stage" });
  const face = stage.createDiv({ cls: "meinc-home-review-card" });
  if (card.type === "word" || card.type === "sentence") {
    const entry = card.card || {};
    face.createDiv({
      cls: "meinc-home-review-main",
      text: card.type === "word" ? entry.word || "" : entry.text || "",
    });
    if (!session.revealed) {
      face.createDiv({ cls: "meinc-home-review-hint", text: "点一下看背面" });
      face.onclick = () => {
        session.revealed = true;
        view.render();
      };
    } else if (card.type === "word") {
      face.createDiv({
        cls: "meinc-home-review-body",
        text: (entry.definitions || []).join("；") || entry.note || "暂无释义",
      });
    } else {
      face.createDiv({
        cls: "meinc-home-review-body",
        text: entry.translation || entry.note || "暂无译文",
      });
    }
  } else {
    face.createDiv({ cls: "meinc-home-review-kicker", text: "回想" });
    face.createDiv({ cls: "meinc-home-review-main", text: prosePrompt(card) });
    const source = face.createEl("details");
    source.createEl("summary", { text: "原文" });
    source.createDiv({ text: card.excerpt || card.title || card.path || "" });
    const box = face.createEl("textarea", {
      cls: "meinc-editor-area",
      attr: { placeholder: "可以写几句，也可以只在心里答" },
    });
    box.value = session.note || "";
    box.addEventListener("input", () => {
      session.note = box.value;
    });
    face.createEl("button", { text: "生成复习问题", attr: { type: "button" } }).onclick = () => {
      void requestReviewQuestion(view, card);
    };
  }
  const grades = root.createDiv({ cls: "meinc-home-review-grades" });
  for (const item of [
    ["again", "不会"],
    ["hard", "模糊"],
    ["good", "会了"],
  ]) {
    grades.createEl("button", {
      cls: `meinc-home-review-grade is-${item[0]}`,
      text: item[1],
      attr: { type: "button" },
    }).onclick = () => void gradeCurrent(view, item[0]);
  }
  grades.createEl("button", { text: "跳过", attr: { type: "button" } }).onclick = () => {
    view.reviewSession = skipRound(session);
    void persistRound(view);
    view.render();
  };
}

async function gradeCurrent(view, rating) {
  const session = view.reviewSession;
  const card = session.queue[session.index];
  if (!card) return;
  if (card.type === "word" || card.type === "sentence") {
    const lexideck = view.app.plugins?.plugins?.lexideck;
    if (!lexideck || typeof lexideck.gradeEntry !== "function") {
      new Notice("LexiDeck 未就绪");
      return;
    }
    const ok = await lexideck.gradeEntry(card.kind, card.id, rating);
    if (!ok) {
      new Notice("评分失败");
      return;
    }
  } else if (card.path) {
    await view.plugin.gradeReviewProse(card.path, rating);
  }
  await view.plugin.appendActivity({
    id: `review-grade:${Date.now()}`,
    type: "review-grade",
    path: card.path || "",
    title: card.title || "",
  });
  const graded = gradeRound(session, rating);
  view.reviewSession = graded.round;
  await persistRound(view);
  view.render();
}

async function persistRound(view) {
  const session = view.reviewSession;
  if (!session) return;
  await view.plugin.appendActivity({
    id: "review:current",
    type: "review",
    index: session.index || 0,
    done: !!session.done,
    queue: (session.queue || []).map((card) => ({
      type: card.type,
      id: card.id,
      kind: card.kind,
      path: card.path,
      title: card.title,
      prompt: card.prompt,
      excerpt: card.excerpt,
      source: card.source,
    })),
  });
}

function rehydrateRound(view, session) {
  const lexideck = view.app.plugins?.plugins?.lexideck;
  for (const card of session.queue || []) {
    if (card.card || (card.type !== "word" && card.type !== "sentence") || !lexideck) continue;
    const list = card.type === "word" ? lexideck.getWords?.() : lexideck.getSentences?.();
    card.card = (list || []).find((item) => item.id === card.id) || {};
  }
  return session;
}

async function startStudyRound(view, opts = {}) {
  const saved = (view.plugin.activityEvents || []).filter((event) => event.type === "review").pop();
  if (!opts.fresh && saved && !saved.done && Array.isArray(saved.queue) && saved.index < saved.queue.length) {
    view.reviewSession = rehydrateRound(view, {
      queue: saved.queue,
      index: saved.index || 0,
      revealed: false,
      skipped: [],
      done: false,
    });
  } else {
    await view.plugin.ensureReviewLedgerReady();
    const now = Date.now();
    const lexideck = view.app.plugins?.plugins?.lexideck;
    const prose = listDueProseEntries(view.plugin.reviewLedger, now).map((item) => ({
      type: "prose",
      path: item.path,
      title: item.title || item.path,
      prompt: item.prompt,
      excerpt: item.excerpt,
      kind: item.kind,
    }));
    view.reviewSession = freshRound(buildLexiQueueItems(lexideck, now).concat(prose));
    await persistRound(view);
  }
  if (view.current().type === "review" && view.current().mode === "round") view.render();
  else view.push({ type: "review", mode: "round", title: "复习" });
}

async function requestReviewQuestion(view, card) {
  const excerpt = card.excerpt || card.title || "";
  const path = `agent-inbox/pending/${dayKeyFromTime(Date.now())}-review-${contentHash(excerpt).slice(0, 8)}.md`;
  await writeText(
    view.plugin,
    path,
    ["---", "status: pending", "type: review-question", `source_paths: ${JSON.stringify([card.path || ""])}`, "---", "", "原文依据：", "", excerpt, "", "### 问题", ""].join("\n")
  );
  const sent = await askAgent(view.plugin, `请只根据下面的原文出一道回想题，并把题目写进 ${path} 的「问题」下面。不要脱离原文。\n\n${excerpt}`);
  new Notice(sent ? "题目会留在待确认里" : "Agent 还没接上，原文依据已经留下");
}

function renderProjects(view, root) {
  header(view, root, "项目");
  if (!view.projectRows) {
    root.createDiv({ cls: "meinc-home-empty", text: "正在打开" });
    void loadProjects(view);
    return;
  }
  const group = root.createDiv({ cls: "meinc-home-group" });
  view.projectRows.forEach((row, index) => {
    const block = root.createDiv({ cls: "meinc-project-card" });
    block.createDiv({ cls: "meinc-home-title", text: row.name });
    block.createDiv({
      cls: "meinc-home-kicker",
      text: row.next ? `下一步：${row.next}` : "还没有下一步",
    });
    if (row.workPath) {
      block.createEl("button", { text: "打开当前稿件", attr: { type: "button" } }).onclick = () => {
        view.plugin.pendingTimeboxSource = row.workPath;
        view.push({ type: "reader", path: row.workPath, title: row.name });
      };
    }
    if (!row.next) {
      const input = block.createEl("input", {
        cls: "meinc-home-name-input",
        attr: { type: "text", placeholder: "写一句下一步" },
      });
      block.createEl("button", { text: "记下", attr: { type: "button" } }).onclick = () => {
        void saveProjectNext(view, row, input.value);
      };
    }
    block.createEl("button", { text: "帮我找下一步", attr: { type: "button" } }).onclick = () => {
      void askAgent(
        view.plugin,
        `请根据项目「${row.name}」里已经写下的材料，只建议一句下一步。不要改文件，除非我确认。`
      );
    };
    if (row.files.length) {
      const details = block.createEl("details");
      details.createEl("summary", { text: "资料" });
      row.files.slice(0, 8).forEach((path) => {
        details.createEl("div", { text: path.split("/").pop() });
      });
    }
    group.appendChild(block);
    void index;
  });
}

async function loadProjects(view) {
  const root = view.app.vault.getAbstractFileByPath("项目库");
  const rows = [];
  if (root instanceof TFolder) {
    for (const child of root.children) {
      if (!(child instanceof TFolder) || child.name.startsWith("_") || child.name.startsWith(".")) continue;
      const files = [];
      const walk = (folder) => {
        for (const item of folder.children) {
          if (item instanceof TFolder) walk(item);
          else if (item instanceof TFile && item.extension === "md") files.push(item.path);
        }
      };
      walk(child);
      let next = "";
      const nextFile = files.find((path) => path.endsWith("/下一步.md"));
      if (nextFile) next = latestNextLine((await readText(view.plugin, nextFile)) || "");
      if (!next) {
        for (const path of files) {
          if (path.endsWith("/下一步.md")) continue;
          next = extractNextStep((await readText(view.plugin, path)) || "");
          if (next) break;
        }
      }
      rows.push({
        name: child.name,
        folder: child.path,
        next,
        workPath: pickWorkPath(files),
        files,
      });
    }
  }
  view.projectRows = rows;
  if (view.current().type === "projects") view.render();
}

async function saveProjectNext(view, row, sentence) {
  const text = String(sentence || "").trim();
  if (!text) return;
  const path = `${projectFolderFromPath(row.folder + "/x")}/下一步.md`;
  const current = (await readText(view.plugin, path)) || "";
  await writeText(view.plugin, path, appendNextStep(current, text, dayKeyFromTime(Date.now())));
  row.next = text;
  new Notice("已记下下一步");
  view.render();
}

function renderTimeboxHistory(view, root) {
  header(view, root, "时间记录");
  const state = view.historyState || {
    mode: "week",
    anchor: Date.now(),
    from: Date.now(),
    to: Date.now(),
  };
  view.historyState = state;
  const modes = root.createDiv({ cls: "meinc-home-empty-actions" });
  for (const mode of [
    ["week", "周"],
    ["month", "月"],
    ["year", "年"],
    ["custom", "自选"],
  ]) {
    modes.createEl("button", { text: mode[1], attr: { type: "button" } }).onclick = () => {
      state.mode = mode[0];
      state.detailKey = "";
      view.render();
    };
  }
  const nav = root.createDiv({ cls: "meinc-home-empty-actions" });
  nav.createEl("button", { text: "上一页", attr: { type: "button" } }).onclick = () => shiftHistory(view, -1);
  nav.createEl("button", { text: "下一页", attr: { type: "button" } }).onclick = () => shiftHistory(view, 1);
  const range = resolveHistoryRange(state);
  const history = buildHistoryBars(view.plugin.timeboxSessions || [], { ...range, mode: state.mode });
  root.createDiv({ cls: "meinc-home-kicker", text: history.label });
  const chart = root.createDiv({ cls: "meinc-history-chart" });
  history.bars.forEach((bar) => {
    const col = chart.createEl("button", {
      cls: "meinc-history-col",
      attr: { type: "button", "aria-label": `${bar.label} ${bar.durationLabel}` },
    });
    const track = col.createDiv({ cls: "meinc-history-track" });
    if (bar.fillRatio > 0) {
      track.createDiv({
        cls: "meinc-history-fill",
        attr: { style: `height:${Math.round(bar.fillRatio * 100)}%` },
      });
    }
    col.createDiv({ cls: "meinc-history-label", text: bar.label });
    col.createDiv({ cls: "meinc-history-duration", text: bar.durationLabel });
    col.onclick = () => {
      state.detailKey = bar.grain === "month" ? "" : bar.key;
      state.detailMonth = bar.grain === "month" ? bar.key : "";
      view.render();
    };
  });
  if (state.detailKey) {
    const details = daySessionDetails(view.plugin.timeboxSessions || [], state.detailKey);
    root.createDiv({ cls: "meinc-home-kicker", text: state.detailKey });
    if (!details.length) root.createDiv({ text: "这一天没有记录" });
    for (const item of details) {
      root.createDiv({
        text: `${item.title} · ${item.minutes} 分 · ${item.outcome === "abandoned" ? "中止" : item.outcome === "early" ? "提前结束" : "完成"}`,
      });
    }
  }
}

function shiftHistory(view, direction) {
  const state = view.historyState;
  if (state.mode === "custom") {
    const next = shiftCustomRange(state.from, state.to, direction);
    state.from = next.from;
    state.to = next.to;
    state.anchor = next.from;
  } else {
    state.anchor = shiftHistoryAnchor(state.mode, state.anchor, direction);
  }
  view.render();
}

function renderCompoundPage(view, root) {
  const editor = view.compoundEditor;
  header(view, root, "复利");
  if (!editor) {
    root.createDiv({ cls: "meinc-home-empty", text: "正在打开" });
    return;
  }
  if (editor.yesterday) {
    const box = root.createDiv({ cls: "meinc-home-compound-yesterday" });
    box.createDiv({ cls: "meinc-home-compound-yesterday-kicker", text: "昨天要改的" });
    box.createDiv({ text: editor.yesterday });
  }
  const records = formatDayRecords(
    recordsForDay(
      view.plugin.activityEvents || [],
      (view.plugin.timeboxSessions || []).flatMap((session) =>
        sessionMinuteParts(session).map((part) => ({
          dayKey: part.dayKey,
          title: session.title,
          minutes: part.minutes,
        }))
      ),
      editor.dayKey
    )
  );
  const list = root.createDiv({ cls: "meinc-compound-activity" });
  list.createDiv({ cls: "meinc-home-kicker", text: "今天留下了什么" });
  if (!records.length) list.createDiv({ text: "今天还没有阅读、写作、复习或专注记录" });
  for (const line of records) list.createDiv({ text: line });
  const note = COMPOUND_FIELDS.find((field) => field.key === "note");
  const wrap = root.createDiv({ cls: "meinc-home-compound-field" });
  wrap.createDiv({ cls: "meinc-home-compound-label", text: note.title });
  const area = wrap.createEl("textarea", { cls: "meinc-home-compound-input" });
  area.value = editor.draft.note || "";
  area.addEventListener("input", () => {
    editor.draft.note = area.value;
  });
  const save = root.createEl("button", { text: "记下", attr: { type: "button" } });
  save.onclick = () => void view.saveCompoundEditor();
  root.createEl("button", { text: "打开本周笔记", attr: { type: "button" } }).onclick = () =>
    view.openCompoundNote();
  root.createEl("button", { text: "带回首页", attr: { type: "button" } }).onclick = async () => {
    await view.saveCompoundEditor({ quiet: true });
    const recent = continueItems(view.plugin.activityEvents || [], 1)[0];
    await view.plugin.appendActivity({
      id: `next:${editor.dayKey}`,
      type: "next",
      text: editor.draft.note || "明天从首页继续",
      targetPath: recent?.path || "",
    });
    new Notice("首页可以接着打开");
  };
  const more = root.createEl("details");
  more.createEl("summary", { text: "原来的三问" });
  for (const field of COMPOUND_FIELDS.filter((item) => item.key !== "note")) {
    more.createDiv({ text: field.title });
    const input = more.createEl("textarea", { cls: "meinc-home-compound-input" });
    input.value = editor.draft[field.key] || "";
    input.addEventListener("input", () => {
      editor.draft[field.key] = input.value;
    });
  }
}

async function askAgent(plugin, prompt) {
  const agent = plugin.app.plugins?.plugins?.["obsidian-agent-os"];
  const send = agent?.chatController?.send;
  if (typeof send !== "function") {
    new Notice("Agent 还不可用");
    return false;
  }
  const leaf = plugin.app.workspace.getLeavesOfType("meinc-home")[0];
  const ctx = leaf?.view?.getAgentContext?.() || null;
  const body = String(ctx?.body || "");
  const snap = ctx
    ? {
        attached: true,
        path: ctx.path || "",
        title: ctx.title || "",
        selection: ctx.selection || "",
        hasSelection: !!String(ctx.selection || "").trim(),
        cursor: { line: 0, ch: 0 },
        contentVersion: ctx.version || "",
        noteExcerpt: body.slice(0, 8000),
        truncated: body.length > 8000,
        capturedAt: Date.now(),
      }
    : null;
  try {
    const result = await send.call(agent.chatController, prompt, {
      surface: "companion",
      contextSnapshot: snap,
    });
    agent.companion?.open?.({ forceOpen: true });
    if (result && result.ok === false) {
      new Notice("没能发给 Agent");
      return false;
    }
    return true;
  } catch (_) {
    new Notice("没能发给 Agent");
    return false;
  }
}

function agentContext(view) {
  const screen = view.current();
  if (screen.type === "reader" && view.readerState) {
    const body = String(view.readerState.markdown || "");
    return {
      path: view.readerState.path,
      title: view.readerState.title || "",
      body,
      selection: view.readerSelection || "",
      version: contentHash(body),
    };
  }
  return null;
}

function install(HomeView, PluginClass) {
  const plugin = PluginClass.prototype;
  plugin.loadActivityLog = async function loadActivityLog() {
    const folder = this.app.vault.getAbstractFileByPath(ACTIVITY_DIR);
    const lists = [];
    if (folder instanceof TFolder) {
      for (const child of folder.children) {
        if (!(child instanceof TFile)) continue;
        if (!child.name.startsWith("activity-") || !child.name.endsWith(".jsonl")) continue;
        try {
          lists.push(parseActivityJsonl(await this.app.vault.read(child)));
        } catch (_) {}
      }
    }
    this.activityEvents = mergeEvents(...lists);
  };
  plugin.appendActivity = async function appendActivity(event) {
    const deviceId = this.ensureTimeboxDeviceId();
    const full = {
      ...event,
      id: event.id || `${event.type}-${Date.now()}`,
      at: event.at || Date.now(),
      deviceId,
    };
    this.activityEvents = mergeEvents(this.activityEvents || [], [full]);
    const mine = this.activityEvents.filter((item) => item.deviceId === deviceId);
    await writeText(this, `${ACTIVITY_DIR}/activity-${deviceId}.jsonl`, `${serializeActivityJsonl(mine)}\n`);
  };
  plugin.scheduleActivity = function scheduleActivity(event) {
    this._pendingActivity = event;
    clearTimeout(this._activityTimer);
    this._activityTimer = setTimeout(() => {
      const item = this._pendingActivity;
      this._pendingActivity = null;
      if (item) void this.appendActivity(item);
    }, 800);
  };
  plugin.addPassageToReview = async function addPassageToReview(path, excerpt) {
    await this.ensureReviewLedgerReady();
    const key = `${path}#${contentHash(excerpt).slice(0, 8)}`;
    this.reviewLedger.entries[key] = {
      ...ledgerEntryForPassage(excerpt),
      title: path.split("/").pop(),
    };
    await this.saveReviewLedger();
    await this.appendActivity({
      id: `highlight:${key}`,
      type: "highlight",
      path,
      excerpt,
    });
  };
  plugin.addOutputToReview = async function addOutputToReview(excerpt) {
    await this.ensureReviewLedgerReady();
    const key = `output#${contentHash(excerpt).slice(0, 8)}`;
    this.reviewLedger.entries[key] = ledgerEntryForOutput(excerpt);
    await this.saveReviewLedger();
  };
  const origOnload = plugin.onload;
  plugin.onload = async function onload() {
    await origOnload.call(this);
    try {
      await this.loadActivityLog();
    } catch (err) {
      console.error(err);
      this.activityEvents = [];
    }
  };

  const view = HomeView.prototype;
  view.renderActivityHome = function renderHome(root) {
    renderActivityHome(this, root);
  };
  view.renderHome = function renderHome(root) {
    this.renderActivityHome(root);
  };
  view.renderLibrary = function renderLibraryScreen(root) {
    renderLibrary(this, root);
  };
  view.renderReader = function renderReaderScreen(root) {
    renderReader(this, root);
  };
  view.renderWritingList = function renderWritingScreen(root) {
    renderWriting(this, root);
  };
  view.renderProjects = function renderProjectScreen(root) {
    renderProjects(this, root);
  };
  view.renderTimeboxHistory = function renderHistoryScreen(root) {
    renderTimeboxHistory(this, root);
  };
  view.openLibrary = function openLibrary() {
    this.push({ type: "library", title: "阅读" });
  };
  view.openWriting = function openWriting() {
    this.push({ type: "writing-list", title: "写作" });
  };
  view.openProjects = function openProjects() {
    this.projectRows = null;
    this.push({ type: "projects", title: "项目" });
  };
  view.openTimeboxHistory = function openTimeboxHistory() {
    this.historyState = { mode: "week", anchor: Date.now(), from: Date.now(), to: Date.now() };
    this.push({ type: "timebox-history", title: "时间记录" });
  };
  view.openDraft = async function openDraft(opts = {}) {
    const kind = opts.kind || "writing";
    let path = opts.path || "";
    if (opts.resume && !path) {
      const latest = (this.plugin.activityEvents || [])
        .filter((event) => event.type === "draft" && !event.done && event.kind === "output")
        .pop();
      if (latest?.path) path = latest.path;
    }
    if (path) {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing instanceof TFile) {
        await this.plugin.openFile(existing);
        return;
      }
      new Notice("没有找到这篇");
      return;
    }
    const id = `d${Date.now().toString(36)}`;
    const created = new Date().toISOString();
    const note = newWritingNote({
      id,
      body: opts.seed || "",
      kind,
      created,
      deviceId: this.plugin.ensureTimeboxDeviceId(),
    });
    const file = await writeText(this.plugin, note.path, note.markdown);
    await this.plugin.appendActivity({
      id: `draft:${id}`,
      type: "draft",
      draftId: id,
      path: note.path,
      title: kind === "output" ? "输出" : "草稿",
      kind,
    });
    if (file instanceof TFile) await this.plugin.openFile(file);
  };
  view.startStudyRound = function start(opts) {
    return startStudyRound(this, opts);
  };
  view.getAgentContext = function getAgentContext() {
    return agentContext(this);
  };
  const origReview = view.renderReview;
  view.renderReview = function renderReview(root) {
    if (this.current().mode === "round") return renderRound(this, root);
    return origReview.call(this, root);
  };
  const origCompound = view.renderCompound;
  view.renderCompound = function renderCompound(root) {
    if (!this.compoundEditor) {
      origCompound.call(this, root);
      return;
    }
    renderCompoundPage(this, root);
  };
  const origOpen = view.openReview;
  view.openReview = function openReview() {
    return this.startStudyRound();
  };
  view.refreshListing = function refreshListing() {
    if (this.current().type === "reader") return;
    this.render();
  };
}

module.exports = { install };
