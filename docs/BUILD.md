# Build and test

Requires Node.js 20 or newer and npm.

```sh
npm install
npm test
npm run build
```

`npm test` runs the esbuild pipeline first and then Node's built-in tests. The generated, standalone BetterDiscord plugin is `dist/BarklyAccess.plugin.js`. It includes plugin metadata, a CommonJS class export, the collection and analytics modules, and panel styles; it has no external runtime dependencies.

To install it, use BetterDiscord's **Plugins → Open Plugins Folder** action, copy the generated `.plugin.js` file into that folder, return to Plugins, and enable BarklyAccess.
