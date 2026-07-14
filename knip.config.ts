import type { KnipConfig } from 'knip';

const config: KnipConfig = {
  exclude: [
    // Type-only exports in app code create too much noise for this monorepo.
    // We keep knip focused on runtime dead code and dependency drift.
    'types',
  ],
  ignore: [
    // Skills are runtime CLI scripts, not imported modules
    'skills/**',
  ],
  ignoreBinaries: [
    // Root package scripts invoke this local CI wrapper directly.
    'scripts/act-ci.sh',
  ],
  ignoreDependencies: [
    '@fission-ai/openspec', // Used by the `openspec` CLI invoked in development workflow.
    '@types/vscode', // Provided by VSCode runtime
    'esbuild', // Used as CLI bundler, not imported
    'sharp', // Native binary, loaded at runtime
    '@img/sharp-wasm32', // Sharp WASM fallback
    'clsx',
  ],
  ignoreIssues: {
    // Internal editor API surfaces: intentionally exported for feature modules
    'packages/neko-cut/packages/webview/src/types.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/types/**/*.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/constants.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/index.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/vscodeApi.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/speed.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/waveform.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/pyramidThumbnail.ts': ['exports'],
    // Logger facades expose test-injection hooks for package Webview tests.
    'packages/neko-canvas/packages/webview/src/utils/logger.ts': ['exports'],
    'packages/neko-cut/packages/webview/src/utils/logger.ts': ['exports'],
    'packages/neko-market/packages/webview/src/utils/logger.ts': ['exports'],
    'packages/neko-preview/packages/webview/src/utils/logger.ts': ['exports'],
    'packages/neko-story/packages/webview/src/utils/logger.ts': ['exports'],
    'packages/neko-tools/packages/webview/src/utils/logger.ts': ['exports'],
    // Barrel entrypoints for sketch subsystems
    'packages/neko-sketch/packages/webview/src/engine/index.ts': ['exports'],
    'packages/neko-sketch/packages/webview/src/brush/index.ts': ['exports'],
    'packages/neko-sketch/packages/webview/src/layer/index.ts': ['exports'],
    // Shared contract files consumed as package-level type surfaces
    'packages/neko-canvas/packages/webview/src/types/extendedCanvas.ts': ['exports'],
    'packages/neko-preview/packages/extension/src/types/document-messages.ts': ['exports'],
    'packages/neko-preview/packages/webview/src/shared/document-types.ts': ['exports'],
    'packages/neko-story/packages/webview/src/preview/index.ts': ['exports'],
    'packages/neko-story/packages/webview/src/preview/conditionEvaluator.ts': ['exports'],
    'packages/neko-story/packages/webview/src/preview/rendererRegistry.tsx': ['exports'],
    'packages/neko-story/packages/webview/src/preview/renderers.tsx': ['exports'],
    // CommonJS script API consumed by package/bundle scripts via require().
    'packages/neko-engine/scripts/package-config.js': ['exports'],
  },

  workspaces: {
    '.': {
      entry: [
        'scripts/agent-eval/ablation/run.mjs',
        'scripts/agent-eval/all-suite-dry-run.mjs',
        'scripts/agent-eval/canvas-json-check.mjs',
        'scripts/agent-eval/ci-run.mjs',
        'scripts/agent-eval/protocol-smoke.mjs',
        'scripts/agent-eval/validators/file-validator-cli.mjs',
        'scripts/check-3d-route-a-boundaries.mjs',
        'scripts/check-canvas-playback-boundary.mjs',
        'scripts/compile-ts-vsix.mjs',
        'scripts/scene-render-diagnostics.mjs',
      ],
    },
    // ── Layer 0: Library packages ──────────────────────
    'packages/neko-types': {
      // Knip auto-detects entries from package.json exports
      ignoreDependencies: ['react', 'react-dom', 'tailwindcss'], // Optional peer dependencies
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
      ignore: ['packages/engine-*/**', 'packages/host-napi/**', 'packages/host-cli/**', 'packages/runtime-*/**'], // Rust packages, skip
    },

    // ── Extension sub-packages ────────────────────────
    'packages/neko-cut/packages/extension': {},
    'packages/neko-cut/packages/webview': {
      // Vite auto-detects entries from HTML files, explicit entry is redundant
      ignore: [
        // Phase 2 features (v2.0) - planned but not yet implemented
        'src/assetLibrary.tsx',
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
        'src/utils/subtitleParser.ts',
        'src/types/audioEffects.ts',
      ],
    },
    'packages/neko-agent/packages/extension': {
      ignoreDependencies: [
        // Loaded via runtime import() in DocumentReaderService
        'mammoth',
        'officeparser',
        'pdf-parse',
        // Loaded via runtime import() in platform document readers.
        // Knip cannot follow these dynamic parser backends from the extension package manifest.
        'epub2',
        'fast-xml-parser',
        'node-fetch',
        'node-unrar-js',
        'xlsx',
      ],
    },
    'packages/neko-agent/packages/cli-tui': {
      entry: ['build-neko.ts'],
    },
    'packages/neko-agent/packages/webview': {
      ignore: [
        // Barrel exports
        'src/components/ChatView/InputArea/index.ts',
        'src/config/index.ts',
      ],
    },
    'packages/neko-agent/packages/platform': {},
    'packages/neko-agent/packages/agent': {},
    'packages/neko-agent/test-utils': {},
    'packages/neko-canvas/packages/extension': {},
    'packages/neko-canvas/packages/webview': {
      entry: [
        'src/main.tsx',
        'src/preview/narrativePreviewMediaRuntime.ts',
      ],
      ignore: [
        // Barrel exports
        'src/types/index.ts',
        'src/utils/index.ts',
        // Used via barrel exports in panels/
        'src/components/panels/PortEditor.tsx',
        'src/components/panels/PropertyPanel.tsx',
      ],
    },
    'packages/neko-story/packages/extension': {},
    'packages/neko-story/packages/parser': {},
    'packages/neko-story/packages/webview': {
      ignore: [
        // i18n module loaded at runtime
        'src/i18n/**',
      ],
    },
    'packages/neko-tools/packages/extension': {},
    'packages/neko-tools/packages/webview': {
      entry: ['src/mediaDiff.tsx', 'src/assetDiff.tsx'],
      ignore: [
        // Barrel exports and internal utilities
        'src/components/MediaDiff/streaming/index.ts',
        'src/components/MediaDiff/VideoFrameRenderer.tsx',
      ],
    },
    'packages/neko-preview/packages/webview': {
      entry: [
        'src/audio/main.tsx',
        'src/video/main.tsx',
        'src/cbz/main.tsx',
        'src/docx/main.tsx',
        'src/epub/main.tsx',
        'src/pdf/main.tsx',
        'src/panorama-image/main.tsx',
        'src/panorama-video/main.tsx',
      ],
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
    'packages/neko-model/packages/extension': {},
    'packages/neko-model/packages/webview': {},
    'packages/neko-audio': { ignore: ['**/*'] },
    'packages/neko-live': { ignore: ['**/*'] },
    'packages/neko-sketch': {},
    'packages/neko-sketch/packages/extension': {},
    'packages/neko-sketch/packages/webview': {
      ignore: [
        // Barrel exports used by tool system
        'src/tools/index.ts',
        'src/tools/tool-manager.ts',
        'src/selection/selection-manager.ts',
      ],
    },
    'packages/neko-puppet': {},
    'packages/neko-puppet/packages/extension': {},
    'packages/neko-puppet/packages/webview': {},
    'packages/neko-suite': {
      // Meta package with only documentation
      entry: ['package.json'],
    },
    'packages/neko-auth': {
      // VSCode wrapper package; workspace deps are consumed via nested extension/core packages
      ignoreDependencies: ['@neko/auth-core', '@neko/auth-extension', '@neko/shared'],
    },
    'packages/neko-engine/packages/host-napi': { ignore: ['**/*'] },
    'packages/neko-engine/packages/host-cli': {
      // Rust CLI binary, not TypeScript
      entry: ['package.json'],
    },
  },
};

export default config;
