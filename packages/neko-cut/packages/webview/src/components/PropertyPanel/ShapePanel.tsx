/**
 * ShapePanel - 形状属性编辑面板
 *
 * 用于编辑 ShapeElement 中的形状实例属性：
 * - 形状几何属性（位置、大小、旋转等）
 * - 填充样式（纯色、渐变）
 * - 描边样式
 * - 阴影效果
 */

import { memo, useCallback, useState } from 'react';
import type {
  ShapeInstance,
  Shape,
  ShapeStyle,
  ShapeFill,
  ShapeStroke,
  ShapeShadow,
  ShapeType,
  GradientFill,
  GradientStop,
  RectangleShape,
  EllipseShape,
  PolygonShape,
  StarShape,
  LineShape,
} from '../../types/shape';
import { useTranslation } from '../../i18n/I18nContext';

// =============================================================================
// Types
// =============================================================================

interface ShapePanelProps {
  /** Selected shape instance */
  shape: ShapeInstance | null;
  /** Shape change handler */
  onShapeChange: (shapeId: string, updates: Partial<ShapeInstance>) => void;
  /** Shape geometry change handler */
  onGeometryChange: (shapeId: string, updates: Partial<Shape>) => void;
  /** Shape style change handler */
  onStyleChange: (shapeId: string, updates: Partial<ShapeStyle>) => void;
  /** Add shape handler */
  onAddShape: (shapeType: ShapeType) => void;
  /** Remove shape handler */
  onRemoveShape: (shapeId: string) => void;
  /** Duplicate shape handler */
  onDuplicateShape: (shapeId: string) => void;
  /** Disabled state */
  disabled?: boolean;
}

// =============================================================================
// Helper Components
// =============================================================================

interface CollapsibleSectionProps {
  titleKey: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}

const CollapsibleSection = memo(function CollapsibleSection({
  titleKey,
  children,
  defaultExpanded = true,
}: CollapsibleSectionProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border-b border-[var(--vscode-panel-border)]">
      <button
        className="w-full flex items-center gap-1 px-2 py-1.5 text-[11px] font-medium text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span className={`transform transition-transform ${expanded ? 'rotate-90' : ''}`}>
          ▶
        </span>
        {t(titleKey)}
      </button>
      {expanded && (
        <div className="px-2 pb-2 space-y-1.5">
          {children}
        </div>
      )}
    </div>
  );
});

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  disabled?: boolean;
}

const NumberInput = memo(function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  disabled,
}: NumberInputProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-20 text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
        {label}
      </label>
      <div className="flex-1 flex items-center gap-1">
        <input
          type="number"
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          className="w-full px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded disabled:opacity-50"
        />
        {unit && (
          <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{unit}</span>
        )}
      </div>
    </div>
  );
});

interface ColorInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

const ColorInput = memo(function ColorInput({
  label,
  value,
  onChange,
  disabled,
}: ColorInputProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-20 text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
        {label}
      </label>
      <div className="flex-1 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-6 h-6 p-0 border border-[var(--vscode-input-border)] rounded cursor-pointer disabled:opacity-50"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="flex-1 px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded disabled:opacity-50"
        />
      </div>
    </div>
  );
});

interface SelectInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}

const SelectInput = memo(function SelectInput({
  label,
  value,
  onChange,
  options,
  disabled,
}: SelectInputProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-20 text-[11px] text-[var(--vscode-descriptionForeground)] truncate">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="flex-1 px-2 py-1 text-[11px] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] border border-[var(--vscode-input-border)] rounded disabled:opacity-50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
});

interface CheckboxInputProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}

const CheckboxInput = memo(function CheckboxInput({
  label,
  checked,
  onChange,
  disabled,
}: CheckboxInputProps) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="w-4 h-4"
      />
      <label className="text-[11px] text-[var(--vscode-foreground)]">{label}</label>
    </div>
  );
});

// =============================================================================
// Geometry Editors
// =============================================================================

