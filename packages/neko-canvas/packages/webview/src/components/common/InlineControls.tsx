/**
 * InlineControls - Shared micro-components for inline node editing
 *
 * Extracted from NodePanel to be reused by node components (ShotNode, SceneGroupNode, etc.)
 * when they provide inline editing in selected state.
 *
 * Critical: all controls stop keyboard event propagation to prevent VS Code interception,
 * and stop mousedown propagation to prevent BaseNode drag triggering.
 */

// =============================================================================
// Event helpers (VS Code webview keyboard isolation)
// =============================================================================

function stopVSCodeEvents(e: React.KeyboardEvent) {
  e.stopPropagation();
  e.nativeEvent.stopImmediatePropagation();
}

function stopDrag(e: React.MouseEvent) {
  e.stopPropagation();
}

// =============================================================================
// Constants
// =============================================================================

export const SHOT_SCALES = [
  { value: 'ECU', label: 'ECU' },
  { value: 'CU', label: 'CU' },
  { value: 'MCU', label: 'MCU' },
  { value: 'MS', label: 'MS' },
  { value: 'MLS', label: 'MLS' },
  { value: 'LS', label: 'LS' },
  { value: 'VLS', label: 'VLS' },
  { value: 'ELS', label: 'ELS' },
];

export const CAMERA_MOVEMENTS = [
  { value: '', label: '无' },
  { value: 'static', label: '静止' },
  { value: 'pan', label: 'Pan' },
  { value: 'tilt', label: 'Tilt' },
  { value: 'zoom-in', label: '推镜' },
  { value: 'zoom-out', label: '拉镜' },
  { value: 'dolly', label: 'Dolly' },
  { value: 'handheld', label: '手持' },
];

export const CAMERA_ANGLES = [
  { value: '', label: '无' },
  { value: 'eye-level', label: '平视' },
  { value: 'high-angle', label: '俯拍' },
  { value: 'low-angle', label: '仰拍' },
  { value: 'bird-eye', label: '鸟瞰' },
  { value: 'dutch', label: '斜角' },
];

export const TIME_OF_DAY = [
  { value: '', label: '不限' },
  { value: 'dawn', label: '黎明' },
  { value: 'morning', label: '上午' },
  { value: 'noon', label: '正午' },
  { value: 'afternoon', label: '下午' },
  { value: 'dusk', label: '黄昏' },
  { value: 'night', label: '夜晚' },
];

export const GALLERY_PRESETS = [
  { value: 'character-3view', label: '三视图' },
  { value: 'character-4view', label: '四视图' },
  { value: 'expression-9', label: '表情包 (9格)' },
  { value: 'turnaround-8', label: '转身 (8帧)' },
  { value: 'scene-views', label: '场景三视' },
  { value: 'custom', label: '自定义' },
];

// =============================================================================
// Components
// =============================================================================

export function InlineSelect({
  value,
  options,
  onChange,
  width = 72,
}: {
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  width?: number;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={stopVSCodeEvents}
      onKeyUp={stopVSCodeEvents}
      onMouseDown={stopDrag}
      style={{
        fontSize: 11,
        padding: '2px 4px',
        borderRadius: 4,
        width,
        border: '1px solid var(--neko-border)',
        backgroundColor: 'var(--neko-surface)',
        color: 'var(--neko-fg)',
        flexShrink: 0,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function InlineInput({
  value,
  onChange,
  placeholder,
  width = 120,
  type = 'text',
  min,
  step,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  width?: number;
  type?: 'text' | 'number';
  min?: number;
  step?: number;
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      min={min}
      step={step}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={stopVSCodeEvents}
      onKeyUp={stopVSCodeEvents}
      onMouseDown={stopDrag}
      style={{
        fontSize: 11,
        padding: '2px 6px',
        borderRadius: 4,
        width: width ?? '100%',
        border: '1px solid var(--neko-border)',
        backgroundColor: 'var(--neko-surface)',
        color: 'var(--neko-fg)',
        outline: 'none',
        flexShrink: 0,
      }}
    />
  );
}

export function InlineTextarea({
  value,
  onChange,
  placeholder,
  rows = 2,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <textarea
      rows={rows}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={stopVSCodeEvents}
      onKeyUp={stopVSCodeEvents}
      onMouseDown={stopDrag}
      style={{
        width: '100%',
        fontSize: 11,
        padding: '4px 6px',
        borderRadius: 4,
        resize: 'none',
        border: '1px solid var(--neko-border)',
        backgroundColor: 'var(--neko-surface)',
        color: 'var(--neko-fg)',
        outline: 'none',
        boxSizing: 'border-box',
      }}
    />
  );
}

export function InlineLabel({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 10, color: 'var(--neko-fg-secondary)', userSelect: 'none' }}>
      {children}
    </span>
  );
}
