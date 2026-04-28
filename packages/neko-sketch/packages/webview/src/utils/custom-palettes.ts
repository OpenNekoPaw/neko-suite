import { normalizeHexColor, type PaletteFile } from './palette-file';

export interface PaletteDef extends PaletteFile {
  readonly id: string;
  readonly builtin?: boolean;
}

interface StoredPalette {
  readonly id: string;
  readonly name: string;
  readonly colors: readonly string[];
}

export const CUSTOM_PALETTES_CHANGED_EVENT = 'neko-sketch.customPalettesChanged';

const CUSTOM_PALETTE_STORAGE_KEY = 'neko-sketch.customPalettes.v1';

export function loadCustomPalettes(): readonly PaletteDef[] {
  try {
    const raw = window.localStorage.getItem(CUSTOM_PALETTE_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredPalette).map((palette) => ({
      id: palette.id,
      name: palette.name,
      colors: dedupeColors(palette.colors),
    }));
  } catch {
    return [];
  }
}

export function saveCustomPalettes(palettes: readonly PaletteDef[]): void {
  try {
    const stored: readonly StoredPalette[] = palettes.map((palette) => ({
      id: palette.id,
      name: palette.name,
      colors: palette.colors,
    }));
    window.localStorage.setItem(CUSTOM_PALETTE_STORAGE_KEY, JSON.stringify(stored));
    window.dispatchEvent(new CustomEvent(CUSTOM_PALETTES_CHANGED_EVENT));
  } catch {
    // Palette persistence is best-effort; the in-memory palette remains usable.
  }
}

export function addCustomPalette(name: string, colors: readonly string[]): PaletteDef | null {
  const normalized = dedupeColors(colors);
  if (normalized.length === 0) {
    return null;
  }
  const current = loadCustomPalettes();
  const palette: PaletteDef = {
    id: createCustomPaletteId(),
    name: makeUniquePaletteName(current, name),
    colors: normalized,
  };
  saveCustomPalettes([...current, palette]);
  return palette;
}

export function createCustomPaletteId(): string {
  return `custom-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function makeUniquePaletteName(palettes: readonly PaletteDef[], baseName: string): string {
  const names = new Set(palettes.map((palette) => palette.name));
  if (!names.has(baseName)) return baseName;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${baseName} ${i}`;
    if (!names.has(candidate)) return candidate;
  }
  return `${baseName} ${Date.now()}`;
}

export function dedupeColors(colors: readonly string[]): readonly string[] {
  return [
    ...new Set(
      colors
        .map((color) => normalizeHexColor(color))
        .filter((color): color is string => color !== null),
    ),
  ];
}

function isStoredPalette(value: unknown): value is StoredPalette {
  return (
    typeof value === 'object' &&
    value !== null &&
    'id' in value &&
    'name' in value &&
    'colors' in value &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    Array.isArray(value.colors) &&
    value.colors.every((color) => typeof color === 'string' && normalizeHexColor(color) !== null)
  );
}
