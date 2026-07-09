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
    expect(appSource).toContain('leftWorkbenchVisible');
    expect(appSource).toContain('secondarySidebarVisible');
    expect(appSource).toContain('activityBarVisible={leftWorkbenchVisible}');
    expect(appSource).toContain('sidebarVisible={leftWorkbenchVisible}');
    expect(appSource).toContain('secondarySidebarVisible={secondarySidebarVisible}');
    expect(appSource).toContain('onToggleLeftWorkbench');
    expect(appSource).toContain('onToggleSecondarySidebar');
    expect(appSource).toContain('const showEditorHome = openFiles.length === 0');
    expect(appSource).toContain('data-editor-home={showEditorHome ?');
    expect(appSource).toContain('<DesktopEditorHome');
    expect(appSource).toContain('runtimeId="agent-dashboard"');
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
    expect(sharedStyles).toContain('data-activity-visible="false"');
    expect(sharedStyles).toContain('data-secondary-visible="false"');
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
    expect(styles).toContain('.editor-pane[data-editor-home="true"]');
    expect(styles).not.toMatch(/^\.neko-creative-tree-view \[role=['"]treeitem['"]\]/mu);
    expect(styles).toMatch(/\.workspace-file-tree\.neko-creative-tree-view \[role=['"]treeitem['"]\]/u);

    expect(adapterSource).toContain("@neko-canvas/webview/root");
    expect(adapterSource).toContain("@neko-audio/webview/root");
    expect(adapterSource).toContain("@neko-sketch/webview/root");
    expect(adapterSource).toContain("@neko-model/webview/root");
    expect(adapterSource).toContain("@neko/webview/root");
    expect(adapterSource).not.toContain("@neko-canvas/webview/host-adapter");
    expect(adapterSource).not.toContain("@neko-audio/webview/host-adapter");
    expect(adapterSource).not.toContain("@neko-sketch/webview/host-adapter");
    expect(adapterSource).not.toContain("@neko-model/webview/host-adapter");
    expect(adapterSource).not.toContain("@neko/webview/host-adapter");
    expect(adapterSource).not.toContain('CutHostAdapterSurface');
    expect(adapterSource).toContain('CutWebviewRoot');
    expect(adapterSource).toContain('CanvasWebviewRoot');
    expect(adapterSource).toContain('AudioWebviewRoot');
    expect(adapterSource).toContain('SketchWebviewRoot');
    expect(adapterSource).toContain('ModelWebviewRoot');
    expect(adapterSource).toContain('WorkbenchWebviewRuntimeFrame');
    expect(adapterSource).toContain('frameRuntimeId="cut"');
    expect(adapterSource).toContain('setFeatureWebviewContext');
    expect(adapterSource).toContain("hostAdapterInspector: 'hidden'");
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
    expect(appSource).toContain('foundation={agentFoundation}');
    expect(appSource).toContain('createDesktopAgentFoundation');
    expect(appSource).toContain('@neko/ui/foundation');
    expect(appSource).toContain('hostRuntimeAdapter={agentHostRuntimeAdapter}');
    expect(appSource).toContain('createElectronAgentHostRuntimeAdapter');
    expect(appSource).not.toContain('snapshot.agentConsole');
    expect(appSource).not.toContain('function AgentConsole');
    expect(mainSource).toContain('<I18nProvider service={i18nService}>');
  });

  it('adapts the Agent package webview protocol through the desktop host bridge', () => {
    const preloadSource = readFileSync(resolve(packageRoot, 'src/preload/index.ts'), 'utf8');
    const mainSource = readFileSync(resolve(packageRoot, 'src/main/index.ts'), 'utf8');
    const agentHostSource = readFileSync(
      resolve(packageRoot, 'src/main/agent-webview-host.ts'),
      'utf8',
    );
    const contractsSource = readFileSync(resolve(packageRoot, 'src/shared/contracts.ts'), 'utf8');
    const packageJson = readFileSync(resolve(packageRoot, 'package.json'), 'utf8');

    expect(contractsSource).toContain('sendAgentRuntimeMessage');
    expect(contractsSource).toContain('DESKTOP_AGENT_RUNTIME_IDS');
    expect(contractsSource).toContain('DESKTOP_LEGACY_VSCODE_API_GLOBAL');
    expect(contractsSource).not.toContain('sendAgentWebviewMessage');
    expect(preloadSource).toContain('sendAgentRuntimeMessage');
    expect(preloadSource).toContain('Migration-only shim');
    expect(preloadSource).toContain(
      'contextBridge.exposeInMainWorld(DESKTOP_LEGACY_VSCODE_API_GLOBAL',
    );
    expect(preloadSource).toContain('dispatchAgentHostMessages');
    expect(mainSource).toContain('handleRawDesktopAgentRuntimeMessageRequest');
    expect(mainSource).not.toContain('handleRawDesktopAgentWebviewMessage');
    expect(agentHostSource).toContain('parseWebviewToExtensionMessage');
    expect(agentHostSource).toContain('DESKTOP_AGENT_HOST_ROUTE_SUPPORT');
    expect(agentHostSource).toContain('buildAssistantSettingsRuntimeDataMessage');
    expect(agentHostSource).toContain('buildConfigStateMessage');
    expect(mainSource).toContain('ConfigManager');
    expect(mainSource).toContain('FileUserConfigManager');
    expect(agentHostSource).toContain('getAssistantSettingsData');
    expect(agentHostSource).toContain('getAssistantConfigState');
    expect(contractsSource).toContain('sendFeatureWebviewMessage');
    expect(preloadSource).toContain('setFeatureWebviewContext');
    expect(mainSource).toContain('handleRawDesktopFeatureWebviewMessage');
    expect(packageJson).toContain('"@neko/platform"');
    expect(packageJson).toContain('"@neko-agent/types"');
  });

  it('exposes complete package webview roots as package-owned public entries', () => {
    const canvasPackage = readFileSync(
      resolve(packageRoot, '../neko-canvas/packages/webview/package.json'),
      'utf8',
    );
    const canvasMainSource = readFileSync(
      resolve(packageRoot, '../neko-canvas/packages/webview/src/main.tsx'),
      'utf8',
    );
    const cutPackage = readFileSync(resolve(packageRoot, '../neko-cut/packages/webview/package.json'), 'utf8');
    const cutMainSource = readFileSync(resolve(packageRoot, '../neko-cut/packages/webview/src/main.tsx'), 'utf8');
    const audioPackage = readFileSync(
      resolve(packageRoot, '../neko-audio/packages/webview/package.json'),
      'utf8',
    );
    const audioMainSource = readFileSync(
      resolve(packageRoot, '../neko-audio/packages/webview/src/editor/main.tsx'),
      'utf8',
    );
    const sketchPackage = readFileSync(
      resolve(packageRoot, '../neko-sketch/packages/webview/package.json'),
      'utf8',
    );
    const sketchMainSource = readFileSync(
      resolve(packageRoot, '../neko-sketch/packages/webview/src/main.tsx'),
      'utf8',
    );
    const modelPackage = readFileSync(
      resolve(packageRoot, '../neko-model/packages/webview/package.json'),
      'utf8',
    );
    const modelMainSource = readFileSync(
      resolve(packageRoot, '../neko-model/packages/webview/src/main.tsx'),
      'utf8',
    );
    const agentPackage = readFileSync(
      resolve(packageRoot, '../neko-agent/packages/webview/package.json'),
      'utf8',
    );
    const agentMainSource = readFileSync(
      resolve(packageRoot, '../neko-agent/packages/webview/src/main.tsx'),
      'utf8',
    );

    expect(canvasPackage).toContain('"./root": "./src/root.tsx"');
    expect(canvasMainSource).toContain('<CanvasWebviewRoot />');
    expect(cutPackage).toContain('"./root": "./src/root.tsx"');
    expect(cutMainSource).toContain('<CutWebviewRoot />');
    expect(audioPackage).toContain('"./root": "./src/root.tsx"');
    expect(audioMainSource).toContain('<AudioWebviewRoot />');
    expect(sketchPackage).toContain('"./root": "./src/root.tsx"');
    expect(sketchMainSource).toContain('<SketchWebviewRoot />');
    expect(modelPackage).toContain('"./root": "./src/root.tsx"');
    expect(modelMainSource).toContain('<ModelWebviewRoot />');
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
