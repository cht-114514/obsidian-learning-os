function extractNextStep(markdown) {
  const text = String(markdown || "").replace(/\r\n/g, "\n");
  const heading = text.match(/^#{1,4}[ \t]+下一步[ \t]*$/m);
  if (heading) {
    const after = text.slice(heading.index + heading[0].length);
    const stop = after.search(/\n#{1,4}[ \t]/);
    const body = (stop >= 0 ? after.slice(0, stop) : after).trim();
    const line = body
      .split("\n")
      .map((item) => item.replace(/^[-*]\s*/, "").trim())
      .find((item) => item && !item.startsWith("#"));
    if (line) return line;
  }
  const lines = text.split("\n");
  let column = -1;
  let last = "";
  for (const line of lines) {
    if (!line.includes("|")) continue;
    const cells = line.split("|").map((cell) => cell.trim());
    const header = cells.findIndex((cell) => cell === "下一步");
    if (header >= 0) {
      column = header;
      continue;
    }
    if (column < 0 || /^[-:\s|]+$/.test(line)) continue;
    const value = cells[column] || "";
    if (value && value !== "---") last = value;
  }
  return last;
}

function latestNextLine(markdown) {
  const fromHeading = extractNextStep(markdown);
  if (fromHeading) return fromHeading;
  const lines = String(markdown || "")
    .split("\n")
    .map((line) => line.replace(/^[-*]\s*/, "").trim())
    .filter((line) => line && !line.startsWith("#") && !line.startsWith("---"));
  return lines.length ? lines[lines.length - 1] : "";
}

function appendNextStep(markdown, sentence, dayKey) {
  const clean = String(sentence || "").trim();
  if (!clean) return String(markdown || "");
  const line = `- ${dayKey || ""} ${clean}`.replace("-  ", "- ");
  const text = String(markdown || "");
  if (/^#{1,4}[ \t]+下一步[ \t]*$/m.test(text)) {
    return text.replace(/^(#{1,4}[ \t]+下一步[ \t]*)$/m, `$1\n\n${line}`);
  }
  const base = text.endsWith("\n") || !text ? text : `${text}\n`;
  return `${base}\n## 下一步\n\n${line}\n`;
}

function pickWorkPath(paths) {
  const files = (Array.isArray(paths) ? paths : []).filter(
    (path) => String(path).endsWith(".md") && !String(path).includes("/.trash/")
  );
  const prefer = ["04-产出", "草稿", "稿", "00-项目说明", "入口", "README", "about"];
  for (const key of prefer) {
    const hit = files.find((path) => path.includes(key));
    if (hit) return hit;
  }
  return files.find((path) => !path.endsWith("/下一步.md")) || files[0] || "";
}

function projectFolderFromPath(path) {
  const parts = String(path || "").split("/");
  if (parts[0] !== "项目库" || parts.length < 2) return "";
  return `项目库/${parts[1]}`;
}

function parseProjectLinks(markdown) {
  const links = [];
  const re = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g;
  let match;
  const text = String(markdown || "");
  while ((match = re.exec(text))) {
    const target = match[1].trim();
    if (target.startsWith("项目库/")) links.push(target);
  }
  return links;
}

module.exports = {
  appendNextStep,
  extractNextStep,
  latestNextLine,
  parseProjectLinks,
  pickWorkPath,
  projectFolderFromPath,
};
