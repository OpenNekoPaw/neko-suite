/**
 * GenerationPromptPanel - Lightweight AI image generation dialog.
 *
 * Architecture (ADR-2D-007):
 * - This panel lives in the canvas webview and provides the UI.
 * - Actual generation is delegated to neko-agent via Extension Host:
 *   webview → postMessage('generateForNode') → Extension → neko.agent.generateForNode
 * - Progress is received via postMessage('generationProgress').
 *
 * The panel is a position:fixed overlay, unaffected by canvas transforms.
 */

import { useState, useEffect, useRef } from 'react';
import type { ShotScale, CameraMovement, CameraAngle } from '@neko/shared';
import { t } from '../../i18n';
import { resolveCanvasOptionLabel } from '../../i18n/canvasValueLabels';

// =============================================================================
// Types
// =============================================================================

export interface GenerationParams {
  prompt: string;
  style?: string;
  ratio?: '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
  shotScale?: ShotScale;
  cameraMovement?: CameraMovement;
  cameraAngle?: CameraAngle;
  /** Gallery child node references for IP-Adapter: [nodeId:childNodeId, ...] */
  referenceRefs?: string[];
  count?: number;
  /** ControlNet mode (E6: depth/canny/pose/...) */
  controlMode?: string;
  /** ControlNet conditioning strength 0-1 */
  controlStrength?: number;
  /** Natural-language edit instruction (alternative to prompt for image edits) */
  editInstruction?: string;
  /** Generate video instead of image */
  generateVideo?: boolean;
  /** Video duration in seconds */
  videoDuration?: number;
}

export interface GenerationPanelTarget {
  nodeId: string;
  /** childNodeId is set when generating for a gallery child node */
  childNodeId?: string;
  /** Pre-filled values from shot data */
  initialPrompt?: string;
  initialShotScale?: ShotScale;
  initialCameraMovement?: CameraMovement;
  initialCameraAngle?: CameraAngle;
  /** Pre-fill ControlNet mode (e.g. from "ControlNet Edit" menu) */
  initialControlMode?: string;
  /** Pre-fill video generation mode (e.g. from "Generate Video" menu) */
  initialGenerateVideo?: boolean;
}

export interface GenerationPromptPanelProps {
  /** Whether the panel is visible */
  visible: boolean;
  target: GenerationPanelTarget | null;
  /** Called when the user clicks Generate */
  onGenerate: (target: GenerationPanelTarget, params: GenerationParams) => void;
  /** Called when the panel is closed */
  onClose: () => void;
  /** Called to request AutoPrompt fill from neko-agent */
  onRequestAutoPrompt?: (target: GenerationPanelTarget) => Promise<string>;
}

// =============================================================================
// Constants
// =============================================================================

const STYLES = ['Anime', 'Realistic', 'Illustration', 'Oil Painting', 'Sketch', 'Watercolor'];

const RATIOS = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const;

const SHOT_SCALES: ShotScale[] = ['ECU', 'CU', 'MCU', 'MS', 'MLS', 'LS', 'VLS', 'ELS'];

const CAMERA_MOVEMENTS: CameraMovement[] = [
  'static',
  'pan',
  'tilt',
  'zoom-in',
  'zoom-out',
  'dolly',
  'handheld',
  'crane',
];

const CAMERA_ANGLES: CameraAngle[] = ['eye-level', 'high-angle', 'low-angle', 'bird-eye', 'dutch'];

const CONTROL_MODES = [
  'canny',
  'depth',
  'pose',
  'normal',
  'segment',
  'lineart',
  'softedge',
  'scribble',
];

const VIDEO_DURATIONS = [3, 5, 10, 15] as const;

// =============================================================================
// Helpers
// =============================================================================

function SelectPill<T extends string>({
  label,
  value,
  options,
  optionPath,
  onChange,
}: {
  label: string;
  value: T | undefined;
  options: T[];
  optionPath?: string;
  onChange: (v: T | undefined) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      <span style={{ color: 'var(--neko-fg-secondary)', fontSize: 11 }}>{label}:</span>
      <select
        value={value ?? ''}
        onChange={(e) => onChange((e.target.value as T) || undefined)}
        style={{
          fontSize: 11,
          padding: '1px 4px',
          borderRadius: 4,
          border: '1px solid var(--neko-border)',
          backgroundColor: 'var(--neko-surface)',
          color: 'var(--neko-fg)',
          cursor: 'pointer',
        }}
      >
        <option value="">--</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {optionPath ? resolveCanvasOptionLabel(optionPath, o) : o}
          </option>
        ))}
      </select>
    </div>
  );
}

// =============================================================================
// Component
// =============================================================================

