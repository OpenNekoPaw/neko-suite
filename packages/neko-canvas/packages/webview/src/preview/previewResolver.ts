import type { CanvasPreviewRole, PreviewVariantRole } from '@neko/shared';
import { getGlobalVSCodeApi } from '../utils/vscode';
import type { PreviewResolveRequest, PreviewResolver, RuntimePreviewVariant } from './types';

const SAFE_URL_RE = /^(data:|blob:|https?:)/;

export function isSafeWebviewUrl(url: string): boolean {
  return SAFE_URL_RE.test(url);
}

const ROLE_TO_ENGINE_ROLE: Partial<Record<CanvasPreviewRole, PreviewVariantRole>> = {
  image: 'thumbnail',
  'document-cover': 'thumbnail',
  'video-poster': 'thumbnail',
  'video-proxy': 'proxy',
  'audio-waveform': 'thumbnail',
  'model-screenshot': 'screenshot',
  'model-turntable': 'proxy',
  'panorama-fov-crop': 'fov-crop',
  'panorama-rotation': 'proxy',
  fallback: 'thumbnail',
};

export class WebviewPreviewResolver implements PreviewResolver {
  private readonly pending = new Set<RuntimeVariantRequest>();

  async resolve(request: PreviewResolveRequest): Promise<RuntimePreviewVariant> {
    const preferred = selectStableVariant(request);
    if (preferred?.sourcePath || preferred?.assetId) {
      return preferred;
    }

    const sourcePath = request.source.asset?.path ?? request.source.asset?.uri;
    const documentResourceRef = request.source.metadata?.['documentResourceRef'];
    const resourceRef = request.source.metadata?.['resourceRef'];
    if (!sourcePath && !documentResourceRef && !resourceRef) {
      return createFallbackVariant(request, 'No preview source');
    }

    const runtimeUrl = await this.requestRuntimeVariant({
      sourceId: request.source.id,
      assetPath: sourcePath,
      role: request.role ?? request.source.role,
      mediaType: request.source.asset?.mediaType,
      documentResourceRef,
      resourceRef,
    });

    return {
      id: `${request.source.id}:runtime`,
      role: request.role ?? request.source.role,
      assetId: request.source.asset?.assetId,
      sourcePath,
      runtimeUrl,
      mimeType: request.source.asset?.mediaType,
    };
  }

  dispose(): void {
    for (const request of Array.from(this.pending)) {
      request.dispose();
    }
    this.pending.clear();
  }

  private requestRuntimeVariant(input: RuntimeVariantInput): Promise<string | undefined> {
    const request = createRuntimeVariantRequest(input, () => {
      this.pending.delete(request);
    });
    this.pending.add(request);
    return request.promise;
  }
}

function selectStableVariant(request: PreviewResolveRequest): RuntimePreviewVariant | undefined {
  const role = request.role ?? request.source.role;
  const variant = request.source.variants?.find((candidate) => candidate.role === role);
  if (!variant) {
    return undefined;
  }

  return {
    ...variant,
    runtimeUrl: variant.sourcePath,
  };
}

function createFallbackVariant(
  request: PreviewResolveRequest,
  label: string,
): RuntimePreviewVariant {
  return {
    id: `${request.source.id}:fallback`,
    role: 'fallback',
    assetId: request.source.asset?.assetId,
    sourcePath: request.source.asset?.path,
    metadata: { label },
  };
}

interface RuntimeVariantInput {
  sourceId: string;
  assetPath?: string;
  role: CanvasPreviewRole;
  mediaType?: string;
  documentResourceRef?: unknown;
  resourceRef?: unknown;
}

interface RuntimeVariantRequest {
  promise: Promise<string | undefined>;
  dispose: () => void;
}

function createRuntimeVariantRequest(
  { sourceId, assetPath, role, mediaType, documentResourceRef, resourceRef }: RuntimeVariantInput,
  onSettled: () => void,
): RuntimeVariantRequest {
  const vscode = getGlobalVSCodeApi();
  const engineRole = ROLE_TO_ENGINE_ROLE[role] ?? 'thumbnail';

  if (!vscode) {
    return {
      promise: Promise.resolve(undefined as string | undefined).finally(onSettled),
      dispose: () => {},
    };
  }

  let settled = false;
  let resolvePromise: (value: string | undefined) => void = () => {};
  const requestId = `preview-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const settle = (value: string | undefined): void => {
    if (settled) {
      return;
    }
    settled = true;
    window.clearTimeout(timeout);
    window.removeEventListener('message', handleMessage);
    onSettled();
    resolvePromise(value);
  };

  const timeout = window.setTimeout(() => {
    settle(undefined);
  }, 5000);

  const handleMessage = (event: MessageEvent) => {
    const message = event.data as { type?: string; requestId?: string; url?: string };
    if (message.type !== 'preview:variantResolved' || message.requestId !== requestId) {
      return;
    }

    settle(message.url);
  };

  const promise = new Promise<string | undefined>((resolve) => {
    resolvePromise = resolve;
    window.addEventListener('message', handleMessage);
    try {
      vscode.postMessage({
        type: 'preview:resolveVariant',
        requestId,
        sourceId,
        role: engineRole,
        mediaType,
        ...(assetPath ? { assetPath } : {}),
        ...(documentResourceRef ? { documentResourceRef } : {}),
        ...(resourceRef ? { resourceRef } : {}),
      });
    } catch {
      settle(undefined);
    }
  });

  return {
    promise,
    dispose: () => settle(undefined),
  };
}
