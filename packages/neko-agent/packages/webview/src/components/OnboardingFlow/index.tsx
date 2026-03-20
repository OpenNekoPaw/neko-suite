/**
 * OnboardingFlow — full-screen overlay for first-time AI service setup.
 *
 * Path A: SSO login (opens OAuth in browser)
 * Path B: Open config file (user adds API key manually; extension auto-detects changes)
 *
 * Closes when onComplete() is called or when isAiConfigured becomes true (auto-dismiss
 * handled by the parent via onComplete).
 */
import { useState } from 'react';
import { useTranslation } from '@/i18n/I18nContext';
import { postMessage } from '@/components/hooks/useVSCode';

type Step = 'choose' | 'fileOpened';

interface OnboardingFlowProps {
  onComplete: () => void;
}

export function OnboardingFlow({ onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('choose');

  const handleSsoLogin = () => {
    postMessage({ type: 'ssoLogin' });
    // Flow closes when extension sends back 'ssoSessionChanged'
  };

  const handleOpenConfigFile = () => {
    postMessage({ type: 'openUserConfigFile' });
    setStep('fileOpened');
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--vscode-editor-background)]/90 backdrop-blur-sm">
      <div className="w-80 neko-float-card">
        {/* Animated gradient accent bar */}
        <div className="neko-gradient-bar" />

        <div className="p-6">
          {/* Step: choose */}
          {step === 'choose' && (
            <>
              <h2 className="text-[13px] font-semibold mb-1">{t('onboarding.title')}</h2>
              <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-5">
                {t('onboarding.subtitle')}
              </p>
              <button
                onClick={handleSsoLogin}
                className="w-full py-2 mb-3 text-[12px] rounded-lg bg-gradient-to-r from-[var(--vscode-charts-blue,#0e63c8)] to-[var(--vscode-charts-purple,#6b3fa0)] text-white hover:opacity-90 transition-opacity font-medium"
              >
                {t('onboarding.ssoButton')}
              </button>
              <div className="flex items-center gap-2 mb-3">
                <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
                <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">
                  {t('onboarding.or')}
                </span>
                <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
              </div>
              <button
                onClick={handleOpenConfigFile}
                className="w-full py-2 text-[12px] rounded-lg border border-[var(--vscode-button-border,var(--vscode-panel-border))] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
              >
                {t('onboarding.openConfigButton')}
              </button>
            </>
          )}

          {/* Step: fileOpened */}
          {step === 'fileOpened' && (
            <>
              <h2 className="text-[13px] font-semibold mb-3">{t('onboarding.fileOpenedTitle')}</h2>
              <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-5">
                {t('onboarding.fileOpenedHint')}
              </p>
              <button
                onClick={onComplete}
                className="w-full py-2 text-[12px] rounded-lg bg-gradient-to-r from-[var(--vscode-charts-blue,#0e63c8)] to-[var(--vscode-charts-purple,#6b3fa0)] text-white hover:opacity-90 transition-opacity font-medium"
              >
                {t('onboarding.gotIt')}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
