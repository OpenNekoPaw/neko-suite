/**
 * AccountBar — replaces the Settings gear button in Header.
 *
 * Three states:
 *   unconfigured  → warning dot, "Connect AI Service" CTA
 *   sso           → avatar initial, user email, plan/usage, sign-out
 *   custom key    → green dot, provider name + model, change-key option
 */
import { useState, useRef, useEffect } from 'react';
import type { SsoSession, ConfiguredProvider } from '@neko-agent/types';
import { useTranslation } from '@/i18n/I18nContext';
import { VSCodeMessages } from '@/messages';
import { ChevronDownIcon } from '@neko/shared/icons';

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
        className="agent-warning-chip"
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
        className={`agent-header-action h-auto w-auto gap-1.5 px-1.5 py-1.5 ${open ? 'is-active' : ''}`}
        title={ssoSession ? ssoSession.user : activeProvider?.name}
      >
        {ssoSession ? (
          <span className="w-5 h-5 rounded-full bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] text-[10px] flex items-center justify-center font-medium">
            {ssoSession.user[0]?.toUpperCase() ?? 'U'}
          </span>
        ) : (
          <span className="w-1.5 h-1.5 rounded-full bg-[var(--vscode-charts-green)] flex-shrink-0" />
        )}
        <ChevronDownIcon className="w-3 h-3 opacity-60" />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="neko-glass-dropdown absolute right-0 top-full z-50 mt-1.5 w-52 py-1.5">
          {ssoSession ? (
            <>
              <div className="border-b border-[var(--agent-divider)] px-3 py-2">
                <div className="text-[11px] font-medium truncate">{ssoSession.user}</div>
                {ssoSession.plan && (
                  <div className="mt-0.5 text-[10px] text-[var(--agent-fg-secondary)]">
                    {ssoSession.plan}
                    {ssoSession.usage !== undefined &&
                      ` · ${ssoSession.usage.toLocaleString()} tokens`}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  VSCodeMessages.ssoLogout();
                }}
                className="vscode-list-item w-full px-3 py-1.5 text-left text-[11px]"
              >
                {t('accountBar.signOut')}
              </button>
            </>
          ) : (
            <>
              <div className="border-b border-[var(--agent-divider)] px-3 py-2">
                <div className="text-[11px] font-medium">{activeProvider?.name}</div>
                {selectedModelId && (
                  <div className="mt-0.5 truncate text-[10px] text-[var(--agent-fg-secondary)]">
                    {selectedModelId}
                  </div>
                )}
              </div>
              <button
                onClick={() => {
                  setOpen(false);
                  VSCodeMessages.openConfigFile();
                }}
                className="vscode-list-item w-full px-3 py-1.5 text-left text-[11px]"
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
