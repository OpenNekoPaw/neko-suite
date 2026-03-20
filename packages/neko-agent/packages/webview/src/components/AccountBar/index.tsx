/**
 * AccountBar — replaces the Settings gear button in Header.
 *
 * Three states:
 *   unconfigured  → warning dot, "Connect AI Service" CTA
 *   sso           → avatar initial, user email, plan/usage, sign-out
 *   custom key    → green dot, provider name + model, change-key option
 */
import { useState, useRef, useEffect } from 'react';
import type { SsoSession, ConfiguredProvider } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';
import { postMessage } from '@/components/hooks/useVSCode';

interface AccountBarProps {
  ssoSession: SsoSession | null;
  configuredProviders: ConfiguredProvider[];
  selectedModelId: string | null;
  onOpenOnboarding: () => void;
}

export function AccountBar({
  ssoSession,
  configuredProviders,
  selectedModelId,
  onOpenOnboarding,
}: AccountBarProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const activeProvider = configuredProviders.find((p) => p.enabled !== false && p.apiKey);
  const isConfigured = !!ssoSession || !!activeProvider;

  // --- Unconfigured state ---
  if (!isConfigured) {
    return (
      <button
        onClick={onOpenOnboarding}
        className="flex items-center gap-1 px-2 py-1 text-[11px] rounded bg-[var(--vscode-inputValidation-warningBackground)] text-[var(--vscode-inputValidation-warningForeground)] hover:opacity-90 transition-opacity"
        title={t('accountBar.connectTitle')}
      >
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-yellow)] flex-shrink-0" />
        {t('accountBar.connectCta')}
      </button>
    );
  }

  return (
    <div ref={ref} className="relative">
      {/* Trigger button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 p-1.5 hover:bg-[var(--vscode-list-hoverBackground)] rounded transition-colors"
        title={ssoSession ? ssoSession.user : activeProvider?.name}
      >
        {ssoSession ? (
          <span className="w-5 h-5 rounded-full bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-[10px] flex items-center justify-center font-medium">
            {ssoSession.user[0]?.toUpperCase() ?? 'U'}
          </span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-green)] flex-shrink-0" />
        )}
        <svg className="w-3 h-3 opacity-60" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 neko-glass-dropdown z-50 py-1.5">
          {ssoSession ? (
            <>
              <div className="px-3 py-2 border-b border-[var(--vscode-menu-separatorBackground)]">
                <div className="text-[11px] font-medium truncate">{ssoSession.user}</div>
                {ssoSession.plan && (
                  <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-0.5">
                    {ssoSession.plan}
                    {ssoSession.usage !== undefined &&
                      ` · ${ssoSession.usage.toLocaleString()} tokens`}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  postMessage({ type: 'ssoLogout' });
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
              >
                {t('accountBar.signOut')}
              </button>
            </>
          ) : (
            <>
              <div className="px-3 py-2 border-b border-[var(--vscode-menu-separatorBackground)]">
                <div className="text-[11px] font-medium">{activeProvider?.name}</div>
                {selectedModelId && (
                  <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-0.5 truncate">
                    {selectedModelId}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  postMessage({ type: 'openConfigFile' });
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
              >
                {t('accountBar.changeKey')}
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
