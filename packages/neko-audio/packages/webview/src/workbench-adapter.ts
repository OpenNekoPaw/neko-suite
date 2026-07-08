import type {
  WorkbenchContributionOwner,
  WorkbenchFeatureWebviewHostAdapterDescriptor,
} from '@neko/workbench-core';

export const AUDIO_WEBVIEW_ADAPTER_OWNER: WorkbenchContributionOwner = {
  id: '@neko-audio/webview',
  kind: 'core-package',
  displayName: 'Neko Audio',
  trust: 'core',
};

export function createAudioFeatureWebviewHostAdapters(): readonly WorkbenchFeatureWebviewHostAdapterDescriptor[] {
  return [
    {
      id: 'neko.audio.webview.host-adapter',
      owner: AUDIO_WEBVIEW_ADAPTER_OWNER,
      label: 'Audio',
      surface: 'custom-editor',
      runtimeEntryId: '@neko-audio/webview/host-adapter',
      supportedHosts: ['vscode', 'electron'],
      requiredHostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
      customEditor: {
        contributionId: 'neko.audio.editor.timeline',
        viewType: 'audio-timeline',
        selectors: [{ extension: '.nka' }],
        runtime: 'package-host-adapter',
        priority: 'default',
      },
      theme: {
        usesWorkbenchTheme: true,
        tokenScope: 'neko.audio',
      },
      i18n: {
        namespace: 'neko-audio',
        supportedLocales: ['en', 'zh-cn'],
      },
    },
  ];
}
