import type {
  WorkbenchContributionOwner,
  WorkbenchFeatureWebviewHostAdapterDescriptor,
} from '@neko/workbench-core';

export const SKETCH_WEBVIEW_ADAPTER_OWNER: WorkbenchContributionOwner = {
  id: '@neko-sketch/webview',
  kind: 'core-package',
  displayName: 'Neko Sketch',
  trust: 'core',
};

export function createSketchFeatureWebviewHostAdapters(): readonly WorkbenchFeatureWebviewHostAdapterDescriptor[] {
  return [
    {
      id: 'neko.sketch.webview.host-adapter',
      owner: SKETCH_WEBVIEW_ADAPTER_OWNER,
      label: 'Sketch',
      surface: 'custom-editor',
      runtimeEntryId: '@neko-sketch/webview/host-adapter',
      supportedHosts: ['vscode', 'electron'],
      requiredHostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
      customEditor: {
        contributionId: 'neko.sketch.editor.sketch-editor',
        viewType: 'sketch-editor',
        selectors: [{ extension: '.nks' }],
        runtime: 'package-host-adapter',
        priority: 'default',
      },
      theme: {
        usesWorkbenchTheme: true,
        tokenScope: 'neko.sketch',
      },
      i18n: {
        namespace: 'neko-sketch',
        supportedLocales: ['en', 'zh-cn'],
      },
    },
  ];
}
