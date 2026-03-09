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
      entry: ['src/index.ts', 'src/vscode/extension/index.ts'],
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
    'packages/neko-cut/packages/webview': { entry: ['src/main.tsx'] },
    'packages/neko-agent/packages/extension': {},
    'packages/neko-agent/packages/webview': { entry: ['src/main.tsx'] },
    'packages/neko-agent/packages/platform': {},
    'packages/neko-agent/packages/agent': {},
    'packages/neko-canvas/packages/extension': {},
    'packages/neko-canvas/packages/webview': { entry: ['src/main.tsx'] },
    'packages/neko-story/packages/extension': {},
    'packages/neko-story/packages/parser': {},
    'packages/neko-story/packages/webview': { entry: ['src/main.tsx'] },
    'packages/neko-tools/packages/extension': {
      entry: [
        'src/asset-diff/index.ts',
        'src/media-diff/index.ts',
        'src/media-lsp/index.ts',
      ],
    },
    'packages/neko-tools/packages/webview': { entry: ['src/main.tsx'] },
    'packages/neko-preview/packages/extension': {},
    'packages/neko-assets/packages/asset': {},
    'packages/neko-engine/packages/extension': {},

    // ── Skip packages ─────────────────────────────────
    'packages/neko-proto': { ignore: ['**/*'] },
    'packages/neko-model': { ignore: ['**/*'] },
    'packages/neko-audio': { ignore: ['**/*'] },
    'packages/neko-live': { ignore: ['**/*'] },
    'packages/neko-sketch': { ignore: ['**/*'] },
    'packages/neko-suite': { ignore: ['**/*'] },
    'packages/neko-engine/packages/native-napi': { ignore: ['**/*'] },
    'packages/neko-engine/packages/native-cli': { ignore: ['**/*'] },
  },
};

export default config;
