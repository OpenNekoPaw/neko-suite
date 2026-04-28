import { useEffect, useMemo, useState } from 'react';
import type {
  SketchAIAutoLayerTarget,
  SketchAIOperationParams,
  SketchAIOperationType,
  SketchAIStylePreset,
} from '../ai/ai-progress-types';
import { useTranslation } from '../i18n/I18nContext';

interface AIPanelProps {
  readonly operationAvailability: Partial<Record<SketchAIOperationType, boolean>>;
  readonly onOpenAgent: (
    operation: SketchAIOperationType,
    prompt: string,
    params: SketchAIOperationParams,
  ) => void;
}

const AI_OPERATIONS: ReadonlyArray<{
  readonly value: SketchAIOperationType;
  readonly labelKey: string;
}> = [
  { value: 'generate', labelKey: 'sketch.ai.operation.generate' },
  { value: 'smart-selection', labelKey: 'sketch.ai.operation.smartSelection' },
  { value: 'inpaint', labelKey: 'sketch.ai.operation.inpaint' },
  { value: 'style-transfer', labelKey: 'sketch.ai.operation.styleTransfer' },
  { value: 'upscale', labelKey: 'sketch.ai.operation.upscale' },
  { value: 'lineart-colorize', labelKey: 'sketch.ai.operation.lineartColorize' },
  { value: 'auto-layer', labelKey: 'sketch.ai.operation.autoLayer' },
];

const STYLE_PRESETS: ReadonlyArray<{
  readonly value: SketchAIStylePreset;
  readonly labelKey: string;
}> = [
  { value: 'anime', labelKey: 'sketch.ai.style.anime' },
  { value: 'oil-painting', labelKey: 'sketch.ai.style.oilPainting' },
  { value: 'watercolor', labelKey: 'sketch.ai.style.watercolor' },
  { value: 'pixel-art', labelKey: 'sketch.ai.style.pixelArt' },
  { value: 'sketch', labelKey: 'sketch.ai.style.sketch' },
  { value: 'comic', labelKey: 'sketch.ai.style.comic' },
  { value: 'ghibli', labelKey: 'sketch.ai.style.ghibli' },
];

const AUTO_LAYER_TARGETS: ReadonlyArray<{
  readonly value: SketchAIAutoLayerTarget;
  readonly labelKey: string;
}> = [
  { value: 'lineart', labelKey: 'sketch.ai.autoLayer.lineart' },
  { value: 'flatcolor', labelKey: 'sketch.ai.autoLayer.flatcolor' },
  { value: 'shadow', labelKey: 'sketch.ai.autoLayer.shadow' },
  { value: 'highlight', labelKey: 'sketch.ai.autoLayer.highlight' },
];

function supportsScope(operation: SketchAIOperationType): boolean {
  return (
    operation === 'smart-selection' ||
    operation === 'style-transfer' ||
    operation === 'upscale' ||
    operation === 'lineart-colorize'
  );
}

function supportsNegativePrompt(operation: SketchAIOperationType): boolean {
  return operation === 'smart-selection' || operation === 'inpaint';
}

function supportsStrength(operation: SketchAIOperationType): boolean {
  return operation === 'inpaint' || operation === 'style-transfer';
}

function supportsLayerName(operation: SketchAIOperationType): boolean {
  return (
    operation === 'generate' ||
    operation === 'inpaint' ||
    operation === 'style-transfer' ||
    operation === 'upscale' ||
    operation === 'lineart-colorize'
  );
}

