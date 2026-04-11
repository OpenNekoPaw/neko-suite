/**
 * VSCode Extension Host API Module
 *
 * Shared base classes and infrastructure for VSCode extension host providers.
 * Requires the vscode module (extension host context only).
 *
 * Import via: @neko/shared/vscode/extension
 *
 * NOTE: Do NOT re-export from @neko/shared/vscode/index.ts.
 * That module is for webview (browser) context.
 */
export { BaseOutlineProvider } from './baseOutlineProvider';
export type { IOutlineProvider } from './baseOutlineProvider';

// Logger (OutputChannel transport)
export { OutputChannelTransport, createVSCodeLogger } from './logger';

// Error reporter (showErrorMessage wrapper)
export { VSCodeErrorHandler } from './error-reporter';

// i18n bridge (locale detection + webview injection)
export { getVSCodeLocale, injectLocaleAttribute } from './i18n-bridge';

// Webview asset utilities (GeneratedAsset → webviewUri conversion)
export { toWebviewAsset } from './webview-asset';

// Character registry utilities (workspace characters.json read/write + lookup)
export {
  CharacterRegistryService,
  loadCharacterBindingsForNames,
  resolveCharacterRegistryPath,
} from './character-registry';

// New-file UX (unique name → write → reveal → rename)
export { createNewFile } from './create-new-file';
export type { CreateNewFileOptions, TemplateChoice } from './create-new-file';

// Binary template generators for new-file templates
export {
  generateMinimalInp,
  generateHumanoidInp,
  generateMinimalGlb,
  generateHumanoidGlb,
} from './templates';

// StatusBar group lifecycle manager
export { StatusBarGroup } from './StatusBarGroup';
export type { StatusBarItemConfig } from './StatusBarGroup';
