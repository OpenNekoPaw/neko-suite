/**
 * Toast - Lightweight notification overlay
 *
 * Auto-dismisses after 4 seconds (managed by store).
 * Levels: info (default), success (green), error (red).
 */

import { useAudioStore } from '../stores/audioStore';

const levelColors: Record<string, string> = {
  info: 'var(--vscode-editorInfo-foreground, #3794ff)',
  success: 'var(--vscode-testing-iconPassed, #73c991)',
  error: 'var(--vscode-errorForeground, #f44)',
};

export function Toast() {
  const toast = useAudioStore((s) => s.toast);
  const clearToast = useAudioStore((s) => s.clearToast);

  if (!toast) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        right: 16,
        maxWidth: 360,
        padding: '8px 14px',
        borderRadius: 6,
        fontSize: 12,
        lineHeight: 1.4,
        color: 'var(--vscode-editor-foreground)',
        background: 'var(--vscode-editorWidget-background)',
        border: `1px solid ${levelColors[toast.level] ?? levelColors.info}`,
        boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        zIndex: 9999,
        animation: 'fadeIn 0.2s ease',
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: levelColors[toast.level] ?? levelColors.info,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1 }}>{toast.text}</span>
      <button
        onClick={clearToast}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--vscode-editor-foreground)',
          cursor: 'pointer',
          opacity: 0.5,
          fontSize: 14,
          padding: 0,
          lineHeight: 1,
        }}
      >
        ×
      </button>
    </div>
  );
}
