import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

describe('desktop workbench layout', () => {
  it('keeps the renderer mapped to compatible docked editor zones', () => {
    const appSource = readFileSync(resolve(packageRoot, 'src/renderer/App.tsx'), 'utf8');
    const mainSource = readFileSync(resolve(packageRoot, 'src/renderer/main.tsx'), 'utf8');
    const sharedStyles = readFileSync(
      resolve(packageRoot, '../neko-ui/src/workbench/editor-workbench.css'),
      'utf8',
    );

    expect(appSource).toContain('<EditorWorkbenchShell');
    expect(appSource).toContain('<WorkbenchActivityBar');
    expect(appSource).toContain('<WorkbenchEditorTabs');
    expect(appSource).toContain('className="workspace-pane"');
    expect(appSource).toContain('className="editor-pane"');
    expect(appSource).toContain('secondarySidebar={');
    expect(appSource).toContain('function RightWorkbenchPanel');
    expect(appSource).toContain('className="right-workbench-panel"');
    expect(appSource).toContain('className="inspector-pane"');
    expect(appSource).toContain('WorkbenchWebviewRuntimeFrame');
    expect(appSource).toContain('runtimeId="agent"');
    expect(appSource).toContain('<WorkbenchStatusBar');
    expect(appSource).toContain('snapshot.workbench.contributionSnapshot.contributions.length');
    expect(appSource).toContain('snapshot.workbench.resourceProviders.length');
    expect(appSource).toContain('snapshot.workbench.diagnostics.length');
    expect(appSource).not.toContain('bottomPanel={');
    expect(mainSource).toContain("@neko/ui/workbench/editor-workbench.css");

    expect(sharedStyles).toContain('"activity sidebar editor secondary"');
    expect(sharedStyles).toContain('"activity sidebar bottom secondary"');
    expect(sharedStyles).toContain('grid-area: activity');
    expect(sharedStyles).toContain('grid-area: sidebar');
    expect(sharedStyles).toContain('grid-area: editor');
    expect(sharedStyles).toContain('grid-area: secondary');
    expect(sharedStyles).toContain('grid-area: bottom');
    expect(sharedStyles).toContain('.neko-workbench-webview-runtime-frame');
    expect(sharedStyles).toContain('data-neko-webview-runtime="agent"');
  });

  it('does not keep a duplicate desktop-only workbench UI implementation in App', () => {
    const appSource = readFileSync(resolve(packageRoot, 'src/renderer/App.tsx'), 'utf8');
    const styles = readFileSync(resolve(packageRoot, 'src/renderer/styles.css'), 'utf8');
    const adapterSource = readFileSync(
      resolve(packageRoot, 'src/renderer/creative-editor-adapters.tsx'),
      'utf8',
    );

    expect(appSource).not.toContain('function SurfaceButton');
    expect(appSource).not.toContain('function EditorTabs');
    expect(appSource).not.toContain('function CanvasEditorSurface');
    expect(appSource).not.toContain('creative-panel');
    expect(styles).not.toContain('.activity-bar');
    expect(styles).not.toContain('.surface-button');
    expect(styles).not.toContain('.editor-tabs');
    expect(styles).not.toContain('.resource-card');
    expect(styles).not.toContain('.creative-panel');
    expect(styles).not.toContain('.desktop-full-webview-runtime');
    expect(styles).not.toContain('.agent-');
    expect(styles).not.toContain('.cut-');
    expect(styles).not.toMatch(/^\.neko-creative-tree-view \[role="treeitem"\]/mu);
    expect(styles).toContain('.workspace-file-tree.neko-creative-tree-view [role="treeitem"]');

    expect(adapterSource).toContain("@neko-canvas/webview/host-adapter");
    expect(adapterSource).toContain("@neko/webview/root");
    expect(adapterSource).not.toContain("@neko/webview/host-adapter");
    expect(adapterSource).not.toContain('CutHostAdapterSurface');
    expect(adapterSource).toContain('CutWebviewRoot');
    expect(adapterSource).toContain('WorkbenchWebviewRuntimeFrame');
    expect(adapterSource).toContain('runtimeId="cut"');
    expect(adapterSource).toContain("hostAdapterInspector: 'hidden'");
    expect(adapterSource).toContain("@neko-audio/webview/host-adapter");
    expect(adapterSource).toContain("@neko-sketch/webview/host-adapter");
    expect(adapterSource).toContain("@neko-model/webview/host-adapter");
    expect(adapterSource).toContain("@neko/preview-webview/host-adapter");
    expect(adapterSource).toContain('ViewportShell');
    expect(adapterSource).toContain('listDesktopCreativeAdapterPanelKinds');
    expect(adapterSource).toContain('createDesktopFeatureEditorAdapterDescriptorForPanelKind');
    expect(adapterSource).toContain('listDesktopFeatureEditorPanelKinds');
    expect(adapterSource).not.toContain("packageName: '@neko-canvas/webview'");
    expect(adapterSource).not.toContain("packageName: '@neko/webview'");
    expect(adapterSource).not.toContain("packageName: '@neko-audio/webview'");
    expect(adapterSource).not.toContain("packageName: '@neko-sketch/webview'");
    expect(adapterSource).not.toContain("packageName: '@neko-model/webview'");
    expect(adapterSource).not.toContain("packageName: '@neko/preview-webview'");
    expect(adapterSource).not.toContain('data-creative-panel="canvas-workbench"');
    expect(adapterSource).not.toContain('data-creative-panel="cut-timeline"');
    expect(adapterSource).not.toContain('data-creative-panel="audio-timeline"');
    expect(adapterSource).not.toContain('data-creative-panel="sketch-editor"');
    expect(adapterSource).not.toContain('data-creative-panel="model-viewport"');
  });

  it('scans mounted package webview sources for Tailwind utilities', () => {
    const tailwindConfig = readFileSync(resolve(packageRoot, 'tailwind.config.js'), 'utf8');
    const requiredContentSources = [
      '../neko-agent/packages/webview/src/**/*.{js,ts,jsx,tsx}',
      '../neko-cut/packages/webview/src/**/*.{js,ts,jsx,tsx}',
      '../neko-canvas/packages/webview/src/**/*.{js,ts,jsx,tsx}',
      '../neko-audio/packages/webview/src/**/*.{js,ts,jsx,tsx}',
      '../neko-sketch/packages/webview/src/**/*.{js,ts,jsx,tsx}',
      '../neko-model/packages/webview/src/**/*.{js,ts,jsx,tsx}',
      '../neko-preview/packages/webview/src/**/*.{js,ts,jsx,tsx}',
      '../neko-types/src/components/**/*.{js,ts,jsx,tsx}',
      '../neko-ui/src/**/*.{js,ts,jsx,tsx}',
    ] as const;

    expect(tailwindConfig).toContain('nekoTailwindPreset');
    for (const source of requiredContentSources) {
      expect(tailwindConfig).toContain(source);
    }
  });

  it('loads shared Codicon CSS through the @neko/ui icon entrypoint', () => {
    const mainSource = readFileSync(resolve(packageRoot, 'src/renderer/main.tsx'), 'utf8');
    const styles = readFileSync(resolve(packageRoot, 'src/renderer/styles.css'), 'utf8');
    const uiPackage = readFileSync(resolve(packageRoot, '../neko-ui/package.json'), 'utf8');
    const codiconCss = readFileSync(resolve(packageRoot, '../neko-ui/src/icons/codicon.css'), 'utf8');

    expect(mainSource).toContain("@neko/ui/icons/codicon.css");
    expect(uiPackage).toContain('"./icons/codicon.css": "./src/icons/codicon.css"');
    expect(uiPackage).toContain('"@vscode/codicons"');
    expect(codiconCss).toContain('@vscode/codicons/dist/codicon.css');
    expect(styles).not.toContain('.codicon-chevron-right::before');
    expect(styles).not.toContain('.codicon-chevron-down::before');
  });

  it('keeps workspace tree selection separate from open editor selection', () => {
    const appSource = readFileSync(resolve(packageRoot, 'src/renderer/App.tsx'), 'utf8');

    expect(appSource).toContain('selectedWorkspaceNodeId');
    expect(appSource).toContain('function WorkspaceExplorer');
    expect(appSource).toContain('function ExplorerTitleBar');
    expect(appSource).toContain('function ExplorerToolbar');
    expect(appSource).toContain('function ExplorerBottomSections');
    expect(appSource).toContain('handleEditorFileSelect');
    expect(appSource).toContain('handleWorkspaceNodeSelect');
    expect(appSource).toContain("node.kind === 'directory'");
    expect(appSource).toContain('!node.editor');
    expect(appSource).toContain('selectedNodeId={selectedWorkspaceNodeId}');
    expect(appSource).toContain('snapshot.workspaceTree.rootName.toUpperCase()');
    expect(appSource).toContain('virtualization={{ enabled: false, itemHeight: 22 }}');
    expect(appSource).toContain('formatWorkspaceNodeTitle');
    expect(appSource).toContain('readTreeItemScmDecoration');
    expect(appSource).toContain('workspace-file-scm--directory');
    expect(appSource).toContain('workspace-media-strip');
    expect(appSource).toContain('<WorkspaceFileIcon node={node} />');
    expect(appSource).toContain('MEDIA_PREVIEW_KIND_ORDER');
    expect(appSource).toContain('isMediaPreviewFile');
    expect(appSource).not.toContain('height={360}');
    expect(appSource).not.toContain("badges: node.editor");
    expect(appSource).not.toContain('file-kind-icon');
  });

  it('mounts the Agent package webview root instead of a desktop Agent projection', () => {
    const appSource = readFileSync(resolve(packageRoot, 'src/renderer/App.tsx'), 'utf8');
    const mainSource = readFileSync(resolve(packageRoot, 'src/renderer/main.tsx'), 'utf8');

    expect(appSource).toContain("@neko-agent/webview/root");
    expect(appSource).toContain('<AgentWebviewRoot');
    expect(appSource).not.toContain('snapshot.agentConsole');
    expect(appSource).not.toContain('function AgentConsole');
    expect(mainSource).toContain('<I18nProvider service={i18nService}>');
  });

  it('exposes complete Cut and Agent webview roots as package-owned public entries', () => {
    const cutPackage = readFileSync(resolve(packageRoot, '../neko-cut/packages/webview/package.json'), 'utf8');
    const cutMainSource = readFileSync(resolve(packageRoot, '../neko-cut/packages/webview/src/main.tsx'), 'utf8');
    const agentPackage = readFileSync(
      resolve(packageRoot, '../neko-agent/packages/webview/package.json'),
      'utf8',
    );
    const agentMainSource = readFileSync(
      resolve(packageRoot, '../neko-agent/packages/webview/src/main.tsx'),
      'utf8',
    );

    expect(cutPackage).toContain('"./root": "./src/root.tsx"');
    expect(cutMainSource).toContain('<CutWebviewRoot />');
    expect(agentPackage).toContain('"./root": "./src/root.tsx"');
    expect(agentMainSource).toContain('<AgentWebviewRoot />');
  });

  it('keeps package host adapter chrome localized by the owning packages', () => {
    const packageAdapters = [
      {
        path: '../neko-canvas/packages/webview/src/host-adapter/index.tsx',
        keys: ['toolbar.leftRail', 'toolbar.selectTool', 'toolbar.layers', 'toolbar.export'],
        forbidden: ['Canvas tools', "'Select'", "'Export'", 'Prompt', 'Preview'],
      },
      {
        path: '../neko-cut/packages/webview/src/host-adapter/index.tsx',
        keys: [
          'preview.leftRail',
          'timeline.contextMenu.cut',
          'timeline.controls.play',
          'timeline.controls.pause',
          'timeline.controls.export',
        ],
        forbidden: ['Cut tools', "'Cut'", "'Play'", "'Pause'", "'Export'"],
      },
      {
        path: '../neko-audio/packages/webview/src/host-adapter/index.tsx',
        keys: [
          'audio.toolbar.leftRail',
          'audio.controls.play',
          'audio.controls.pause',
          'audio.addSource.import',
          'audio.sidePanel.show',
        ],
        forbidden: ['Audio tools', "'Play'", "'Pause'", "'Import'", 'Side panel'],
      },
      {
        path: '../neko-sketch/packages/webview/src/host-adapter/index.tsx',
        keys: [
          'sketch.toolbar.ariaLabel',
          'sketch.toolbar.brush',
          'sketch.panel.layers',
          'sketch.hostAdapter.settings',
        ],
        forbidden: ['Sketch tools', "'Brush'", "'Layers'", "'Settings'"],
      },
      {
        path: '../neko-model/packages/webview/src/host-adapter/index.tsx',
        keys: [
          'toolbar.modelLeftRail',
          'hostAdapter.orbit',
          'sceneTree.title',
          'characterPreview.play',
          'hostAdapter.settings',
        ],
        forbidden: ['Model tools', "'Orbit'", "'Play'", "'Settings'", 'Scene {name}'],
      },
      {
        path: '../neko-preview/packages/webview/src/host-adapter/index.tsx',
        keys: ['preview.hostAdapter.tools'],
        forbidden: ['Preview tools'],
      },
    ] as const;

    for (const adapter of packageAdapters) {
      const source = readFileSync(resolve(packageRoot, adapter.path), 'utf8');

      expect(source).toContain("from '../i18n'");
      expect(source).toContain('setLocale(locale)');
      expect(source).toContain('inspectorLabels={adapterInspectorLabels(runtime.label)}');
      expect(source).toContain('adapterInspectorLabels');

      for (const key of adapter.keys) {
        expect(source).toContain(key);
      }
      for (const literal of adapter.forbidden) {
        expect(source).not.toContain(literal);
      }
    }

    const desktopAdapterHost = readFileSync(
      resolve(packageRoot, 'src/renderer/creative-editor-adapters.tsx'),
      'utf8',
    );
    expect(desktopAdapterHost).toContain('locale: snapshot.host.locale');
  });
});
