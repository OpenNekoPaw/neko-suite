/**
 * PreviewControls Component
 * 预览面板控制器 - 播放控制、视频质量、分辨率
 */

import { useState, useRef, useEffect, memo } from 'react';
import { useTranslation } from '../i18n/I18nContext';
import { useEditorStore } from '../stores/editor-store';
import { formatTimeFull } from '../utils';

// Resolution presets
export type ResolutionPreset =
  | '720p@60fps'
  | '1080p@30fps'
  | '1080p@60fps'
  | '4k@30fps'
  | '4k@60fps';

const RESOLUTION_PRESETS: Record<
  ResolutionPreset,
  { width: number; height: number; fps: number; label: string }
> = {
  '720p@60fps': { width: 1280, height: 720, fps: 60, label: '720P 60FPS' },
  '1080p@30fps': { width: 1920, height: 1080, fps: 30, label: '1080P 30FPS' },
  '1080p@60fps': { width: 1920, height: 1080, fps: 60, label: '1080P 60FPS' },
  '4k@30fps': { width: 3840, height: 2160, fps: 30, label: '4K 30FPS' },
  '4k@60fps': { width: 3840, height: 2160, fps: 60, label: '4K 60FPS' },
};

export interface PreviewControlsProps {
  // Playback state
  currentTime: number;
  totalDuration: number;
  isPlaying: boolean;

  // Playback controls
  seek: (time: number) => void;
  togglePlayback: () => void;

  // Preview quality
  previewQuality: 'full' | 'high' | 'medium' | 'low';
  setPreviewQuality: (quality: 'full' | 'high' | 'medium' | 'low') => void;

  // Audio controls
  previewVolume: number;
  previewMuted: boolean;
  setPreviewVolume: (volume: number) => void;
  togglePreviewMute: () => void;

  // Resolution settings
  resolution: { width: number; height: number };
  fps: number;
  onResolutionChange?: (resolution: { width: number; height: number }) => void;
  onFpsChange?: (fps: number) => void;

  // Fullscreen
  isFullscreen?: boolean;
  onFullscreenToggle?: () => void;

  // Screenshot
  onCaptureScreenshot?: () => void;
  isCapturingScreenshot?: boolean;

  // Property panel toggle
  propertyPanelVisible?: boolean;
  onTogglePropertyPanel?: () => void;
}

// Dropdown component for selections
interface DropdownProps<T extends string | number> {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}

