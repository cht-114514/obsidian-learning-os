/**
 * Direct Qwen / OpenAI-compatible archive suggestion (no OpenClaw).
 */

const ARCHIVE_SYSTEM = `你是笔记归档助手。根据正文只建议标题和存放路径，不改写正文。
只输出一个 JSON 对象，无 markdown 围栏：
{"title":"简短标题","path":"相对路径.md"}

路径必须：
- 以 手记/、项目库/ 或 基础学科/ 开头
- 以 .md 结尾
- 不得使用 手记/草稿
- 优先从用户给出的现有文件夹中选择合适位置`;

/**
 * @param {import('obsidian').App} app
 */
function archiveLlmConfigFromApp(app) {
  const agent = app?.plugins?.plugins?.["obsidian-agent-os"];
  const s = agent?.settings || {};
  const baseUrl = String(s.memoryLlmBaseUrl || s.embedBaseUrl || "")
    .trim()
    .replace(/\/$/, "");
  const apiKey = String(s.memoryLlmApiKey || s.embedApiKey || "").trim();
  const model = String(s.memoryLlmModel || "qwen3.7-flash").trim();
  return { baseUrl, apiKey, model };
}

function isAllowedArchivePath(path) {
  const p = String(path || "");
  if (!/^(手记|项目库|基础学科)\/.+\.md$/.test(p) || p.includes("..")) return false;
  if (/^手记\/草稿(\/|$)/.test(p)) return false;
  return true;
}

function sanitizeFileStem(title) {
  const stem = String(title || "未命名")
    .trim()
    .replace(/[\\/:*?"<>|#\n\r]/g, "")
    .slice(0, 80);
  return stem || "未命名";
}

function fallbackArchivePath(title) {
  return `手记/随记/${sanitizeFileStem(title)}.md`;
}

/**
 * @param {{ title?: string, path?: string }} parsed
 */
function normalizeArchiveSuggestion(parsed) {
  const title = String(parsed?.title || "").trim() || "未命名";
  let path = String(parsed?.path || "").trim();
  if (!isAllowedArchivePath(path)) path = fallbackArchivePath(title);
  return { title, path };
}

/**
 * @param {string} text
 */
function parseArchiveSuggestionJson(text) {
  const s = String(text || "").trim();
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1].trim() : s;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("archive: no JSON object");
  return normalizeArchiveSuggestion(JSON.parse(body.slice(start, end + 1)));
}

/**
 * If target exists with different content, add date suffix in same folder.
 * @param {string} path
 * @param {string} draftBody
 * @param {(p: string) => string | null | undefined} readBody
 */
function bumpArchivePath(path, index) {
  const date = new Date().toISOString().slice(0, 10);
  const dot = path.lastIndexOf(".md");
  if (dot < 0) return path;
  const stem = path.slice(0, dot);
  if (index <= 0) return `${stem}-${date}.md`;
  return `${stem}-${date}-${index + 1}.md`;
}

function avoidPathCollision(path, draftBody, readBody) {
  const existing = readBody(path);
  if (existing == null) return path;
  if (String(existing) === String(draftBody)) return path;
  for (let i = 0; i < 24; i += 1) {
    const candidate = bumpArchivePath(path, i);
    const body = readBody(candidate);
    if (body == null) return candidate;
    if (String(body) === String(draftBody)) return candidate;
  }
  return bumpArchivePath(path, 23);
}

/**
 * @param {string} path
 * @param {string} draftBody
 * @param {(p: string) => Promise<string | null | undefined>} readBody
 */
async function resolveArchivePath(path, draftBody, readBody) {
  const existing = await readBody(path);
  if (existing == null) return path;
  if (String(existing) === String(draftBody)) return path;
  for (let i = 0; i < 24; i += 1) {
    const candidate = bumpArchivePath(path, i);
    const body = await readBody(candidate);
    if (body == null) return candidate;
    if (String(body) === String(draftBody)) return candidate;
  }
  return bumpArchivePath(path, 23);
}

/**
 * @param {{
 *   baseUrl: string,
 *   apiKey: string,
 *   model: string,
 *   body: string,
 *   folderHints?: string[],
 *   signal?: AbortSignal,
 *   fetchImpl?: typeof fetch,
 *   timeoutMs?: number,
 * }} opts
 */
async function callArchiveLlm(opts) {
  const base = String(opts.baseUrl || "").replace(/\/$/, "");
  const apiKey = String(opts.apiKey || "").trim();
  const model = String(opts.model || "").trim();
  if (!base || !apiKey || !model) {
    return { skipped: true, reason: "no-config" };
  }

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  if (!fetchImpl) return { skipped: true, reason: "no-fetch" };

  const hints = (opts.folderHints || []).slice(0, 80);
  const userParts = [
    hints.length ? `现有文件夹（优先选用）：\n${hints.join("\n")}` : "",
    "正文：",
    String(opts.body || "").slice(0, 12000),
  ].filter(Boolean);

  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timeoutMs = opts.timeoutMs ?? 20000;
  const timer =
    controller &&
    setTimeout(() => {
      try {
        controller.abort();
      } catch {
        /* */
      }
    }, timeoutMs);

  try {
    const res = await fetchImpl(`${base}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 400,
        messages: [
          { role: "system", content: ARCHIVE_SYSTEM },
          { role: "user", content: userParts.join("\n\n") },
        ],
      }),
      signal: opts.signal || controller?.signal,
    });
    let body;
    try {
      body = await res.json();
    } catch {
      throw new Error(`archive HTTP ${res.status} non-JSON`);
    }
    if (!res.ok) {
      const msg = body?.error?.message || body?.message || `HTTP ${res.status}`;
      throw new Error(`archive: ${msg}`);
    }
    const content = body?.choices?.[0]?.message?.content || "";
    const suggestion = parseArchiveSuggestionJson(content);
    return { ok: true, suggestion };
  } catch (e) {
    return { ok: false, error: e?.message || String(e) };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

module.exports = {
  ARCHIVE_SYSTEM,
  archiveLlmConfigFromApp,
  avoidPathCollision,
  bumpArchivePath,
  callArchiveLlm,
  fallbackArchivePath,
  isAllowedArchivePath,
  normalizeArchiveSuggestion,
  parseArchiveSuggestionJson,
  resolveArchivePath,
  sanitizeFileStem,
};
