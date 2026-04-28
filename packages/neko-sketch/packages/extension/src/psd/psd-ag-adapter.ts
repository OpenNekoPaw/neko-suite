import { isPsdGroupPassThroughBlendMode, mapPsdBlendMode } from '@neko/shared';
import type {
  PsdDocumentTreeWire,
  PsdImportIssue,
  PsdImportIssueCode,
  PsdImportPayloadWire,
  PsdLayerNodeWire,
} from '@neko/shared';
import { encodeRgbaPng } from './pngEncoder';
import { DEFAULT_PSD_IMPORT_LIMITS, enforcePsdImportLimits } from './psd-import-limits';

type UnknownRecord = Record<string, unknown>;

const AG_PSD_COLOR_MODE_RGB = 3;
const AG_PSD_COLOR_MODE_NAMES: Readonly<Record<number, string>> = {
  0: 'Bitmap',
  1: 'Grayscale',
  2: 'Indexed',
  3: 'RGB',
  4: 'CMYK',
  7: 'Multichannel',
  8: 'Duotone',
  9: 'Lab',
};

const AG_PSD_ADJUSTMENT_TYPE_LABELS: Readonly<Record<string, string>> = {
  'brightness/contrast': 'brightness/contrast',
  levels: 'levels',
  curves: 'curves',
  exposure: 'exposure',
  vibrance: 'vibrance',
  'hue/saturation': 'hue/saturation',
  'color balance': 'color balance',
  'black & white': 'black & white',
  'photo filter': 'photo filter',
  'channel mixer': 'channel mixer',
  'color lookup': 'color lookup',
  invert: 'invert',
  posterize: 'posterize',
  threshold: 'threshold',
  'gradient map': 'gradient map',
  'selective color': 'selective color',
};

export type PsdParserFailureCode = Extract<
  PsdImportIssueCode,
  'parser-unavailable' | 'parse-failed'
>;

export class PsdImportError extends Error {
  readonly code: PsdParserFailureCode;

  constructor(code: PsdParserFailureCode, message: string) {
    super(message);
    this.name = 'PsdImportError';
    this.code = code;
  }
}

export async function parsePsdToWire(
  name: string,
  bytes: Uint8Array,
): Promise<PsdImportPayloadWire> {
  const readPsd = await loadReadPsd();
  let parsed: unknown;
  try {
    parsed = await Promise.resolve(
      readPsd(bytesToArrayBuffer(bytes), {
        useImageData: true,
        skipCompositeImageData: true,
        skipThumbnail: true,
        logMissingFeatures: true,
      }),
    );
  } catch (error) {
    throw new PsdImportError('parse-failed', `PSD parse failed: ${describeError(error)}`);
  }

  const psd = asRecord(parsed);
  const issues: PsdImportIssue[] = [];
  const canvasWidth = readPositiveInteger(psd, 'width') ?? 1;
  const canvasHeight = readPositiveInteger(psd, 'height') ?? 1;
  collectDocumentIssues(psd, issues);

  const children = readRecordArray(psd, 'children');
  const tree: PsdDocumentTreeWire = {
    canvas: {
      width: canvasWidth,
      height: canvasHeight,
      dpi: readPositiveInteger(psd, 'resolution') ?? 72,
      backgroundColor: '#ffffff',
    },
    layers: children.map((layer, index) => mapLayer(layer, [`${name}:${index + 1}`], issues)),
  };

  const limited = enforcePsdImportLimits(tree, DEFAULT_PSD_IMPORT_LIMITS);
  return {
    name,
    tree: limited.tree,
    issues: [...issues, ...limited.issues],
  };
}

async function loadReadPsd(): Promise<(buffer: ArrayBuffer, options: UnknownRecord) => unknown> {
  let mod: unknown;
  try {
    mod = await import('ag-psd');
  } catch (error) {
    throw new PsdImportError(
      'parser-unavailable',
      `PSD parser is unavailable. Install ag-psd to enable PSD import. ${String(error)}`,
    );
  }

  initializeAgPsdCanvasBridge(asRecord(mod));
  const readPsd = asRecord(mod)['readPsd'];
  if (typeof readPsd !== 'function') {
    throw new PsdImportError('parser-unavailable', 'PSD parser module does not export readPsd');
  }
  return readPsd as (buffer: ArrayBuffer, options: UnknownRecord) => unknown;
}

function initializeAgPsdCanvasBridge(mod: UnknownRecord): void {
  const initializeCanvas = mod['initializeCanvas'];
  if (typeof initializeCanvas !== 'function') {
    return;
  }

  initializeCanvas(
    () => {
      throw new Error('Canvas output is not available in the VSCode Extension Host');
    },
    () => {
      throw new Error('Canvas output is not available in the VSCode Extension Host');
    },
    (width: number, height: number) => ({
      width,
      height,
      data: new Uint8ClampedArray(width * height * 4),
    }),
  );
}

