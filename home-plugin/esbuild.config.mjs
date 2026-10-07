import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("../node_modules/esbuild");
const root = dirname(fileURLToPath(import.meta.url));
const vault = join(root, "../../..");

const shared = {
  bundle: true,
  format: "cjs",
  platform: "node",
  target: "es2020",
  charset: "utf8",
  external: ["obsidian"],
  logLevel: "info",
};

await esbuild.build({
  ...shared,
  entryPoints: [join(root, "src/app.js")],
  outfile: join(root, "main.js"),
});

await esbuild.build({
  ...shared,
  entryPoints: [join(vault, "agent-inbox/lexideck/main.js")],
  outfile: join(vault, "agent-inbox/lexideck/dist/main.js"),
});

function install(plugin, file) {
  for (const config of [".obsidian", ".obsidian-mobile"]) {
    const dir = join(vault, config, "plugins", plugin);
    mkdirSync(dir, { recursive: true });
    copyFileSync(file, join(dir, "main.js"));
  }
}

install("meinc-home", join(root, "main.js"));
install("lexideck", join(vault, "agent-inbox/lexideck/dist/main.js"));

for (const config of [".obsidian", ".obsidian-mobile"]) {
  const dir = join(vault, config, "plugins/meinc-home");
  copyFileSync(join(root, "styles.css"), join(dir, "styles.css"));
  copyFileSync(join(root, "manifest.json"), join(dir, "manifest.json"));
  const lexi = join(vault, config, "plugins/lexideck");
  mkdirSync(lexi, { recursive: true });
  copyFileSync(join(vault, "agent-inbox/lexideck/styles.css"), join(lexi, "styles.css"));
  copyFileSync(join(vault, "agent-inbox/lexideck/manifest.json"), join(lexi, "manifest.json"));
}
