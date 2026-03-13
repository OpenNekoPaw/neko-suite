/**
 * Asset Export Utilities
 *
 * Exports sketch data as assets via postMessage to the Extension Host.
 */

export type AssetExportType = 'spritesheet' | 'particle-config' | 'scene' | 'palette' | 'svg';

export interface AssetExportPayload {
  readonly type: AssetExportType;
  readonly name: string;
  readonly data: string;
  readonly format: string;
  readonly metadata: Record<string, unknown>;
}

/**
 * Send an asset export request to the Extension Host via postMessage.
 */
export function requestAssetExport(
  vscode: { postMessage: (msg: unknown) => void },
  payload: AssetExportPayload,
): void {
  vscode.postMessage({
    type: 'file:export',
    data: {
      format: payload.format,
      data: payload.data,
      assetType: payload.type,
      name: payload.name,
      metadata: payload.metadata,
    },
  });
}

/**
 * Convert a Blob to a base64 data URL.
 */
export async function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
