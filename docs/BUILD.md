# Build and verify

Requires Node.js and the platform-specific optional binary for the locked `esbuild` version.

```sh
npm ci
npm test
```

The test command builds `dist/BarklyAccess.plugin.js` and runs the Node test suite. Copy that built plugin file into BetterDiscord's plugin folder and reload plugins.