function Dropdown<T extends string | number>({
  value,
  options,
  onChange,
  className = '',
  disabled,
}: DropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div ref={dropdownRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={`flex items-center gap-1 px-2 py-1 text-xs rounded border transition-colors ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-vscode-input-bg border-vscode-panel-border text-vscode-description'
            : 'bg-vscode-input-bg border-vscode-panel-border text-vscode-fg hover:border-vscode-focusBorder'
        }`}
      >
        <span>{selectedOption?.label || value}</span>
        <svg className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
            clipRule="evenodd"
          />
        </svg>
      </button>
      {isOpen && (
        <div className="absolute bottom-full left-0 mb-1 py-1 bg-vscode-dropdown-bg border border-vscode-panel-border rounded shadow-lg z-50 min-w-full">
          {options.map((option) => (
            <button
              key={String(option.value)}
              type="button"
              onClick={() => {
                onChange(option.value);
                setIsOpen(false);
              }}
              className={`w-full px-3 py-1.5 text-xs text-left transition-colors whitespace-nowrap ${
                option.value === value
                  ? 'bg-vscode-list-activeSelectionBg text-vscode-list-activeSelectionFg'
                  : 'text-vscode-fg hover:bg-vscode-list-hoverBg'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export const PreviewControls = memo(function PreviewControls({
  currentTime,
  totalDuration,
  isPlaying,
  seek,
  togglePlayback,
  previewQuality,
  setPreviewQuality,
  previewVolume,
  previewMuted,
  setPreviewVolume,
  togglePreviewMute,
  resolution: _resolution,
  fps: _fps,
  onResolutionChange: _onResolutionChange,
  onFpsChange: _onFpsChange,
  isFullscreen = false,
  onFullscreenToggle,
  onCaptureScreenshot,
  isCapturingScreenshot = false,
  propertyPanelVisible = true,
  onTogglePropertyPanel,
}: PreviewControlsProps) {
  const { t } = useTranslation();

  // FPS counter state from store
  const showFpsCounter = useEditorStore((state) => state.showFpsCounter);
  const toggleFpsCounter = useEditorStore((state) => state.toggleFpsCounter);

  // PiP state from store
  const isPiPActive = useEditorStore((state) => state.isPiPActive);

  // Quality options - display quality name with scale ratio
  const qualityOptions: { value: 'full' | 'high' | 'medium' | 'low'; label: string }[] = [
    { value: 'full', label: `${t('preview.qualityOptions.full')}: 1` },
    { value: 'high', label: `${t('preview.qualityOptions.high')}: 0.75` },
    { value: 'medium', label: `${t('preview.qualityOptions.medium')}: 0.5` },
    { value: 'low', label: `${t('preview.qualityOptions.low')}: 0.25` },
  ];

  return (
    <div className="flex items-center justify-between px-4 py-2 bg-vscode-editor-bg border-b border-vscode-panel-border">
      {/* Left: Playback Controls */}
      <div className="flex items-center gap-1">
        <button
          onClick={() => seek(0)}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.goToStart')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 6h2v12H6zm3.5 6l8.5 6V6z" />
          </svg>
        </button>

        <button
          onClick={() => seek(Math.max(0, currentTime - 5))}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.rewind5s')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M11 18V6l-8.5 6zm.5-6l8.5 6V6z" />
          </svg>
        </button>

        <button
          onClick={togglePlayback}
          className="p-2 bg-vscode-button hover:bg-vscode-button-hover rounded"
          title={isPlaying ? t('timeline.controls.pause') : t('timeline.controls.play')}
        >
          {isPlaying ? (
            <svg className="w-4 h-4 fill-current text-vscode-button-fg" viewBox="0 0 24 24">
              <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4 fill-current text-vscode-button-fg" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>

        <button
          onClick={() => seek(Math.min(totalDuration, currentTime + 5))}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.forward5s')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M4 18l8.5-6L4 6v12zm9-12v12l8.5-6L13 6z" />
          </svg>
        </button>

        <button
          onClick={() => seek(totalDuration)}
          className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
          title={t('timeline.controls.goToEnd')}
        >
          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
            <path d="M6 18l8.5-6L6 6v12zm10-12v12h2V6h-2z" />
          </svg>
        </button>

        <div className="w-px h-4 bg-vscode-panel-border mx-2" />

        <span className="text-xs text-vscode-description font-mono">
          {formatTimeFull(currentTime)} / {formatTimeFull(totalDuration)}
        </span>
      </div>

      {/* Right: Quality Dropdown + Volume Controls + Screenshot + Fullscreen */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-vscode-description whitespace-nowrap">
          {t('preview.quality')}
        </span>
        <Dropdown value={previewQuality} options={qualityOptions} onChange={setPreviewQuality} />

        {/* Volume Controls */}
        <div className="w-px h-4 bg-vscode-panel-border mx-1" />
        <div className="flex items-center gap-2">
          {/* Mute/Unmute Button */}
          <button
            onClick={togglePreviewMute}
            className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
            title={previewMuted ? t('preview.unmute') || 'Unmute' : t('preview.mute') || 'Mute'}
          >
            {previewMuted ? (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
              </svg>
            ) : (
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
              </svg>
            )}
          </button>

          {/* Volume Slider */}
          <input
            type="range"
            min="0"
            max="100"
            value={previewMuted ? 0 : Math.round(previewVolume * 100)}
            onChange={(e) => {
              const newVolume = Number.parseInt(e.target.value) / 100;
              setPreviewVolume(newVolume);
              // Unmute if user adjusts volume while muted
              if (previewMuted && newVolume > 0) {
                togglePreviewMute();
              }
            }}
            className="w-20 h-1 bg-vscode-input-bg rounded-lg appearance-none cursor-pointer accent-vscode-button"
            style={{
              background: `linear-gradient(to right, var(--vscode-button-background) 0%, var(--vscode-button-background) ${previewMuted ? 0 : previewVolume * 100}%, var(--vscode-input-background) ${previewMuted ? 0 : previewVolume * 100}%, var(--vscode-input-background) 100%)`,
            }}
            title={`${t('preview.volume') || 'Volume'}: ${Math.round(previewVolume * 100)}%`}
          />

          {/* Volume Percentage */}
          <span className="text-xs text-vscode-description font-mono w-8 text-right">
            {previewMuted ? '0%' : `${Math.round(previewVolume * 100)}%`}
          </span>
        </div>

        {/* FPS Counter Toggle */}
        <div className="w-px h-4 bg-vscode-panel-border mx-1" />
        <button
          onClick={toggleFpsCounter}
          className={`p-1.5 rounded transition-colors ${
            showFpsCounter
              ? 'bg-vscode-button text-vscode-button-fg'
              : 'hover:bg-vscode-toolbar-hover'
          }`}
          title={t('preview.toggleFps') || 'Toggle FPS Counter'}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-7 14H5v-2h7v2zm5-4H5v-2h12v2zm0-4H5V7h12v2z" />
          </svg>
        </button>

        {/* Screenshot Button */}
        {onCaptureScreenshot && (
          <>
            <div className="w-px h-4 bg-vscode-panel-border mx-1" />
            <button
              onClick={onCaptureScreenshot}
              disabled={isCapturingScreenshot}
              className="p-1.5 hover:bg-vscode-toolbar-hover rounded disabled:opacity-50 disabled:cursor-not-allowed"
              title={t('preview.captureScreenshot') || 'Capture Screenshot'}
            >
              {isCapturingScreenshot ? (
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  <path d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
              )}
            </button>
          </>
        )}

        {/* PiP Button */}
        <div className="w-px h-4 bg-vscode-panel-border mx-1" />
        <button
          onClick={() =>
            (
              window as unknown as { __previewPanelTogglePiP?: () => void }
            ).__previewPanelTogglePiP?.()
          }
          className={`p-1.5 rounded transition-colors ${
            isPiPActive ? 'bg-vscode-button text-vscode-button-fg' : 'hover:bg-vscode-toolbar-hover'
          }`}
          title={isPiPActive ? t('preview.exitPictureInPicture') : t('preview.pictureInPicture')}
        >
          <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M19 11h-8v6h8v-6zm4 8V4.98C23 3.88 22.1 3 21 3H3c-1.1 0-2 .88-2 1.98V19c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2zm-2 .02H3V4.97h18v14.05z" />
          </svg>
        </button>

        {/* Fullscreen Button */}
        {onFullscreenToggle && (
          <>
            <div className="w-px h-4 bg-vscode-panel-border mx-1" />
            <button
              onClick={onFullscreenToggle}
              className="p-1.5 hover:bg-vscode-toolbar-hover rounded"
              title={isFullscreen ? t('preview.exitFullscreen') : t('preview.fullscreen')}
            >
              {isFullscreen ? (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                  <path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z" />
                </svg>
              )}
            </button>
          </>
        )}

        {/* Property Panel Toggle */}
        {onTogglePropertyPanel && (
          <>
            <div className="w-px h-4 bg-vscode-panel-border mx-1" />
            <button
              onClick={onTogglePropertyPanel}
              className={`p-1.5 hover:bg-vscode-toolbar-hover rounded ${propertyPanelVisible ? 'text-vscode-accent' : ''}`}
              title={t('preview.togglePropertyPanel') || 'Toggle Properties'}
            >
              <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                <path d="M3 3h18v18H3V3zm16 16V5H5v14h14zM15 5v14h-2V5h2z" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
});
