/**
 * OnboardingFlow — full-screen overlay for first-time AI service setup.
 *
 * Path A: SSO login (opens OAuth in browser)
 * Path B: Custom API Key (select provider → enter key → test → done)
 *
 * Closes when onComplete() is called.
 */
import { useState } from 'react';
import type { ProviderTemplateInfo } from '@/components/types';
import { useTranslation } from '@/i18n/I18nContext';
import { postMessage } from '@/components/hooks/useVSCode';

type Step = 'choose' | 'selectProvider' | 'enterKey';

interface OnboardingFlowProps {
  providerTemplates: ProviderTemplateInfo[];
  onComplete: () => void;
}

export function OnboardingFlow({ providerTemplates, onComplete }: OnboardingFlowProps) {
  const { t } = useTranslation();
  const [step, setStep] = useState<Step>('choose');
  const [selectedTemplate, setSelectedTemplate] = useState<ProviderTemplateInfo | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [testing, setTesting] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);

  const handleSsoLogin = () => {
    postMessage({ type: 'ssoLogin' });
    // Flow closes when extension sends back 'ssoSessionChanged'
  };

  const handleSelectProvider = (template: ProviderTemplateInfo) => {
    setSelectedTemplate(template);
    setApiKey('');
    setTestError(null);
    setStep('enterKey');
  };

  const handleTestAndSave = () => {
    if (!selectedTemplate || !apiKey.trim()) return;
    setTesting(true);
    setTestError(null);

    // Add provider first
    postMessage({
      type: 'updateProvider',
      provider: {
        id: selectedTemplate.id,
        type: selectedTemplate.type,
        name: selectedTemplate.displayName,
        apiKey: apiKey.trim(),
        baseUrl: selectedTemplate.apiUrl || undefined,
        enabled: true,
        builtin: true,
      },
    });

    // Then validate
    const requestId = `onboarding-${Date.now()}`;
    postMessage({ type: 'validateApiKey', providerId: selectedTemplate.id, requestId });

    // Listen for result
    const handler = (event: MessageEvent) => {
      const msg = event.data as { type: string; requestId: string; valid: boolean; error?: string };
      if (msg.type === 'validateApiKeyResult' && msg.requestId === requestId) {
        window.removeEventListener('message', handler);
        setTesting(false);
        if (msg.valid) {
          onComplete();
        } else {
          setTestError(msg.error ?? t('onboarding.testFailed'));
        }
      }
    };
    window.addEventListener('message', handler);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[var(--vscode-editor-background)]/90 backdrop-blur-sm">
      <div className="w-80 bg-[var(--vscode-panel-background)] border border-[var(--vscode-panel-border)] rounded-lg shadow-xl p-6">

        {/* Step: choose */}
        {step === 'choose' && (
          <>
            <h2 className="text-[13px] font-semibold mb-1">{t('onboarding.title')}</h2>
            <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-5">
              {t('onboarding.subtitle')}
            </p>
            <button
              onClick={handleSsoLogin}
              className="w-full py-2 mb-3 text-[12px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] transition-colors"
            >
              {t('onboarding.ssoButton')}
            </button>
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
              <span className="text-[10px] text-[var(--vscode-descriptionForeground)]">{t('onboarding.or')}</span>
              <div className="flex-1 h-px bg-[var(--vscode-panel-border)]" />
            </div>
            <button
              onClick={() => setStep('selectProvider')}
              className="w-full py-2 text-[12px] rounded border border-[var(--vscode-button-border,var(--vscode-panel-border))] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors"
            >
              {t('onboarding.customKeyButton')}
            </button>
          </>
        )}

        {/* Step: select provider */}
        {step === 'selectProvider' && (
          <>
            <button
              onClick={() => setStep('choose')}
              className="text-[11px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] mb-3 flex items-center gap-1"
            >
              ← {t('onboarding.back')}
            </button>
            <h2 className="text-[13px] font-semibold mb-4">{t('onboarding.selectProvider')}</h2>
            <div className="flex flex-col gap-2">
              {providerTemplates.map(template => (
                <button
                  key={template.id}
                  onClick={() => handleSelectProvider(template)}
                  className="w-full text-left px-3 py-2 rounded border border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors text-[12px]"
                >
                  {template.displayName}
                </button>
              ))}
            </div>
          </>
        )}

        {/* Step: enter key */}
        {step === 'enterKey' && selectedTemplate && (
          <>
            <button
              onClick={() => setStep('selectProvider')}
              className="text-[11px] text-[var(--vscode-descriptionForeground)] hover:text-[var(--vscode-foreground)] mb-3 flex items-center gap-1"
            >
              ← {t('onboarding.back')}
            </button>
            <h2 className="text-[13px] font-semibold mb-1">{selectedTemplate.displayName}</h2>
            <p className="text-[11px] text-[var(--vscode-descriptionForeground)] mb-4">
              {t('onboarding.enterKey')}
            </p>
            <input
              type="password"
              value={apiKey}
              onChange={e => { setApiKey(e.target.value); setTestError(null); }}
              placeholder="sk-..."
              className="w-full px-2 py-1.5 text-[12px] rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-input-background)] text-[var(--vscode-input-foreground)] mb-2 outline-none focus:border-[var(--vscode-focusBorder)]"
            />
            {testError && (
              <p className="text-[11px] text-[var(--vscode-inputValidation-errorForeground)] mb-2">{testError}</p>
            )}
            <button
              onClick={handleTestAndSave}
              disabled={!apiKey.trim() || testing}
              className="w-full py-2 text-[12px] rounded bg-[var(--vscode-button-background)] text-[var(--vscode-button-foreground)] hover:bg-[var(--vscode-button-hoverBackground)] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {testing ? t('onboarding.testing') : t('onboarding.testAndStart')}
            </button>
          </>
        )}

      </div>
    </div>
  );
}