export function GenerationPromptPanel({
  visible,
  target,
  onGenerate,
  onClose,
  onRequestAutoPrompt,
}: GenerationPromptPanelProps) {
  const [prompt, setPrompt] = useState('');
  const [style, setStyle] = useState<string | undefined>(undefined);
  const [ratio, setRatio] = useState<GenerationParams['ratio']>('16:9');
  const [shotScale, setShotScale] = useState<ShotScale | undefined>(undefined);
  const [cameraMovement, setCameraMovement] = useState<CameraMovement | undefined>(undefined);
  const [cameraAngle, setCameraAngle] = useState<CameraAngle | undefined>(undefined);
  const [isLoadingPrompt, setIsLoadingPrompt] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [controlMode, setControlMode] = useState<string | undefined>(undefined);
  const [controlStrength, setControlStrength] = useState(0.7);
  const [editInstruction, setEditInstruction] = useState('');
  const [generateVideo, setGenerateVideo] = useState(false);
  const [videoDuration, setVideoDuration] = useState(5);
  const promptRef = useRef<HTMLTextAreaElement>(null);

  // Sync initial values when target changes
  useEffect(() => {
    if (!target) return;
    setPrompt(target.initialPrompt ?? '');
    setShotScale(target.initialShotScale);
    setCameraMovement(target.initialCameraMovement);
    setCameraAngle(target.initialCameraAngle);
    setControlMode(target.initialControlMode);
    setGenerateVideo(target.initialGenerateVideo ?? false);
    setAdvancedOpen(Boolean(target.initialControlMode || target.initialGenerateVideo));
    setEditInstruction('');
    setControlStrength(0.7);
    setVideoDuration(5);
  }, [target?.nodeId, target?.childNodeId]);

  // Focus prompt textarea when panel opens
  useEffect(() => {
    if (visible) {
      setTimeout(() => promptRef.current?.focus(), 50);
    }
  }, [visible]);

  if (!visible || !target) return null;

  async function handleAutoPrompt() {
    if (!onRequestAutoPrompt || !target) return;
    setIsLoadingPrompt(true);
    try {
      const autoPrompt = await onRequestAutoPrompt(target);
      setPrompt(autoPrompt);
    } finally {
      setIsLoadingPrompt(false);
    }
  }

  function handleGenerate() {
    if (!prompt.trim() || !target) return;
    const params: GenerationParams = {
      prompt: prompt.trim(),
      style,
      ratio,
      shotScale,
      cameraMovement,
      cameraAngle,
    };
    if (controlMode) params.controlMode = controlMode;
    if (controlMode && controlStrength !== 0.7) params.controlStrength = controlStrength;
    if (editInstruction.trim()) params.editInstruction = editInstruction.trim();
    if (generateVideo) {
      params.generateVideo = true;
      params.videoDuration = videoDuration;
    }
    onGenerate(target, params);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') onClose();
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleGenerate();
  }

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0" style={{ zIndex: 9998 }} onClick={onClose} />

      {/* Panel */}
      <div
        className="fixed"
        style={{
          zIndex: 9999,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 420,
          backgroundColor: 'var(--neko-surface)',
          border: '1px solid var(--neko-border)',
          borderRadius: 8,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
        onKeyDown={handleKeyDown}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            borderBottom: '1px solid var(--neko-border)',
            backgroundColor: 'var(--neko-surface)',
          }}
        >
          <span className="font-medium text-sm" style={{ color: 'var(--neko-fg)' }}>
            生成图像
            {target.childNodeId && (
              <span className="ml-2 text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
                · 单格模式
              </span>
            )}
          </span>
          <button
            onClick={onClose}
            style={{
              color: 'var(--neko-fg-secondary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontSize: 16,
              lineHeight: 1,
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div className="p-4 flex flex-col gap-3">
          {/* Prompt */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium" style={{ color: 'var(--neko-fg-secondary)' }}>
                提示词
              </label>
              {onRequestAutoPrompt && (
                <button
                  onClick={handleAutoPrompt}
                  disabled={isLoadingPrompt}
                  className="text-xs"
                  style={{
                    color: '#3b82f6',
                    background: 'none',
                    border: 'none',
                    cursor: isLoadingPrompt ? 'wait' : 'pointer',
                    opacity: isLoadingPrompt ? 0.6 : 1,
                  }}
                >
                  {isLoadingPrompt ? '生成中…' : '✨ 自动填写'}
                </button>
              )}
            </div>
            <textarea
              ref={promptRef}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="描述画面内容，例如: A young woman standing in a modern office, looking at a screen..."
              rows={3}
              style={{
                width: '100%',
                padding: '8px 10px',
                fontSize: 12,
                borderRadius: 6,
                border: '1px solid var(--neko-border)',
                backgroundColor: 'var(--neko-surface)',
                color: 'var(--neko-fg)',
                resize: 'vertical',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Style + Ratio row */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              <span style={{ color: 'var(--neko-fg-secondary)', fontSize: 11 }}>风格:</span>
              <select
                value={style ?? ''}
                onChange={(e) => setStyle(e.target.value || undefined)}
                style={{
                  fontSize: 11,
                  padding: '1px 4px',
                  borderRadius: 4,
                  border: '1px solid var(--neko-border)',
                  backgroundColor: 'var(--neko-surface)',
                  color: 'var(--neko-fg)',
                  cursor: 'pointer',
                }}
              >
                <option value="">默认</option>
                {STYLES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-1">
              <span style={{ color: 'var(--neko-fg-secondary)', fontSize: 11 }}>比例:</span>
              <div className="flex gap-1">
                {RATIOS.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRatio(r)}
                    style={{
                      fontSize: 9,
                      padding: '1px 5px',
                      borderRadius: 3,
                      border: `1px solid ${ratio === r ? '#3b82f6' : 'var(--neko-border)'}`,
                      backgroundColor: ratio === r ? '#3b82f620' : 'transparent',
                      color: ratio === r ? '#3b82f6' : 'var(--neko-fg-secondary)',
                      cursor: 'pointer',
                    }}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Camera controls */}
          <div className="flex items-center gap-3 flex-wrap">
            <SelectPill
              label={t('panel.shotScale')}
              value={shotScale}
              options={SHOT_SCALES}
              optionPath="/shotScale"
              onChange={setShotScale}
            />
            <SelectPill
              label={t('panel.cameraMovement')}
              value={cameraMovement}
              options={CAMERA_MOVEMENTS}
              optionPath="/cameraMovement"
              onChange={setCameraMovement}
            />
            <SelectPill
              label={t('panel.cameraAngle')}
              value={cameraAngle}
              options={CAMERA_ANGLES}
              optionPath="/cameraAngle"
              onChange={setCameraAngle}
            />
          </div>

          {/* Advanced section (ControlNet / Video / Edit instruction) */}
          <div>
            <button
              onClick={() => setAdvancedOpen((v) => !v)}
              style={{
                fontSize: 11,
                color: 'var(--neko-fg-secondary)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              {advancedOpen ? '▾' : '▸'} {t('gen.advanced')}
            </button>

            {advancedOpen && (
              <div className="flex flex-col gap-2 mt-2">
                {/* ControlNet mode + strength */}
                <div className="flex items-center gap-3 flex-wrap">
                  <SelectPill
                    label={t('gen.controlMode')}
                    value={controlMode}
                    options={CONTROL_MODES}
                    onChange={setControlMode}
                  />
                  {controlMode && (
                    <div className="flex items-center gap-1">
                      <span style={{ color: 'var(--neko-fg-secondary)', fontSize: 11 }}>
                        {t('gen.controlStrength')}:
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={1}
                        step={0.05}
                        value={controlStrength}
                        onChange={(e) => setControlStrength(Number(e.target.value))}
                        style={{ width: 80, accentColor: '#3b82f6' }}
                      />
                      <span
                        style={{ fontSize: 10, color: 'var(--neko-fg-secondary)', minWidth: 28 }}
                      >
                        {controlStrength.toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Edit instruction */}
                <input
                  type="text"
                  value={editInstruction}
                  onChange={(e) => setEditInstruction(e.target.value)}
                  placeholder={t('gen.editInstruction')}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    borderRadius: 4,
                    border: '1px solid var(--neko-border)',
                    backgroundColor: 'var(--neko-surface)',
                    color: 'var(--neko-fg)',
                    width: '100%',
                    boxSizing: 'border-box',
                  }}
                />

                {/* Generate Video toggle + duration */}
                <div className="flex items-center gap-3">
                  <label
                    className="flex items-center gap-1 cursor-pointer"
                    style={{ fontSize: 11 }}
                  >
                    <input
                      type="checkbox"
                      checked={generateVideo}
                      onChange={(e) => setGenerateVideo(e.target.checked)}
                      style={{ accentColor: '#3b82f6' }}
                    />
                    <span style={{ color: 'var(--neko-fg-secondary)' }}>
                      {t('gen.generateVideo')}
                    </span>
                  </label>
                  {generateVideo && (
                    <div className="flex items-center gap-1">
                      <span style={{ color: 'var(--neko-fg-secondary)', fontSize: 11 }}>
                        {t('gen.videoDuration')}:
                      </span>
                      <select
                        value={videoDuration}
                        onChange={(e) => setVideoDuration(Number(e.target.value))}
                        style={{
                          fontSize: 11,
                          padding: '1px 4px',
                          borderRadius: 4,
                          border: '1px solid var(--neko-border)',
                          backgroundColor: 'var(--neko-surface)',
                          color: 'var(--neko-fg)',
                          cursor: 'pointer',
                        }}
                      >
                        {VIDEO_DURATIONS.map((d) => (
                          <option key={d} value={d}>
                            {d}s
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div
          className="flex items-center justify-between px-4 py-3"
          style={{
            borderTop: '1px solid var(--neko-border)',
            backgroundColor: 'var(--neko-surface)',
          }}
        >
          <span className="text-xs" style={{ color: 'var(--neko-fg-secondary)' }}>
            Ctrl+Enter 生成
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              style={{
                fontSize: 12,
                padding: '5px 12px',
                borderRadius: 5,
                border: '1px solid var(--neko-border)',
                backgroundColor: 'transparent',
                color: 'var(--neko-fg-secondary)',
                cursor: 'pointer',
              }}
            >
              取消
            </button>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              style={{
                fontSize: 12,
                padding: '5px 14px',
                borderRadius: 5,
                border: 'none',
                backgroundColor: prompt.trim() ? '#3b82f6' : '#3b82f640',
                color: '#fff',
                cursor: prompt.trim() ? 'pointer' : 'not-allowed',
                fontWeight: 500,
              }}
            >
              生成 ▶
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
