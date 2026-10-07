const { contentHash } = require("./activity.js");

function renderArchivePending({
  draftPath,
  draftId,
  hash,
  proposedTitle,
  proposedPath,
  created,
}) {
  return [
    "---",
    "status: pending",
    "type: note-archive",
    `title: ${proposedTitle || "归档草稿"}`,
    `created: ${created || new Date().toISOString().slice(0, 10)}`,
    `path: ${proposedPath || ""}`,
    `source_paths: ${JSON.stringify([draftPath].filter(Boolean))}`,
    `content_hash: ${hash || ""}`,
    `draft_id: ${draftId || ""}`,
    "---",
    "",
    "只建议标题和存放位置。确认前不要改写正文。",
    "",
  ].join("\n");
}

function parseArchivePending(markdown) {
  const text = String(markdown ?? "");
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  const meta = {};
  if (match) {
    for (const line of match[1].split("\n")) {
      const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
      if (pair) meta[pair[1]] = pair[2].trim().replace(/^["']|["']$/g, "");
    }
  }
  return {
    status: meta.status || "pending",
    type: meta.type || "",
    title: meta.title || "",
    path: meta.path || "",
    hash: meta.content_hash || "",
    draftId: meta.draft_id || "",
  };
}

function decideArchive({ draftBody, confirmedHash, targetExists, targetBody }) {
  const body = String(draftBody ?? "");
  const hash = contentHash(body);
  if (!confirmedHash || hash !== confirmedHash) return { action: "stale", hash };
  if (targetExists && String(targetBody ?? "") === body) return { action: "noop", hash };
  if (targetExists) return { action: "conflict", hash };
  return { action: "write", hash, body };
}

function decideNextWrite({ line, confirmedLine, targetBody, confirmedTargetHash }) {
  const text = String(line || "").trim();
  if (!text || text !== String(confirmedLine || "").trim()) return { action: "stale" };
  const currentHash = contentHash(String(targetBody ?? ""));
  if (confirmedTargetHash && currentHash !== confirmedTargetHash) return { action: "stale" };
  if (String(targetBody || "").includes(text)) return { action: "noop" };
  return { action: "append", line: text, hash: currentHash };
}

module.exports = {
  decideArchive,
  decideNextWrite,
  parseArchivePending,
  renderArchivePending,
};
