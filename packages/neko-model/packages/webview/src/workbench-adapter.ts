import type {
  WorkbenchContributionOwner,
  WorkbenchFeatureWebviewHostAdapterDescriptor,
} from '@neko/workbench-core';

export const MODEL_WEBVIEW_ADAPTER_OWNER: WorkbenchContributionOwner = {
  id: '@neko-model/webview',
  kind: 'core-package',
  displayName: 'Neko Model',
  trust: 'core',
};

export function createModelFeatureWebviewHostAdapters(): readonly WorkbenchFeatureWebviewHostAdapterDescriptor[] {
  return [
    {
      id: 'neko.model.webview.root',
      owner: MODEL_WEBVIEW_ADAPTER_OWNER,
      label: 'Model',
      surface: 'custom-editor',
      runtimeEntryId: '@neko-model/webview/root',
      supportedHosts: ['vscode', 'electron'],
      requiredHostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
      customEditor: {
        contributionId: 'neko.model.editor.viewport',
        viewType: 'model-viewport',
        selectors: [
          { extension: '.nkm' },
          { extension: '.glb' },
          { extension: '.gltf' },
          { extension: '.fbx' },
          { extension: '.obj' },
        ],
        runtime: 'package-webview-root',
        priority: 'default',
      },
      theme: {
        usesWorkbenchTheme: true,
        tokenScope: 'neko.model',
      },
      i18n: {
        namespace: 'neko-model',
        supportedLocales: ['en', 'zh-cn'],
      },
    },
  ];
}
