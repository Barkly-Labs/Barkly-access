import { build } from "esbuild";
import { mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const entry = resolve(root, "src/integrations/betterdiscord/BarklyAccess.plugin.js");
const outfile = resolve(root, "dist/BarklyAccess.plugin.js");

await mkdir(dirname(outfile), { recursive: true });
await build({
  absWorkingDir: root,
  entryPoints: [entry],
  outfile,
  bundle: true,
  platform: "browser",
  format: "cjs",
  target: ["chrome110"],
  loader: { ".css": "text" },
  legalComments: "none",
  minify: false,
  sourcemap: false,
  banner: {
    js: `/**\n * @name BarklyAccess\n * @author Barkly Labs\n * @version 0.8.0\n * @description Accessible Discord controls and local conversation analytics.\n */`,
  },
  footer: { js: "module.exports = module.exports.default;" },
});

// BetterDiscord discovers CommonJS plugins via module.exports. Verify that the
// emitted bundle actually retains that contract before reporting success.
const output = await readFile(outfile, "utf8");
if (!output.includes("module.exports") || !output.includes("BarklyAccess")) {
  throw new Error("Build output is missing the BetterDiscord plugin export or metadata.");
}
console.log(`Built ${outfile}`);
