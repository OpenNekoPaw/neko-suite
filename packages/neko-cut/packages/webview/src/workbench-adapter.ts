import type {
  WorkbenchContributionOwner,
  WorkbenchFeatureWebviewHostAdapterDescriptor,
} from '@neko/workbench-core';

export const CUT_WEBVIEW_ADAPTER_OWNER: WorkbenchContributionOwner = {
  id: '@neko/webview',
  kind: 'core-package',
  displayName: 'Neko Cut',
  trust: 'core',
};

export function createCutFeatureWebviewHostAdapters(): readonly WorkbenchFeatureWebviewHostAdapterDescriptor[] {
  return [
    {
      id: 'neko.cut.webview.root',
      owner: CUT_WEBVIEW_ADAPTER_OWNER,
      label: 'Timeline',
      surface: 'custom-editor',
      runtimeEntryId: '@neko/webview/root',
      supportedHosts: ['vscode', 'electron'],
      requiredHostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
      customEditor: {
        contributionId: 'neko.cut.editor.timeline',
        viewType: 'cut-timeline',
        selectors: [{ extension: '.nkv' }],
        runtime: 'package-host-adapter',
        priority: 'default',
      },
      theme: {
        usesWorkbenchTheme: true,
        tokenScope: 'neko.cut',
      },
      i18n: {
        namespace: 'neko-cut',
        supportedLocales: ['en', 'zh-cn'],
      },
    },
  ];
}