function mapLayer(
  layer: UnknownRecord,
  fallbackPath: readonly string[],
  issues: PsdImportIssue[],
): PsdLayerNodeWire {
  const name = readString(layer, 'name') ?? fallbackPath[fallbackPath.length - 1] ?? 'Layer';
  const layerPath = [...fallbackPath.slice(0, -1), name];
  const children = readRecordArray(layer, 'children');
  const left = readInteger(layer, 'left') ?? 0;
  const top = readInteger(layer, 'top') ?? 0;
  const right = readInteger(layer, 'right');
  const bottom = readInteger(layer, 'bottom');
  const imageData = asOptionalRecord(layer['imageData']);
  const imageWidth = imageData ? readPositiveInteger(imageData, 'width') : undefined;
  const imageHeight = imageData ? readPositiveInteger(imageData, 'height') : undefined;
  const width = Math.max(1, imageWidth ?? (right !== undefined ? right - left : 1));
  const height = Math.max(1, imageHeight ?? (bottom !== undefined ? bottom - top : 1));
  const isGroup = children.length > 0 || isPsdGroupLayer(layer);
  const blendMode = readString(layer, 'blendMode') ?? (isGroup ? 'pass through' : 'norm');

  collectLayerIssues(layer, layerPath, issues);
  collectBlendModeIssues(blendMode, isGroup, layerPath, issues);

  if (isGroup) {
    return {
      id: readString(layer, 'id'),
      name,
      kind: 'group',
      visible: !readBoolean(layer, 'hidden'),
      opacity: readOpacity(layer),
      blendMode,
      clippingMask: readBoolean(layer, 'clipping'),
      left,
      top,
      width,
      height,
      children: children.map((child, index) =>
        mapLayer(child, [...layerPath, String(index + 1)], issues),
      ),
    };
  }

  const pixels = encodeLayerPixels(imageData, width, height, name, layerPath, issues);
  return {
    id: readString(layer, 'id'),
    name,
    kind: 'raster',
    visible: !readBoolean(layer, 'hidden'),
    opacity: readOpacity(layer),
    blendMode,
    clippingMask: readBoolean(layer, 'clipping'),
    left,
    top,
    width,
    height,
    pixels,
  };
}

function isPsdGroupLayer(layer: UnknownRecord): boolean {
  const sectionDivider = asOptionalRecord(layer['sectionDivider']);
  const sectionDividerType = sectionDivider ? readInteger(sectionDivider, 'type') : undefined;
  return sectionDividerType === 1 || sectionDividerType === 2;
}

function collectBlendModeIssues(
  blendMode: string,
  isGroup: boolean,
  layerPath: readonly string[],
  issues: PsdImportIssue[],
): void {
  if (isGroup) {
    if (isPsdGroupPassThroughBlendMode(blendMode)) {
      issues.push({
        code: 'group-isolation-mismatch',
        severity: 'warning',
        message:
          'PSD pass-through group blending is not supported; the group was imported with normal isolation.',
        layerPath,
      });
    }
    return;
  }

  const mapping = mapPsdBlendMode(blendMode, layerPath);
  if (mapping.issue) {
    issues.push(mapping.issue);
  }
}

function encodeLayerPixels(
  imageData: UnknownRecord | undefined,
  width: number,
  height: number,
  name: string,
  layerPath: readonly string[],
  issues: PsdImportIssue[],
): PsdLayerNodeWire['pixels'] {
  const data = imageData ? readByteView(imageData, 'data') : undefined;
  if (!data) {
    issues.push({
      code: 'missing-pixel-data',
      severity: 'warning',
      message: `PSD layer "${name}" has no imageData and was imported without pixels.`,
      layerPath,
    });
    return undefined;
  }

  try {
    return {
      kind: 'encoded',
      dataBase64: Buffer.from(encodeRgbaPng(width, height, data)).toString('base64'),
      mimeType: 'image/png',
    };
  } catch (error) {
    issues.push({
      code: 'missing-pixel-data',
      severity: 'warning',
      message: `PSD layer "${name}" pixel data could not be encoded: ${String(error)}`,
      layerPath,
    });
    return undefined;
  }
}