export function AIPanel({ operationAvailability, onOpenAgent }: AIPanelProps): JSX.Element | null {
  const { t } = useTranslation();
  const [operation, setOperation] = useState<SketchAIOperationType>('generate');
  const [prompt, setPrompt] = useState('');
  const [scope, setScope] = useState<'canvas' | 'layer'>('canvas');
  const [negativePrompt, setNegativePrompt] = useState('');
  const [strength, setStrength] = useState(0.8);
  const [scale, setScale] = useState<2 | 4>(2);
  const [style, setStyle] = useState<SketchAIStylePreset>('anime');
  const [layerName, setLayerName] = useState('');
  const [paletteText, setPaletteText] = useState('');
  const [autoLayerTargets, setAutoLayerTargets] = useState<readonly SketchAIAutoLayerTarget[]>([
    'lineart',
    'flatcolor',
    'shadow',
    'highlight',
  ]);
  const availableOperations = useMemo(
    () => AI_OPERATIONS.filter((item) => operationAvailability[item.value] !== false),
    [operationAvailability],
  );

  useEffect(() => {
    if (availableOperations.length === 0) {
      return;
    }
    if (!availableOperations.some((item) => item.value === operation)) {
      setOperation(availableOperations[0]!.value);
    }
  }, [availableOperations, operation]);

  if (availableOperations.length === 0) {
    return null;
  }

  const params = buildParams({
    operation,
    scope,
    negativePrompt,
    strength,
    scale,
    style,
    layerName,
    paletteText,
    autoLayerTargets,
  });

  return (
    <div className="sketch-panel" role="region" aria-label={t('sketch.panel.ai')}>
      <div className="space-y-2">
        <label className="block text-xs text-[var(--vscode-descriptionForeground)]">
          <span className="mb-1 block">{t('sketch.ai.operation')}</span>
          <select
            className="w-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)]"
            style={{ borderRadius: 4 }}
            value={operation}
            onChange={(event) => {
              const next = event.target.value as SketchAIOperationType;
              setOperation(next);
              if (next === 'lineart-colorize') {
                setScope('layer');
              } else if (next !== 'inpaint') {
                setScope('canvas');
              }
            }}
            aria-label={t('sketch.ai.operation')}
          >
            {availableOperations.map((item) => (
              <option key={item.value} value={item.value}>
                {t(item.labelKey)}
              </option>
            ))}
          </select>
        </label>

        <textarea
          className="min-h-20 w-full resize-y border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
          style={{ borderRadius: 4 }}
          value={prompt}
          onChange={(event) => setPrompt(event.target.value)}
          placeholder={t('sketch.ai.promptPlaceholder')}
          aria-label={t('sketch.ai.prompt')}
        />

        {supportsScope(operation) && (
          <label className="block text-xs text-[var(--vscode-descriptionForeground)]">
            <span className="mb-1 block">{t('sketch.ai.scope')}</span>
            <select
              className="w-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)]"
              style={{ borderRadius: 4 }}
              value={scope}
              onChange={(event) => setScope(event.target.value as 'canvas' | 'layer')}
              aria-label={t('sketch.ai.scope')}
            >
              <option value="canvas">{t('sketch.ai.scope.canvas')}</option>
              <option value="layer">{t('sketch.ai.scope.layer')}</option>
            </select>
          </label>
        )}

        {supportsNegativePrompt(operation) && (
          <label className="block text-xs text-[var(--vscode-descriptionForeground)]">
            <span className="mb-1 block">{t('sketch.ai.negativePrompt')}</span>
            <input
              className="w-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
              style={{ borderRadius: 4 }}
              value={negativePrompt}
              onChange={(event) => setNegativePrompt(event.target.value)}
              aria-label={t('sketch.ai.negativePrompt')}
            />
          </label>
        )}

        {supportsStrength(operation) && (
          <label className="block text-xs text-[var(--vscode-descriptionForeground)]">
            <span className="mb-1 block">
              {t('sketch.ai.strength')}: {strength.toFixed(2)}
            </span>
            <input
              className="w-full"
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={strength}
              onChange={(event) => setStrength(Number(event.target.value))}
              aria-label={t('sketch.ai.strength')}
            />
          </label>
        )}

        {operation === 'style-transfer' && (
          <label className="block text-xs text-[var(--vscode-descriptionForeground)]">
            <span className="mb-1 block">{t('sketch.ai.style')}</span>
            <select
              className="w-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)]"
              style={{ borderRadius: 4 }}
              value={style}
              onChange={(event) => setStyle(event.target.value as SketchAIStylePreset)}
              aria-label={t('sketch.ai.style')}
            >
              {STYLE_PRESETS.map((item) => (
                <option key={item.value} value={item.value}>
                  {t(item.labelKey)}
                </option>
              ))}
            </select>
          </label>
        )}

        {operation === 'upscale' && (
          <label className="block text-xs text-[var(--vscode-descriptionForeground)]">
            <span className="mb-1 block">{t('sketch.ai.scale')}</span>
            <select
              className="w-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)]"
              style={{ borderRadius: 4 }}
              value={scale}
              onChange={(event) => setScale(Number(event.target.value) as 2 | 4)}
              aria-label={t('sketch.ai.scale')}
            >
              <option value={2}>2x</option>
              <option value={4}>4x</option>
            </select>
          </label>
        )}

        {operation === 'lineart-colorize' && (
          <label className="block text-xs text-[var(--vscode-descriptionForeground)]">
            <span className="mb-1 block">{t('sketch.ai.palette')}</span>
            <input
              className="w-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
              style={{ borderRadius: 4 }}
              value={paletteText}
              onChange={(event) => setPaletteText(event.target.value)}
              placeholder={t('sketch.ai.palettePlaceholder')}
              aria-label={t('sketch.ai.palette')}
            />
          </label>
        )}

        {operation === 'auto-layer' && (
          <fieldset className="border-0 p-0 text-xs text-[var(--vscode-descriptionForeground)]">
            <legend className="mb-1">{t('sketch.ai.autoLayerTargets')}</legend>
            <div className="grid grid-cols-2 gap-1">
              {AUTO_LAYER_TARGETS.map((item) => (
                <label key={item.value} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={autoLayerTargets.includes(item.value)}
                    onChange={(event) => {
                      setAutoLayerTargets((current) =>
                        event.target.checked
                          ? [...current, item.value]
                          : current.filter((value) => value !== item.value),
                      );
                    }}
                  />
                  <span>{t(item.labelKey)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {supportsLayerName(operation) && (
          <label className="block text-xs text-[var(--vscode-descriptionForeground)]">
            <span className="mb-1 block">{t('sketch.ai.layerName')}</span>
            <input
              className="w-full border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] px-2 py-1 text-xs text-[var(--vscode-input-foreground)] placeholder:text-[var(--vscode-input-placeholderForeground)]"
              style={{ borderRadius: 4 }}
              value={layerName}
              onChange={(event) => setLayerName(event.target.value)}
              aria-label={t('sketch.ai.layerName')}
            />
          </label>
        )}

        <button
          type="button"
          className="w-full border border-[var(--vscode-button-border)] bg-[var(--vscode-button-background)] px-2 py-1 text-xs font-medium text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)]"
          style={{ borderRadius: 4 }}
          onClick={() => onOpenAgent(operation, prompt, params)}
        >
          {t('sketch.ai.openAgent')}
        </button>
      </div>
    </div>
  );
}

function buildParams(params: {
  readonly operation: SketchAIOperationType;
  readonly scope: 'canvas' | 'layer';
  readonly negativePrompt: string;
  readonly strength: number;
  readonly scale: 2 | 4;
  readonly style: SketchAIStylePreset;
  readonly layerName: string;
  readonly paletteText: string;
  readonly autoLayerTargets: readonly SketchAIAutoLayerTarget[];
}): SketchAIOperationParams {
  const result: Record<string, unknown> = {};
  if (supportsScope(params.operation)) {
    result.scope = params.scope;
  }
  if (supportsNegativePrompt(params.operation) && params.negativePrompt.trim()) {
    result.negativePrompt = params.negativePrompt.trim();
  }
  if (supportsStrength(params.operation)) {
    result.strength = params.strength;
  }
  if (params.operation === 'style-transfer') {
    result.style = params.style;
  }
  if (params.operation === 'upscale') {
    result.scale = params.scale;
  }
  if (params.operation === 'lineart-colorize') {
    const palette = params.paletteText
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (palette.length > 0) {
      result.palette = palette;
    }
  }
  if (params.operation === 'auto-layer' && params.autoLayerTargets.length > 0) {
    result.autoLayerTargets = params.autoLayerTargets;
  }
  if (supportsLayerName(params.operation) && params.layerName.trim()) {
    result.layerName = params.layerName.trim();
  }
  return result;
}
