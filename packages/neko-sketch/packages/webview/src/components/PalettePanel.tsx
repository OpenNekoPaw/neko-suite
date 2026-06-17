/**
 * PalettePanel - color palette management for pixel art
 *
 * Built-in and custom palettes with color selection.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Button, Select } from '@neko/ui/primitives';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';
import { encodeAsePalette, normalizeHexColor, parsePaletteFile } from '../utils/palette-file';
import {
  CUSTOM_PALETTES_CHANGED_EVENT,
  createCustomPaletteId,
  dedupeColors,
  loadCustomPalettes,
  makeUniquePaletteName,
  saveCustomPalettes,
  type PaletteDef,
} from '../utils/custom-palettes';

const BUILTIN_PALETTES: readonly PaletteDef[] = [
  {
    id: 'pico-8',
    name: 'PICO-8',
    builtin: true,
    colors: [
      '#000000',
      '#1D2B53',
      '#7E2553',
      '#008751',
      '#AB5236',
      '#5F574F',
      '#C2C3C7',
      '#FFF1E8',
      '#FF004D',
      '#FFA300',
      '#FFEC27',
      '#00E436',
      '#29ADFF',
      '#83769C',
      '#FF77A8',
      '#FFCCAA',
    ],
  },
  {
    id: 'db32',
    name: 'DB32',
    builtin: true,
    colors: [
      '#000000',
      '#222034',
      '#45283C',
      '#663931',
      '#8F563B',
      '#DF7126',
      '#D9A066',
      '#EEC39A',
      '#FBF236',
      '#99E550',
      '#6ABE30',
      '#37946E',
      '#4B692F',
      '#524B24',
      '#323C39',
      '#3F3F74',
      '#306082',
      '#5B6EE1',
      '#639BFF',
      '#5FCDE4',
      '#CBDBFC',
      '#FFFFFF',
      '#9BADB7',
      '#847E87',
      '#696A6A',
      '#595652',
      '#76428A',
      '#AC3232',
      '#D95763',
      '#D77BBA',
      '#8F974A',
      '#8A6F30',
    ],
  },
  {
    id: 'endesga-32',
    name: 'Endesga 32',
    builtin: true,
    colors: [
      '#BE4A2F',
      '#D77643',
      '#EAD4AA',
      '#E4A672',
      '#B86F50',
      '#733E39',
      '#3E2731',
      '#A22633',
      '#E43B44',
      '#F77622',
      '#FEAE34',
      '#FEE761',
      '#63C74D',
      '#3E8948',
      '#265C42',
      '#193C3E',
      '#124E89',
      '#0099DB',
      '#2CE8F5',
      '#FFFFFF',
      '#C0CBDC',
      '#8B9BB4',
      '#5A6988',
      '#3A4466',
      '#262B44',
      '#181425',
      '#FF0044',
      '#68386C',
      '#B55088',
      '#F6757A',
      '#E8B796',
      '#C28569',
    ],
  },
];

export function PalettePanel() {
  const { t } = useTranslation();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const [customPalettes, setCustomPalettes] = useState<readonly PaletteDef[]>(loadCustomPalettes);
  const [selectedPaletteId, setSelectedPaletteId] = useState(BUILTIN_PALETTES[0]?.id ?? '');
  const [importError, setImportError] = useState<string | null>(null);
  const setBrushColor = useSketchStore((s) => s.setBrushColor);
  const brushColor = useSketchStore((s) => s.brushSettings.color);

  const palettes = useMemo(() => [...BUILTIN_PALETTES, ...customPalettes], [customPalettes]);
  const palette = palettes.find((item) => item.id === selectedPaletteId) ?? BUILTIN_PALETTES[0];
  const paletteOptions = useMemo(
    () => palettes.map((item) => ({ value: item.id, label: item.name })),
    [palettes],
  );
  const selectedBrushColor = normalizeHexColor(brushColor);

  useEffect(() => {
    const handleCustomPalettesChanged = () => setCustomPalettes(loadCustomPalettes());
    window.addEventListener(CUSTOM_PALETTES_CHANGED_EVENT, handleCustomPalettesChanged);
    return () =>
      window.removeEventListener(CUSTOM_PALETTES_CHANGED_EVENT, handleCustomPalettesChanged);
  }, []);

  const persistCustomPalettes = useCallback((next: readonly PaletteDef[]) => {
    setCustomPalettes(next);
    saveCustomPalettes(next);
  }, []);

  const handleColorClick = useCallback(
    (color: string) => {
      setBrushColor(color);
    },
    [setBrushColor],
  );

  const handleNewPalette = useCallback(() => {
    const color = normalizeHexColor(brushColor) ?? '#000000';
    const paletteName = makeUniquePaletteName(customPalettes, t('sketch.palette.customName'));
    const nextPalette: PaletteDef = {
      id: createCustomPaletteId(),
      name: paletteName,
      colors: [color],
    };
    persistCustomPalettes([...customPalettes, nextPalette]);
    setSelectedPaletteId(nextPalette.id);
  }, [brushColor, customPalettes, persistCustomPalettes, t]);

  const handleAddBrushColor = useCallback(() => {
    const color = normalizeHexColor(brushColor);
    if (!color || !palette) return;

    if (palette.builtin) {
      const nextPalette: PaletteDef = {
        id: createCustomPaletteId(),
        name: makeUniquePaletteName(customPalettes, `${palette.name} Custom`),
        colors: dedupeColors([...palette.colors, color]),
      };
      persistCustomPalettes([...customPalettes, nextPalette]);
      setSelectedPaletteId(nextPalette.id);
      return;
    }

    const next = customPalettes.map((item) =>
      item.id === palette.id ? { ...item, colors: dedupeColors([...item.colors, color]) } : item,
    );
    persistCustomPalettes(next);
  }, [brushColor, customPalettes, palette, persistCustomPalettes]);

  const handleImportPalette = useCallback(
    async (file: File) => {
      setImportError(null);
      const bytes = new Uint8Array(await file.arrayBuffer());
      const parsed = parsePaletteFile(file.name, bytes);
      if (!parsed) {
        setImportError(t('sketch.palette.importFailed'));
        return;
      }

      const nextPalette: PaletteDef = {
        id: createCustomPaletteId(),
        name: makeUniquePaletteName(customPalettes, parsed.name),
        colors: parsed.colors,
      };
      persistCustomPalettes([...customPalettes, nextPalette]);
      setSelectedPaletteId(nextPalette.id);
    },
    [customPalettes, persistCustomPalettes, t],
  );

  const handleExportPalette = useCallback(() => {
    if (!palette) return;
    const bytes = encodeAsePalette(palette);
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    const blob = new Blob([buffer], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${sanitizeFileName(palette.name)}.ase`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [palette]);

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.palette')}>
      <div className="flex items-center gap-1 mb-1">
        <h3 className="sketch-panel-title m-0 flex-1">{t('sketch.panel.palette')}</h3>
        <Select
          className="h-6 min-w-24 text-[11px]"
          label={t('sketch.palette.select')}
          options={paletteOptions}
          value={palette?.id ?? ''}
          onValueChange={setSelectedPaletteId}
        />
      </div>

      <div className="flex flex-wrap gap-1 mb-1">
        <Button size="xs" variant="secondary" onClick={handleNewPalette}>
          {t('sketch.palette.new')}
        </Button>
        <Button size="xs" variant="secondary" onClick={handleAddBrushColor}>
          {t('sketch.palette.addColor')}
        </Button>
        <Button size="xs" variant="secondary" onClick={() => importInputRef.current?.click()}>
          {t('sketch.palette.import')}
        </Button>
        <Button size="xs" variant="secondary" onClick={handleExportPalette}>
          {t('sketch.palette.export')}
        </Button>
        <input
          ref={importInputRef}
          type="file"
          accept=".ase,.aco,.json,.txt"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void handleImportPalette(file);
          }}
        />
      </div>

      {importError && (
        <p className="text-[10px] text-red-400 m-0 mb-1" role="alert">
          {importError}
        </p>
      )}

      {palette && (
        <div className="grid grid-cols-8 gap-0.5" role="listbox" aria-label={palette.name}>
          {palette.colors.map((color, i) => {
            const normalizedColor = normalizeHexColor(color);
            const isSelected =
              normalizedColor !== null &&
              selectedBrushColor !== null &&
              normalizedColor === selectedBrushColor;

            return (
              <button
                key={`${color}-${i}`}
                role="option"
                aria-selected={isSelected}
                aria-label={t('sketch.color.colorLabel', { color })}
                className={`sketch-palette-swatch${isSelected ? ' selected' : ''}`}
                style={{ backgroundColor: color }}
                onClick={() => handleColorClick(color)}
                title={color}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function sanitizeFileName(name: string): string {
  return (
    name
      .trim()
      .replace(/[^a-z0-9-_]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'palette'
  );
}
