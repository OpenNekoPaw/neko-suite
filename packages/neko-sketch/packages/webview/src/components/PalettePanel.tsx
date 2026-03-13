/**
 * PalettePanel - color palette management for pixel art
 *
 * Built-in palettes (PICO-8, DB32, Endesga 64) with color selection.
 */
import { useState, useCallback } from 'react';
import { useSketchStore } from '../stores';
import { useTranslation } from '../i18n/I18nContext';

interface PaletteDef {
  readonly name: string;
  readonly colors: readonly string[];
}

const BUILTIN_PALETTES: readonly PaletteDef[] = [
  {
    name: 'PICO-8',
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
    name: 'DB32',
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
    name: 'Endesga 32',
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
  const [selectedPalette, setSelectedPalette] = useState(0);
  const setBrushColor = useSketchStore((s) => s.setBrushColor);

  const palette = BUILTIN_PALETTES[selectedPalette];

  const handleColorClick = useCallback(
    (color: string) => {
      setBrushColor(color);
    },
    [setBrushColor],
  );

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.palette')}>
      <div className="flex items-center gap-1 mb-1">
        <h3 className="sketch-panel-title m-0 flex-1">{t('sketch.panel.palette')}</h3>
        <select
          className="text-xs bg-transparent border border-[var(--vscode-input-border)] rounded px-1 py-0.5"
          value={selectedPalette}
          onChange={(e) => setSelectedPalette(parseInt(e.target.value, 10))}
          aria-label={t('sketch.palette.select')}
        >
          {BUILTIN_PALETTES.map((p, i) => (
            <option key={p.name} value={i}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {palette && (
        <div className="grid grid-cols-8 gap-0.5" role="listbox" aria-label={palette.name}>
          {palette.colors.map((color, i) => (
            <button
              key={`${color}-${i}`}
              role="option"
              aria-selected={false}
              aria-label={color}
              className="w-5 h-5 rounded border border-[var(--vscode-input-border)] cursor-pointer hover:ring-1 hover:ring-[var(--vscode-focusBorder)]"
              style={{ backgroundColor: color }}
              onClick={() => handleColorClick(color)}
              title={color}
            />
          ))}
        </div>
      )}
    </div>
  );
}