function collectDocumentIssues(psd: UnknownRecord, issues: PsdImportIssue[]): void {
  const bitsPerChannel = readPositiveInteger(psd, 'bitsPerChannel');
  if (bitsPerChannel !== undefined && bitsPerChannel !== 8) {
    issues.push({
      code: 'unsupported-color-mode',
      severity: 'warning',
      message: `PSD bit depth ${bitsPerChannel} was converted to 8-bit RGBA for import.`,
    });
  }
  const colorMode = readInteger(psd, 'colorMode');
  if (colorMode !== undefined && colorMode !== AG_PSD_COLOR_MODE_RGB) {
    issues.push({
      code: 'unsupported-color-mode',
      severity: 'warning',
      message: `PSD color mode ${describeColorMode(colorMode)} was converted to RGBA for import.`,
    });
  }
  const colorModeText = readString(psd, 'colorMode');
  if (colorModeText && colorModeText.toLowerCase() !== 'rgb') {
    issues.push({
      code: 'unsupported-color-mode',
      severity: 'warning',
      message: `PSD color mode "${colorModeText}" was converted to RGBA for import.`,
    });
  }
}

function collectLayerIssues(
  layer: UnknownRecord,
  layerPath: readonly string[],
  issues: PsdImportIssue[],
): void {
  if (layer['text'] !== undefined) {
    pushUnsupportedLayerIssue('PSD text layer was rasterized during import.', layerPath, issues);
  }
  if (layer['smartObject'] !== undefined || layer['placedLayer'] !== undefined) {
    pushUnsupportedLayerIssue('PSD smart object was rasterized during import.', layerPath, issues);
  }
  if (layer['mask'] !== undefined || layer['vectorMask'] !== undefined) {
    issues.push({
      code: 'mask-not-imported',
      severity: 'warning',
      message: 'PSD layer mask was not imported.',
      layerPath,
    });
  }
  if (layer['effects'] !== undefined) {
    pushUnsupportedLayerIssue(
      'PSD layer effects were rasterized or dropped during import.',
      layerPath,
      issues,
    );
  }
  const adjustmentLabel = describeAdjustmentLayer(layer);
  if (adjustmentLabel) {
    pushUnsupportedLayerIssue(
      `PSD adjustment layer semantics (${adjustmentLabel}) were rasterized or dropped during import.`,
      layerPath,
      issues,
    );
  }
  if (layer['vectorFill'] !== undefined || layer['vectorStroke'] !== undefined) {
    pushUnsupportedLayerIssue(
      'PSD vector fill or stroke semantics were rasterized or dropped during import.',
      layerPath,
      issues,
    );
  }
}

function describeAdjustmentLayer(layer: UnknownRecord): string | undefined {
  const adjustment = asOptionalRecord(layer['adjustment']);
  if (!adjustment) {
    return undefined;
  }

  const type = readString(adjustment, 'type');
  if (!type) {
    return 'unknown adjustment';
  }

  return AG_PSD_ADJUSTMENT_TYPE_LABELS[type] ?? type;
}

function pushUnsupportedLayerIssue(
  message: string,
  layerPath: readonly string[],
  issues: PsdImportIssue[],
): void {
  issues.push({
    code: 'unsupported-layer-kind',
    severity: 'warning',
    message,
    layerPath,
  });
}

function bytesToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): UnknownRecord {
  return value && typeof value === 'object' ? (value as UnknownRecord) : {};
}

function asOptionalRecord(value: unknown): UnknownRecord | undefined {
  return value && typeof value === 'object' ? (value as UnknownRecord) : undefined;
}

function readRecordArray(record: UnknownRecord, key: string): UnknownRecord[] {
  const value = record[key];
  if (!Array.isArray(value)) return [];
  return value.map(asRecord);
}

function readString(record: UnknownRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function readBoolean(record: UnknownRecord, key: string): boolean {
  return record[key] === true;
}

function readInteger(record: UnknownRecord, key: string): number | undefined {
  const value = record[key];
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : undefined;
}

function readPositiveInteger(record: UnknownRecord, key: string): number | undefined {
  const value = readInteger(record, key);
  return value !== undefined && value > 0 ? value : undefined;
}

function describeColorMode(colorMode: number): string {
  const name = AG_PSD_COLOR_MODE_NAMES[colorMode];
  return name ? `${name} (${colorMode})` : `Unknown (${colorMode})`;
}

function readOpacity(record: UnknownRecord): number {
  const opacity = record['opacity'];
  if (typeof opacity !== 'number' || !Number.isFinite(opacity)) return 1;
  const normalized = opacity > 1 ? opacity / 255 : opacity;
  return Math.max(0, Math.min(1, normalized));
}

function readByteView(record: UnknownRecord, key: string): Uint8Array | undefined {
  const value = record[key];
  if (!ArrayBuffer.isView(value)) return undefined;
  return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
}
