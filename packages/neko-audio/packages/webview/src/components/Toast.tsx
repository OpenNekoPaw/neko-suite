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

  const color = levelColors[toast.level] ?? levelColors.info;

  return (
    <div
      className="fixed bottom-4 right-4 max-w-[360px] px-3.5 py-2 rounded-md text-xs leading-relaxed
        text-[var(--vscode-editor-foreground)] bg-[var(--vscode-editorWidget-background)]
        shadow-lg flex items-center gap-2 z-[9999]"
      style={{
        border: `1px solid ${color}`,
        animation: 'neko-toast-slide-in 0.2s ease',
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} />
      <span className="flex-1">{toast.text}</span>
      <button
        onClick={clearToast}
        className="bg-transparent border-none text-[var(--vscode-editor-foreground)] cursor-pointer opacity-50 hover:opacity-100 text-sm p-0 leading-none transition-opacity"
      >
        ×
      </button>
    </div>
  );
}
