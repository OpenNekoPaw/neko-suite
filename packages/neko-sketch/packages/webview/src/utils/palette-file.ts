export interface PaletteFile {
  readonly name: string;
  readonly colors: readonly string[];
}

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (!HEX_COLOR_RE.test(withHash)) return null;
  return withHash.toUpperCase();
}

export function parsePaletteFile(fileName: string, bytes: Uint8Array): PaletteFile | null {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.ase')) return parseAsePalette(fileName, bytes);
  if (lower.endsWith('.aco')) return parseAcoPalette(fileName, bytes);
  return parseTextPalette(fileName, new TextDecoder().decode(bytes));
}

export function encodeAsePalette(palette: PaletteFile): Uint8Array {
  const colors = palette.colors
    .map((color) => ({ color, rgb: hexToRgb(color) }))
    .filter(
      (entry): entry is { readonly color: string; readonly rgb: [number, number, number] } =>
        entry.rgb !== null,
    );

  const writer = new ByteWriter();
  writer.writeAscii('ASEF');
  writer.writeUint16(1);
  writer.writeUint16(0);
  writer.writeUint32(colors.length);

  for (const { color, rgb } of colors) {
    const block = new ByteWriter();
    block.writeUtf16BE(color);
    block.writeAscii('RGB ');
    block.writeFloat32(rgb[0]);
    block.writeFloat32(rgb[1]);
    block.writeFloat32(rgb[2]);
    block.writeUint16(0);

    const payload = block.toUint8Array();
    writer.writeUint16(0x0001);
    writer.writeUint32(payload.length);
    writer.writeBytes(payload);
  }

  return writer.toUint8Array();
}

function parseAsePalette(fileName: string, bytes: Uint8Array): PaletteFile | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (readAscii(view, 0, 4) !== 'ASEF') return null;

  const blockCount = view.getUint32(8, false);
  const colors: string[] = [];
  let offset = 12;

  for (let i = 0; i < blockCount && offset + 6 <= view.byteLength; i++) {
    const blockType = view.getUint16(offset, false);
    const blockLength = view.getUint32(offset + 2, false);
    offset += 6;
    const blockEnd = offset + blockLength;
    if (blockEnd > view.byteLength) return null;

    if (blockType === 0x0001) {
      const color = parseAseColorBlock(view, offset, blockEnd);
      if (color) colors.push(color);
    }
    offset = blockEnd;
  }

  return colors.length > 0 ? { name: baseName(fileName), colors: dedupeColors(colors) } : null;
}

function parseAseColorBlock(view: DataView, offset: number, blockEnd: number): string | null {
  if (offset + 2 > blockEnd) return null;
  const nameLength = view.getUint16(offset, false);
  offset += 2 + nameLength * 2;
  if (offset + 18 > blockEnd) return null;

  const model = readAscii(view, offset, 4);
  offset += 4;
  if (model !== 'RGB ') return null;

  const r = view.getFloat32(offset, false);
  const g = view.getFloat32(offset + 4, false);
  const b = view.getFloat32(offset + 8, false);
  return rgbToHex(r, g, b);
}

function parseAcoPalette(fileName: string, bytes: Uint8Array): PaletteFile | null {
  if (bytes.length < 4) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint16(0, false);
  if (version !== 1 && version !== 2) return null;

  const count = view.getUint16(2, false);
  const colors = parseAcoRecords(view, 4, count, version === 2);
  return colors.length > 0 ? { name: baseName(fileName), colors: dedupeColors(colors) } : null;
}

function parseAcoRecords(
  view: DataView,
  startOffset: number,
  count: number,
  withNames: boolean,
): string[] {
  const colors: string[] = [];
  let offset = startOffset;

  for (let i = 0; i < count && offset + 10 <= view.byteLength; i++) {
    const colorSpace = view.getUint16(offset, false);
    const c1 = view.getUint16(offset + 2, false);
    const c2 = view.getUint16(offset + 4, false);
    const c3 = view.getUint16(offset + 6, false);
    offset += 10;

    if (colorSpace === 0) {
      colors.push(rgbToHex(c1 / 65535, c2 / 65535, c3 / 65535));
    }

    if (withNames && offset + 4 <= view.byteLength) {
      const nameLength = view.getUint32(offset, false);
      offset += 4 + nameLength * 2;
    }
  }

  return colors;
}

function parseTextPalette(fileName: string, text: string): PaletteFile | null {
  const parsed = parseJsonPalette(text);
  if (parsed) return { name: parsed.name ?? baseName(fileName), colors: parsed.colors };

  const colors = dedupeColors(
    Array.from(text.matchAll(/#[0-9a-fA-F]{6}|(?<![0-9a-fA-F])[0-9a-fA-F]{6}(?![0-9a-fA-F])/g))
      .map((match) => normalizeHexColor(match[0]))
      .filter((color): color is string => color !== null),
  );
  return colors.length > 0 ? { name: baseName(fileName), colors } : null;
}

function parseJsonPalette(text: string): { name?: string; colors: string[] } | null {
  try {
    const data: unknown = JSON.parse(text);
    if (Array.isArray(data)) {
      const colors = data
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeHexColor)
        .filter((color): color is string => color !== null);
      return colors.length > 0 ? { colors: dedupeColors(colors) } : null;
    }
    if (isObject(data) && typeof data.name === 'string' && Array.isArray(data.colors)) {
      const colors = data.colors
        .filter((item): item is string => typeof item === 'string')
        .map(normalizeHexColor)
        .filter((color): color is string => color !== null);
      return colors.length > 0 ? { name: data.name, colors: dedupeColors(colors) } : null;
    }
  } catch {
    return null;
  }
  return null;
}

function isObject(value: unknown): value is { readonly name?: unknown; readonly colors?: unknown } {
  return typeof value === 'object' && value !== null;
}

function dedupeColors(colors: readonly string[]): string[] {
  return [...new Set(colors)];
}

function baseName(fileName: string): string {
  return fileName.replace(/\.[^.]+$/, '') || 'Palette';
}

function hexToRgb(hex: string): [number, number, number] | null {
  const normalized = normalizeHexColor(hex);
  if (!normalized) return null;
  return [
    Number.parseInt(normalized.slice(1, 3), 16) / 255,
    Number.parseInt(normalized.slice(3, 5), 16) / 255,
    Number.parseInt(normalized.slice(5, 7), 16) / 255,
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

function readAscii(view: DataView, offset: number, length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += String.fromCharCode(view.getUint8(offset + i));
  }
  return result;
}

class ByteWriter {
  private readonly bytes: number[] = [];

  writeUint16(value: number): void {
    this.bytes.push((value >>> 8) & 0xff, value & 0xff);
  }

  writeUint32(value: number): void {
    this.bytes.push(
      (value >>> 24) & 0xff,
      (value >>> 16) & 0xff,
      (value >>> 8) & 0xff,
      value & 0xff,
    );
  }

  writeFloat32(value: number): void {
    const buffer = new ArrayBuffer(4);
    new DataView(buffer).setFloat32(0, value, false);
    this.writeBytes(new Uint8Array(buffer));
  }

  writeAscii(value: string): void {
    for (let i = 0; i < value.length; i++) {
      this.bytes.push(value.charCodeAt(i) & 0xff);
    }
  }

  writeUtf16BE(value: string): void {
    this.writeUint16(value.length + 1);
    for (let i = 0; i < value.length; i++) {
      this.writeUint16(value.charCodeAt(i));
    }
    this.writeUint16(0);
  }

  writeBytes(value: Uint8Array): void {
    for (const byte of value) {
      this.bytes.push(byte);
    }
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.bytes);
  }
}
