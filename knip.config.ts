import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  ignoreDependencies: [
    '@types/vscode', // Provided by VSCode runtime
    'esbuild', // Used as CLI bundler, not imported
    'sharp', // Native binary, loaded at runtime
    '@img/sharp-wasm32', // Sharp WASM fallback
    // Markdown rendering peer dependencies (used by react-markdown/remark-gfm)
    'remark-parse',
    'remark-rehype',
    'unified',
    'vfile',
    'mdast-util-gfm',
    'micromark-extension-gfm',
    'hast-util-to-jsx-runtime',
    'html-url-attributes',
    'clsx',
    'devlop',
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
      ignore: [
        // Phase 2 features (v2.0) - planned but not yet implemented
        'src/assetLibrary.tsx',
        'src/propertyPanel.tsx',
        'src/components/AssetLibrary/**',
        'src/components/ColorCorrection/**',
        'src/components/Subtitles/**',
        'src/components/Effects/**',
        'src/components/Mask/**',
        'src/components/PropertyPanel/**',
        'src/components/SpeedControl/**',
        'src/components/TransitionPicker/**',
        'src/components/PenToolEditor.tsx',
        'src/components/ShapeRenderer.tsx',
        'src/components/Toolbar.tsx',
        'src/tools/**',
        'src/utils/colorCorrection.ts',
        'src/utils/shapeAnimation.ts',
        'src/utils/subtitleParser.ts',
        'src/utils/timelineCalculations.ts',
        'src/types/audioEffects.ts',
      ],
    },
    'packages/neko-agent/packages/extension': {},
    'packages/neko-agent/packages/webview': {
      ignore: [
        // Barrel exports
        'src/components/ChatView/InputArea/index.ts',
        'src/config/index.ts',
      ],
    },
    'packages/neko-agent/packages/platform': {},
    'packages/neko-agent/packages/agent': {},
    'packages/neko-canvas/packages/extension': {},
    'packages/neko-canvas/packages/webview': {
      ignore: [
        // Barrel exports
        'src/types/index.ts',
        'src/utils/index.ts',
      ],
    },
    'packages/neko-story/packages/extension': {},
    'packages/neko-story/packages/parser': {},
    'packages/neko-story/packages/webview': {},
    'packages/neko-tools/packages/extension': {},
    'packages/neko-tools/packages/webview': {
      entry: ['src/mediaDiff.tsx'],
      ignore: [
        // Barrel exports and internal utilities
        'src/components/MediaDiff/streaming/index.ts',
        'src/components/MediaDiff/VideoFrameRenderer.tsx',
      ],
    },
    'packages/neko-preview/packages/webview': {
      entry: ['src/audio/main.tsx', 'src/video/main.tsx'],
    },
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
