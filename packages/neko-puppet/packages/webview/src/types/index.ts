/**
 * Message protocol types for puppet editor
 *
 * Defines the messages exchanged between extension host and puppet webview.
 */
import type { PuppetAuxiliaryJsonData, PuppetExternalTextureData } from '@neko/shared';
import type { NkpNativeProjectData } from '@neko/shared';
import type { ProjectSourceAddRequest } from '@neko/shared';

export type PuppetEditorProfile = 'live2d' | 'neko-puppet';

export interface PuppetDocumentContext {
  readonly owner: 'neko-puppet';
  readonly documentKind: 'nkp' | 'moc3';
  readonly profile: PuppetEditorProfile;
  readonly runtimeAdapter?: {
    readonly id: string;
    readonly version?: string;
  };
}

/** Messages from extension → webview */
export type ExtensionToWebviewMessage =
  | {
      type: 'documentContext';
      context: PuppetDocumentContext;
    }
  | {
      type: 'loadPuppet';
      data: string;
      textures?: readonly PuppetExternalTextureData[];
      auxiliary?: PuppetAuxiliaryJsonData;
    }
  | {
      type: 'loadPuppetSource';
      source: string;
      textures?: readonly PuppetExternalTextureData[];
      auxiliary?: PuppetAuxiliaryJsonData;
    }
  | {
      type: 'loadNativePuppet';
      project: NkpNativeProjectData;
      textures?: readonly PuppetExternalTextureData[];
    }
  | { type: 'loadPuppetTextures'; textures: readonly PuppetExternalTextureData[] }
  | { type: 'enginePort'; port: number }
  | { type: 'engineUnavailable'; message?: string }
  | { type: 'setLocale'; locale: string }
  | { type: 'loadState'; parameters: Record<string, number> }
  | { type: 'noPuppetSource' }
  | { type: 'puppetImported'; name: string };

/** Messages from webview → extension */
export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'requestEnginePort' }
  | { type: 'state:save'; parameters: Record<string, number> }
  | { type: 'puppet:parametersLoaded'; parameters: string[] }
  | { type: 'project:addSource'; request: ProjectSourceAddRequest };
