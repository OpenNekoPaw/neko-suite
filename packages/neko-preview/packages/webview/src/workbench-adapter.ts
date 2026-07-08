import type {
  WorkbenchContributionOwner,
  WorkbenchFeatureWebviewHostAdapterDescriptor,
} from '@neko/workbench-core';

export const PREVIEW_WEBVIEW_ADAPTER_OWNER: WorkbenchContributionOwner = {
  id: '@neko/preview-webview',
  kind: 'core-package',
  displayName: 'Neko Preview',
  trust: 'core',
};

export function createPreviewFeatureWebviewHostAdapters(): readonly WorkbenchFeatureWebviewHostAdapterDescriptor[] {
  return [
    {
      id: 'neko.preview.webview.host-adapter',
      owner: PREVIEW_WEBVIEW_ADAPTER_OWNER,
      label: 'Media Preview',
      surface: 'custom-editor',
      runtimeEntryId: '@neko/preview-webview/host-adapter',
      supportedHosts: ['vscode', 'electron'],
      requiredHostCapabilities: ['workbench.customEditors', 'workbench.webviews'],
      customEditor: {
        contributionId: 'neko.preview.editor.media',
        viewType: 'media-preview',
        selectors: [
          { extension: '.png' },
          { extension: '.jpg' },
          { extension: '.jpeg' },
          { extension: '.webp' },
          { extension: '.gif' },
          { extension: '.avif' },
          { extension: '.mp4' },
          { extension: '.mov' },
          { extension: '.m4v' },
          { extension: '.webm' },
          { extension: '.mkv' },
          { extension: '.mp3' },
          { extension: '.wav' },
          { extension: '.aac' },
          { extension: '.flac' },
          { extension: '.ogg' },
          { extension: '.m4a' },
        ],
        runtime: 'package-host-adapter',
        priority: 'default',
      },
      theme: {
        usesWorkbenchTheme: true,
        tokenScope: 'neko.preview',
      },
      i18n: {
        namespace: 'neko-preview',
        supportedLocales: ['en', 'zh-cn'],
      },
    },
  ];
}