interface RectangleEditorProps {
  shape: RectangleShape;
  onChange: (updates: Partial<RectangleShape>) => void;
  disabled?: boolean;
}

const RectangleEditor = memo(function RectangleEditor({
  shape,
  onChange,
  disabled,
}: RectangleEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <NumberInput
        label={t('shape.properties.centerX')}
        value={shape.centerX}
        onChange={(v) => onChange({ centerX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.centerY')}
        value={shape.centerY}
        onChange={(v) => onChange({ centerY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.width')}
        value={shape.width}
        onChange={(v) => onChange({ width: v })}
        min={0.1}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.height')}
        value={shape.height}
        onChange={(v) => onChange({ height: v })}
        min={0.1}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.rotation')}
        value={shape.rotation}
        onChange={(v) => onChange({ rotation: v })}
        min={-180}
        max={180}
        step={1}
        unit="°"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.cornerRadius')}
        value={shape.cornerRadius}
        onChange={(v) => onChange({ cornerRadius: v })}
        min={0}
        max={50}
        step={1}
        unit="%"
        disabled={disabled}
      />
    </>
  );
});

interface EllipseEditorProps {
  shape: EllipseShape;
  onChange: (updates: Partial<EllipseShape>) => void;
  disabled?: boolean;
}

const EllipseEditor = memo(function EllipseEditor({
  shape,
  onChange,
  disabled,
}: EllipseEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <NumberInput
        label={t('shape.properties.centerX')}
        value={shape.centerX}
        onChange={(v) => onChange({ centerX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.centerY')}
        value={shape.centerY}
        onChange={(v) => onChange({ centerY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.radiusX')}
        value={shape.radiusX}
        onChange={(v) => onChange({ radiusX: v })}
        min={0.1}
        max={50}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.radiusY')}
        value={shape.radiusY}
        onChange={(v) => onChange({ radiusY: v })}
        min={0.1}
        max={50}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.rotation')}
        value={shape.rotation}
        onChange={(v) => onChange({ rotation: v })}
        min={-180}
        max={180}
        step={1}
        unit="°"
        disabled={disabled}
      />
    </>
  );
});

interface PolygonEditorProps {
  shape: PolygonShape;
  onChange: (updates: Partial<PolygonShape>) => void;
  disabled?: boolean;
}

const PolygonEditor = memo(function PolygonEditor({
  shape,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onChange: _onChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  disabled: _disabled,
}: PolygonEditorProps) {
  const { t } = useTranslation();

  return (
    <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
      <p>{t('shape.properties.points')}: {shape.points.length}</p>
      <p className="mt-1 text-[10px]">
        (Polygon vertices can be edited directly on canvas)
      </p>
    </div>
  );
});

interface StarEditorProps {
  shape: StarShape;
  onChange: (updates: Partial<StarShape>) => void;
  disabled?: boolean;
}

const StarEditor = memo(function StarEditor({
  shape,
  onChange,
  disabled,
}: StarEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <NumberInput
        label={t('shape.properties.centerX')}
        value={shape.centerX}
        onChange={(v) => onChange({ centerX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.centerY')}
        value={shape.centerY}
        onChange={(v) => onChange({ centerY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.points')}
        value={shape.points}
        onChange={(v) => onChange({ points: Math.max(3, Math.floor(v)) })}
        min={3}
        max={20}
        step={1}
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.outerRadius')}
        value={shape.outerRadius}
        onChange={(v) => onChange({ outerRadius: v })}
        min={1}
        max={50}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.innerRadiusRatio')}
        value={shape.innerRadiusRatio}
        onChange={(v) => onChange({ innerRadiusRatio: v })}
        min={0.1}
        max={0.9}
        step={0.01}
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.rotation')}
        value={shape.rotation}
        onChange={(v) => onChange({ rotation: v })}
        min={-180}
        max={180}
        step={1}
        unit="°"
        disabled={disabled}
      />
    </>
  );
});

interface LineEditorProps {
  shape: LineShape;
  onChange: (updates: Partial<LineShape>) => void;
  disabled?: boolean;
}

const LineEditor = memo(function LineEditor({
  shape,
  onChange,
  disabled,
}: LineEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <NumberInput
        label={t('shape.properties.startX')}
        value={shape.startX}
        onChange={(v) => onChange({ startX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.startY')}
        value={shape.startY}
        onChange={(v) => onChange({ startY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.endX')}
        value={shape.endX}
        onChange={(v) => onChange({ endX: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
      <NumberInput
        label={t('shape.properties.endY')}
        value={shape.endY}
        onChange={(v) => onChange({ endY: v })}
        min={0}
        max={100}
        step={0.1}
        unit="%"
        disabled={disabled}
      />
    </>
  );
});

// =============================================================================
// Style Editors
// =============================================================================

interface FillEditorProps {
  fill: ShapeFill;
  onChange: (updates: Partial<ShapeFill>) => void;
  disabled?: boolean;
}

const FillEditor = memo(function FillEditor({
  fill,
  onChange,
  disabled,
}: FillEditorProps) {
  const { t } = useTranslation();

  const fillTypeOptions = [
    { value: 'none', label: t('shape.fill.none') },
    { value: 'solid', label: t('shape.fill.solid') },
    { value: 'gradient', label: t('shape.fill.gradient') },
  ];

  return (
    <>
      <SelectInput
        label={t('shape.fill.type')}
        value={fill.type}
        onChange={(v) => onChange({ type: v as ShapeFill['type'] })}
        options={fillTypeOptions}
        disabled={disabled}
      />

      {fill.type === 'solid' && (
        <>
          <ColorInput
            label={t('shape.fill.color')}
            value={fill.color || '#ffffff'}
            onChange={(v) => onChange({ color: v })}
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.fill.opacity')}
            value={fill.opacity}
            onChange={(v) => onChange({ opacity: v })}
            min={0}
            max={1}
            step={0.01}
            disabled={disabled}
          />
        </>
      )}

      {fill.type === 'gradient' && fill.gradient && (
        <GradientEditor
          gradient={fill.gradient}
          onChange={(g) => onChange({ gradient: { ...fill.gradient!, ...g } })}
          disabled={disabled}
        />
      )}
    </>
  );
});

interface GradientEditorProps {
  gradient: GradientFill;
  onChange: (updates: Partial<GradientFill>) => void;
  disabled?: boolean;
}

const GradientEditor = memo(function GradientEditor({
  gradient,
  onChange,
  disabled,
}: GradientEditorProps) {
  const { t } = useTranslation();

  const gradientTypeOptions = [
    { value: 'linear', label: t('shape.gradient.linear') },
    { value: 'radial', label: t('shape.gradient.radial') },
  ];

  const handleStopChange = (index: number, updates: Partial<GradientStop>) => {
    const newStops = [...gradient.stops];
    newStops[index] = { ...newStops[index], ...updates };
    onChange({ stops: newStops });
  };

  const addStop = () => {
    const newStops = [...gradient.stops, { offset: 1, color: '#ffffff' }];
    onChange({ stops: newStops });
  };

  const removeStop = (index: number) => {
    if (gradient.stops.length <= 2) return;
    const newStops = gradient.stops.filter((_, i) => i !== index);
    onChange({ stops: newStops });
  };

  return (
    <div className="space-y-2 pl-2 border-l-2 border-[var(--vscode-panel-border)]">
      <SelectInput
        label={t('shape.gradient.type')}
        value={gradient.type}
        onChange={(v) => onChange({ type: v as GradientFill['type'] })}
        options={gradientTypeOptions}
        disabled={disabled}
      />

      {gradient.type === 'linear' && (
        <NumberInput
          label={t('shape.gradient.angle')}
          value={gradient.angle || 0}
          onChange={(v) => onChange({ angle: v })}
          min={0}
          max={360}
          step={1}
          unit="°"
          disabled={disabled}
        />
      )}

      {gradient.type === 'radial' && (
        <>
          <NumberInput
            label={t('shape.gradient.centerX')}
            value={(gradient.centerX ?? 0.5) * 100}
            onChange={(v) => onChange({ centerX: v / 100 })}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.gradient.centerY')}
            value={(gradient.centerY ?? 0.5) * 100}
            onChange={(v) => onChange({ centerY: v / 100 })}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.gradient.radius')}
            value={(gradient.radius ?? 0.5) * 100}
            onChange={(v) => onChange({ radius: v / 100 })}
            min={0}
            max={100}
            step={1}
            unit="%"
            disabled={disabled}
          />
        </>
      )}

      <div className="space-y-1">
        <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
          {t('shape.gradient.stops')}
        </div>
        {gradient.stops.map((stop, index) => (
          <div key={index} className="flex items-center gap-1">
            <input
              type="color"
              value={stop.color}
              onChange={(e) => handleStopChange(index, { color: e.target.value })}
              disabled={disabled}
              className="w-6 h-6 p-0 border border-[var(--vscode-input-border)] rounded cursor-pointer"
            />
            <input
              type="number"
              value={Math.round(stop.offset * 100)}
              onChange={(e) => handleStopChange(index, { offset: parseFloat(e.target.value) / 100 })}
              min={0}
              max={100}
              disabled={disabled}
              className="w-14 px-1 py-0.5 text-[10px] bg-[var(--vscode-input-background)] border border-[var(--vscode-input-border)] rounded"
            />
            <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">%</span>
            {gradient.stops.length > 2 && (
              <button
                onClick={() => removeStop(index)}
                disabled={disabled}
                className="text-[var(--vscode-errorForeground)] hover:opacity-80"
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addStop}
          disabled={disabled}
          className="text-[10px] text-[var(--vscode-textLink-foreground)] hover:underline"
        >
          + {t('shape.gradient.addStop')}
        </button>
      </div>
    </div>
  );
});

interface StrokeEditorProps {
  stroke: ShapeStroke;
  onChange: (updates: Partial<ShapeStroke>) => void;
  disabled?: boolean;
}

const StrokeEditor = memo(function StrokeEditor({
  stroke,
  onChange,
  disabled,
}: StrokeEditorProps) {
  const { t } = useTranslation();

  const lineCapOptions = [
    { value: 'butt', label: t('shape.stroke.cap.butt') },
    { value: 'round', label: t('shape.stroke.cap.round') },
    { value: 'square', label: t('shape.stroke.cap.square') },
  ];

  const lineJoinOptions = [
    { value: 'miter', label: t('shape.stroke.join.miter') },
    { value: 'round', label: t('shape.stroke.join.round') },
    { value: 'bevel', label: t('shape.stroke.join.bevel') },
  ];

  return (
    <>
      <CheckboxInput
        label={t('shape.stroke.enabled')}
        checked={stroke.enabled}
        onChange={(v) => onChange({ enabled: v })}
        disabled={disabled}
      />

      {stroke.enabled && (
        <>
          <ColorInput
            label={t('shape.stroke.color')}
            value={stroke.color}
            onChange={(v) => onChange({ color: v })}
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.stroke.width')}
            value={stroke.width}
            onChange={(v) => onChange({ width: v })}
            min={0.1}
            max={50}
            step={0.5}
            unit="px"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.stroke.opacity')}
            value={stroke.opacity}
            onChange={(v) => onChange({ opacity: v })}
            min={0}
            max={1}
            step={0.01}
            disabled={disabled}
          />
          <SelectInput
            label={t('shape.stroke.lineCap')}
            value={stroke.lineCap}
            onChange={(v) => onChange({ lineCap: v as ShapeStroke['lineCap'] })}
            options={lineCapOptions}
            disabled={disabled}
          />
          <SelectInput
            label={t('shape.stroke.lineJoin')}
            value={stroke.lineJoin}
            onChange={(v) => onChange({ lineJoin: v as ShapeStroke['lineJoin'] })}
            options={lineJoinOptions}
            disabled={disabled}
          />
        </>
      )}
    </>
  );
});

interface ShadowEditorProps {
  shadow: ShapeShadow;
  onChange: (updates: Partial<ShapeShadow>) => void;
  disabled?: boolean;
}

const ShadowEditor = memo(function ShadowEditor({
  shadow,
  onChange,
  disabled,
}: ShadowEditorProps) {
  const { t } = useTranslation();

  return (
    <>
      <CheckboxInput
        label={t('shape.shadow.enabled')}
        checked={shadow.enabled}
        onChange={(v) => onChange({ enabled: v })}
        disabled={disabled}
      />

      {shadow.enabled && (
        <>
          <ColorInput
            label={t('shape.shadow.color')}
            value={shadow.color}
            onChange={(v) => onChange({ color: v })}
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.shadow.blur')}
            value={shadow.blur}
            onChange={(v) => onChange({ blur: v })}
            min={0}
            max={100}
            step={1}
            unit="px"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.shadow.offsetX')}
            value={shadow.offsetX}
            onChange={(v) => onChange({ offsetX: v })}
            min={-100}
            max={100}
            step={1}
            unit="px"
            disabled={disabled}
          />
          <NumberInput
            label={t('shape.shadow.offsetY')}
            value={shadow.offsetY}
            onChange={(v) => onChange({ offsetY: v })}
            min={-100}
            max={100}
            step={1}
            unit="px"
            disabled={disabled}
          />
        </>
      )}
    </>
  );
});

// =============================================================================
// Main Component
// =============================================================================

export const ShapePanel = memo(function ShapePanel({
  shape,
  onShapeChange,
  onGeometryChange,
  onStyleChange,
  onAddShape,
  onRemoveShape,
  onDuplicateShape,
  disabled = false,
}: ShapePanelProps) {
  const { t } = useTranslation();

  // Shape type for add dropdown
  const shapeTypes: { value: ShapeType; labelKey: string }[] = [
    { value: 'rectangle', labelKey: 'shape.type.rectangle' },
    { value: 'ellipse', labelKey: 'shape.type.ellipse' },
    { value: 'polygon', labelKey: 'shape.type.polygon' },
    { value: 'star', labelKey: 'shape.type.star' },
    { value: 'line', labelKey: 'shape.type.line' },
    { value: 'bezier', labelKey: 'shape.type.bezier' },
  ];

  // Handle geometry change
  const handleGeometryChange = useCallback((updates: Partial<Shape>) => {
    if (!shape) return;
    onGeometryChange(shape.id, updates);
  }, [shape, onGeometryChange]);

  // Handle fill change
  const handleFillChange = useCallback((updates: Partial<ShapeFill>) => {
    if (!shape) return;
    onStyleChange(shape.id, {
      fill: { ...shape.style.fill, ...updates },
    });
  }, [shape, onStyleChange]);

  // Handle stroke change
  const handleStrokeChange = useCallback((updates: Partial<ShapeStroke>) => {
    if (!shape) return;
    onStyleChange(shape.id, {
      stroke: { ...shape.style.stroke, ...updates },
    });
  }, [shape, onStyleChange]);

  // Handle shadow change
  const handleShadowChange = useCallback((updates: Partial<ShapeShadow>) => {
    if (!shape) return;
    onStyleChange(shape.id, {
      shadow: { ...shape.style.shadow, ...updates },
    });
  }, [shape, onStyleChange]);

  // Render geometry editor based on shape type
  const renderGeometryEditor = () => {
    if (!shape) return null;

    switch (shape.shape.shapeType) {
      case 'rectangle':
        return (
          <RectangleEditor
            shape={shape.shape as RectangleShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'ellipse':
        return (
          <EllipseEditor
            shape={shape.shape as EllipseShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'polygon':
        return (
          <PolygonEditor
            shape={shape.shape as PolygonShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'star':
        return (
          <StarEditor
            shape={shape.shape as StarShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'line':
        return (
          <LineEditor
            shape={shape.shape as LineShape}
            onChange={handleGeometryChange}
            disabled={disabled}
          />
        );
      case 'bezier':
        return (
          <div className="text-[11px] text-[var(--vscode-descriptionForeground)]">
            <p>{t('shape.properties.closed')}: {(shape.shape as any).closed ? 'Yes' : 'No'}</p>
            <p className="mt-1 text-[10px]">
              (Bezier points can be edited directly on canvas)
            </p>
          </div>
        );
      default:
        return null;
    }
  };

  // No shape selected
  if (!shape) {
    return (
      <div className="p-4 text-center">
        <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-4">
          {t('shape.noShapes')}
        </p>
        <div className="space-y-2">
          {shapeTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => onAddShape(type.value)}
              disabled={disabled}
              className="w-full px-3 py-1.5 text-[11px] bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] rounded hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 transition-colors"
            >
              + {t(type.labelKey)}
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      {/* Shape Info Header */}
      <div className="p-2 border-b border-[var(--vscode-panel-border)] flex items-center justify-between">
        <div>
          <div className="text-[11px] font-medium text-[var(--vscode-foreground)]">
            {shape.name}
          </div>
          <div className="text-[10px] text-[var(--vscode-descriptionForeground)]">
            {t(`shape.type.${shape.shape.shapeType}`)}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={() => onDuplicateShape(shape.id)}
            disabled={disabled}
            className="p-1 text-[var(--vscode-foreground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded"
            title={t('shape.duplicateShape')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </button>
          <button
            onClick={() => onRemoveShape(shape.id)}
            disabled={disabled}
            className="p-1 text-[var(--vscode-errorForeground)] hover:bg-[var(--vscode-list-hoverBackground)] rounded"
            title={t('shape.removeShape')}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>
        </div>
      </div>

      {/* Visibility and Lock */}
      <div className="p-2 border-b border-[var(--vscode-panel-border)] flex gap-4">
        <CheckboxInput
          label="Visible"
          checked={shape.visible}
          onChange={(v) => onShapeChange(shape.id, { visible: v })}
          disabled={disabled}
        />
        <CheckboxInput
          label="Locked"
          checked={shape.locked}
          onChange={(v) => onShapeChange(shape.id, { locked: v })}
          disabled={disabled}
        />
      </div>

      {/* Geometry */}
      <CollapsibleSection titleKey="shape.properties.centerX">
        {renderGeometryEditor()}
      </CollapsibleSection>

      {/* Fill */}
      <CollapsibleSection titleKey="shape.fill.title">
        <FillEditor
          fill={shape.style.fill}
          onChange={handleFillChange}
          disabled={disabled}
        />
      </CollapsibleSection>

      {/* Stroke */}
      <CollapsibleSection titleKey="shape.stroke.title">
        <StrokeEditor
          stroke={shape.style.stroke}
          onChange={handleStrokeChange}
          disabled={disabled}
        />
      </CollapsibleSection>

      {/* Shadow */}
      <CollapsibleSection titleKey="shape.shadow.title" defaultExpanded={false}>
        <ShadowEditor
          shadow={shape.style.shadow}
          onChange={handleShadowChange}
          disabled={disabled}
        />
      </CollapsibleSection>

      {/* Add Shape */}
      <div className="p-2">
        <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mb-2">
          {t('shape.addShape')}
        </div>
        <div className="flex flex-wrap gap-1">
          {shapeTypes.map((type) => (
            <button
              key={type.value}
              onClick={() => onAddShape(type.value)}
              disabled={disabled}
              className="px-2 py-1 text-[10px] bg-[var(--vscode-button-secondaryBackground)] text-[var(--vscode-button-secondaryForeground)] rounded hover:bg-[var(--vscode-button-secondaryHoverBackground)] disabled:opacity-50"
            >
              {t(type.labelKey)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
});

export default ShapePanel;
