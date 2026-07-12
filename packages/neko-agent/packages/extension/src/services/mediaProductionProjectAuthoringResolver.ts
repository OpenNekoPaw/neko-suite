import type {
  MediaProductionProjectAuthoringPort,
  MediaProductionProjectAuthoringRequest,
} from '@neko/agent';
import {
  validateDurableResourceRef,
  type NekoAudioAPI,
  type NekoCanvasAPI,
  type NekoCutAPI,
  type NekoProjectAuthoringResult,
  type ResourceRef,
} from '@neko/shared';

interface ExtensionApiHandle<TApi> {
  readonly isActive: boolean;
  readonly exports: TApi | undefined;
  activate(): Promise<TApi>;
}

export interface MediaProductionProjectAuthoringResolverOptions {
  readonly getExtension: (extensionId: string) => ExtensionApiHandle<unknown> | undefined;
  readonly resolveDurableSourcePath: (resourceRef: ResourceRef) => Promise<string>;
}

const EXTENSION_ID_BY_DOMAIN = {
  canvas: 'neko.neko-canvas',
  cut: 'neko.neko-cut',
  audio: 'neko.neko-audio',
} as const;

export function createMediaProductionProjectAuthoringPorts(
  options: MediaProductionProjectAuthoringResolverOptions,
): {
  readonly canvas: MediaProductionProjectAuthoringPort;
  readonly cut: MediaProductionProjectAuthoringPort;
  readonly audio: MediaProductionProjectAuthoringPort;
} {
  return {
    canvas: {
      author: (request) => authorCanvas(options, request),
    },
    cut: {
      author: (request) => authorCut(options, request),
    },
    audio: {
      author: (request) => authorAudio(options, request),
    },
  };
}

async function authorCanvas(
  options: MediaProductionProjectAuthoringResolverOptions,
  request: MediaProductionProjectAuthoringRequest,
): Promise<NekoProjectAuthoringResult> {
  const api = await resolveApi<NekoCanvasAPI>(options, 'canvas');
  const result = await api.authoring.importAsset({
    target: request.handoff.target,
    asset: {
      resourceRef: request.approvedAsset.resourceRef,
      ...(request.handoff.mediaType ? { type: request.handoff.mediaType } : {}),
    },
  });
  return {
    version: 1,
    ok: true,
    documentUri: result.documentUri,
    projectRef: result.projectRef,
    diagnostics: [],
    data: result,
  };
}

async function authorCut(
  options: MediaProductionProjectAuthoringResolverOptions,
  request: MediaProductionProjectAuthoringRequest,
): Promise<NekoProjectAuthoringResult> {
  const api = await resolveApi<NekoCutAPI>(options, 'cut');
  const sourcePath = await resolveSourcePath(options, request.approvedAsset.resourceRef);
  return api.authoring.importGeneratedClip({
    target: request.handoff.target,
    sourcePath,
    ...(request.handoff.mediaType ? { mediaType: request.handoff.mediaType } : {}),
    requestId: request.handoff.handoffId,
  });
}

async function authorAudio(
  options: MediaProductionProjectAuthoringResolverOptions,
  request: MediaProductionProjectAuthoringRequest,
): Promise<NekoProjectAuthoringResult> {
  const api = await resolveApi<NekoAudioAPI>(options, 'audio');
  const sourcePath = await resolveSourcePath(options, request.approvedAsset.resourceRef);
  return api.authoring.importSource({
    target: request.handoff.target,
    sourcePath,
  });
}

async function resolveApi<TApi>(
  options: MediaProductionProjectAuthoringResolverOptions,
  domain: keyof typeof EXTENSION_ID_BY_DOMAIN,
): Promise<TApi> {
  const extensionId = EXTENSION_ID_BY_DOMAIN[domain];
  const extension = options.getExtension(extensionId) as ExtensionApiHandle<TApi> | undefined;
  if (!extension) {
    throw new Error(
      `authoring-capability-unavailable: Owning ${domain} extension is not installed.`,
    );
  }
  const api = extension.isActive ? extension.exports : await extension.activate();
  if (!api || !hasAuthoringApi(api)) {
    throw new Error(
      `authoring-capability-unavailable: Owning ${domain} extension does not expose authoring API.`,
    );
  }
  return api;
}

async function resolveSourcePath(
  options: MediaProductionProjectAuthoringResolverOptions,
  resourceRef: ResourceRef,
): Promise<string> {
  const validation = validateDurableResourceRef(resourceRef);
  if (!validation.ok) {
    throw new Error(
      `source-resolution-failed: ${validation.diagnostics.map((item) => item.message).join(' ')}`,
    );
  }
  const sourcePath = (await options.resolveDurableSourcePath(resourceRef)).trim();
  if (!sourcePath) {
    throw new Error('source-resolution-failed: Durable resource did not resolve to a source path.');
  }
  return sourcePath;
}

function hasAuthoringApi(value: unknown): value is { readonly authoring: object } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'authoring' in value &&
    typeof value.authoring === 'object' &&
    value.authoring !== null
  );
}
