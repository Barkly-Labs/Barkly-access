import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

test("build emits a standalone BetterDiscord plugin with metadata and bundled features", async () => {
  const output = await readFile(new URL("../dist/BarklyAccess.plugin.js", import.meta.url), "utf8");
  assert.match(output, /@name\s+BarklyAccess/);
  assert.match(output, /@author\s+Barkly Labs/);
  assert.match(output, /module\.exports/);
  assert.match(output, /AggregationEngine\s*=\s*class/);
  assert.match(output, /normalizeMessages/);
  assert.match(output, /Choose JSON file/);
  assert.match(output, /prefers-reduced-motion/);
  assert.doesNotMatch(output, /require\(["'](?:esbuild|\.\.\/\.\.\/core)/);
  const module = { exports: {} };
  vm.runInNewContext(output, { module, exports: module.exports });
  assert.equal(typeof module.exports, "function");
  const plugin = new module.exports();
  assert.equal(typeof plugin.start, "function");
  assert.equal(typeof plugin.stop, "function");
});
