import type {
  WorkbenchContributionOwner,
  WorkbenchFeatureWebviewHostAdapterDescriptor,
} from '@neko/workbench-core';

export const CANVAS_WEBVIEW_ADAPTER_OWNER: WorkbenchContributionOwner = {
  id: '@neko-canvas/webview',
  kind: 'core-package',
  displayName: 'Neko Canvas',
  trust: 'core',
};

export function createCanvasFeatureWebviewHostAdapters(): readonly WorkbenchFeatureWebviewHostAdapterDescriptor[] {
  return [
    {
      id: 'neko.canvas.webview.root',
      owner: CANVAS_WEBVIEW_ADAPTER_OWNER,
      label: 'Canvas',
      surface: 'custom-editor',
      runtimeEntryId: '@neko-canvas/webview/root',
      supportedHosts: ['vscode', 'electron'],
      requiredHostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
      customEditor: {
        contributionId: 'neko.canvas.editor.canvas-workbench',
        viewType: 'canvas-workbench',
        selectors: [{ extension: '.nkc' }],
        runtime: 'package-webview-root',
        priority: 'default',
      },
      theme: {
        usesWorkbenchTheme: true,
        tokenScope: 'neko.canvas',
      },
      i18n: {
        namespace: 'neko-canvas',
        supportedLocales: ['en', 'zh-cn'],
      },
    },
  ];
}
