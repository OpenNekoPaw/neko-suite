import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreDependencies: [
    '@types/vscode', // Provided by VSCode runtime
    'esbuild', // Used as CLI bundler, not imported
    'sharp', // Native binary, loaded at runtime
    '@img/sharp-wasm32', // Sharp WASM fallback
  ],

  workspaces: {
    // ── Layer 0: Library packages ──────────────────────
    'packages/neko-types': {
      // Knip auto-detects entries from package.json exports
      ignoreDependencies: ['react'], // Optional peer dependency
    },
    'packages/neko-client': {},

    // ── Extension parent packages ─────────────────────
    // These are VSCode manifest wrappers; entry from sub-packages.
    'packages/neko-cut': {},
    'packages/neko-agent': {},
    'packages/neko-canvas': {},
    'packages/neko-story': {},
    'packages/neko-tools': {},
    'packages/neko-preview': {},
    'packages/neko-assets': {},
    'packages/neko-engine': {
      ignore: ['packages/native-*/**'], // Rust packages, skip
    },

    // ── Extension sub-packages ────────────────────────
    'packages/neko-cut/packages/extension': {},
    'packages/neko-cut/packages/webview': {
      // Vite auto-detects entries from HTML files, explicit entry is redundant
    },
    'packages/neko-agent/packages/extension': {},
    'packages/neko-agent/packages/webview': {},
    'packages/neko-agent/packages/platform': {},
    'packages/neko-agent/packages/agent': {},
    'packages/neko-canvas/packages/extension': {},
    'packages/neko-canvas/packages/webview': {},
    'packages/neko-story/packages/extension': {},
    'packages/neko-story/packages/parser': {},
    'packages/neko-story/packages/webview': {},
    'packages/neko-tools/packages/extension': {},
    'packages/neko-tools/packages/webview': {},
    'packages/neko-preview/packages/webview': {},
    'packages/neko-preview/packages/extension': {},
    'packages/neko-assets/packages/asset': {},
    'packages/neko-engine/packages/extension': {},

    // ── Skills (CLI scripts, not imported) ───────────────
    // Skills are excluded from analysis - they are runtime scripts, not imported modules

    // ── Skip packages ─────────────────────────────────
    'packages/neko-proto': {
      // Protobuf IDL files, not TypeScript code
      entry: ['package.json'],
    },
    'packages/neko-model': { ignore: ['**/*'] },
    'packages/neko-audio': { ignore: ['**/*'] },
    'packages/neko-live': { ignore: ['**/*'] },
    'packages/neko-sketch': { ignore: ['**/*'] },
    'packages/neko-suite': {
      // Meta package with only documentation
      entry: ['package.json'],
    },
    'packages/neko-engine/packages/native-napi': { ignore: ['**/*'] },
    'packages/neko-engine/packages/native-cli': {
      // Rust CLI binary, not TypeScript
      entry: ['package.json'],
    },
  },
};

export default config;
