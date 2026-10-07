const { contentHash } = require("./activity.js");

const DRAFT_DIR = "手记/草稿";

function draftPath(id) {
  return `${DRAFT_DIR}/${id}.md`;
}

function conflictPath(id, deviceId) {
  const suffix = String(deviceId || "other").replace(/[^\w-]/g, "").slice(0, 24) || "other";
  return `${DRAFT_DIR}/${id}.conflict-${suffix}.md`;
}

function renderDraft({ id, body, baseHash, deviceId, kind, updatedAt }) {
  const hash = baseHash || contentHash(body);
  return [
    "---",
    "type: meinc-draft",
    `draft_id: ${id}`,
    `base_hash: ${hash}`,
    `device_id: ${deviceId || ""}`,
    `kind: ${kind || "writing"}`,
    `updated_at: ${updatedAt || new Date().toISOString()}`,
    "---",
    "",
    String(body ?? ""),
    "",
  ].join("\n");
}

function parseDraft(markdown) {
  const text = String(markdown ?? "");
  const match = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    return {
      id: "",
      body: text.replace(/\n$/, ""),
      baseHash: "",
      deviceId: "",
      kind: "",
      wrapped: false,
    };
  }
  const meta = {};
  for (const line of match[1].split("\n")) {
    const pair = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (pair) meta[pair[1]] = pair[2].trim();
  }
  return {
    id: meta.draft_id || "",
    body: match[2].replace(/^\n/, "").replace(/\n$/, ""),
    baseHash: meta.base_hash || "",
    deviceId: meta.device_id || "",
    kind: meta.kind || "",
    wrapped: meta.type === "meinc-draft",
  };
}

function planTextSave({ baseHash, localBody, diskBody, deviceId, conflictTarget }) {
  const local = String(localBody ?? "");
  const disk = diskBody == null ? null : String(diskBody);
  const localHash = contentHash(local);
  if (disk == null) return { action: "write", body: local, hash: localHash };
  const diskHash = contentHash(disk);
  if (diskHash === localHash) return { action: "unchanged", hash: localHash };
  if (!baseHash || diskHash === baseHash) return { action: "write", body: local, hash: localHash };
  return {
    action: "conflict",
    path: conflictTarget,
    body: local,
    hash: localHash,
    deviceId: deviceId || "",
  };
}

function planDraftSave({ id, kind, deviceId, baseHash, localBody, diskMarkdown }) {
  const parsed = diskMarkdown == null ? null : parseDraft(diskMarkdown);
  const diskBody = parsed ? parsed.body : null;
  const knownBase = baseHash || (parsed && parsed.baseHash) || "";
  const decision = planTextSave({
    baseHash: knownBase,
    localBody,
    diskBody,
    deviceId,
    conflictTarget: conflictPath(id, deviceId),
  });
  if (decision.action === "unchanged") return decision;
  if (decision.action === "conflict") {
    return {
      ...decision,
      markdown: renderDraft({
        id,
        body: localBody,
        baseHash: decision.hash,
        deviceId,
        kind,
      }),
    };
  }
  return {
    action: "write",
    path: draftPath(id),
    hash: decision.hash,
    markdown: renderDraft({
      id,
      body: localBody,
      baseHash: decision.hash,
      deviceId,
      kind,
    }),
  };
}

module.exports = {
  DRAFT_DIR,
  conflictPath,
  draftPath,
  parseDraft,
  planDraftSave,
  planTextSave,
  renderDraft,
};
