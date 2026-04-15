/**
 * AppShell — Root layout and global state container.
 *
 * Responsibilities:
 *   - Global hooks: useConfigState, useResourceState
 *   - Onboarding overlay lifecycle
 *   - Renders Header + ConversationController + OnboardingFlow
 *
 * Extracted from the former 589-line AIAssistant component (ADR P0.1).
 */

import { useEffect, useState } from 'react';
import { Header } from '@/components/Header';
import { OnboardingFlow } from '@/components/OnboardingFlow';
import { useConfigState, useResourceState } from '@/hooks';
import { ConversationController } from './ConversationController';

export function AppShell() {
  const config = useConfigState();
  const resource = useResourceState();

  const {
    settings,
    setSettings,
    setProjectFiles,
    mentionItems,
    setMentionItems,
    pluginCommands,
    setPluginCommands,
    updateSettings,
  } = config;

  const { backgroundTasks, setBackgroundTasks } = resource;

  // Onboarding overlay state
  const [showOnboarding, setShowOnboarding] = useState(false);

  // Auto-show onboarding when no AI service is configured
  const isAiConfigured = !!(
    settings.ssoSession ?? settings.configuredProviders.find((p) => p.enabled !== false && p.apiKey)
  );
  useEffect(() => {
    if (!isAiConfigured) {
      setShowOnboarding(true);
    }
  }, [isAiConfigured]);

  // Auto-dismiss onboarding when AI becomes configured
  useEffect(() => {
    if (isAiConfigured && showOnboarding) {
      setShowOnboarding(false);
    }
  }, [isAiConfigured, showOnboarding]);

  return (
    <div className="flex flex-col h-screen bg-[var(--vscode-sideBar-background,var(--vscode-editor-background))] text-[var(--vscode-foreground)]">
      <ConversationController
        settings={settings}
        setSettings={setSettings}
        setProjectFiles={setProjectFiles}
        mentionItems={mentionItems}
        setMentionItems={setMentionItems}
        pluginCommands={pluginCommands}
        setPluginCommands={setPluginCommands}
        updateSettings={updateSettings}
        backgroundTasks={backgroundTasks}
        setBackgroundTasks={setBackgroundTasks}
        setShowOnboarding={setShowOnboarding}
        renderHeader={(headerProps) => (
          <Header
            {...headerProps}
            ssoSession={settings.ssoSession}
            configuredProviders={settings.configuredProviders}
            selectedModelId={settings.selectedModelId}
            onOpenOnboarding={() => setShowOnboarding(true)}
          />
        )}
      />
      {showOnboarding && <OnboardingFlow onComplete={() => setShowOnboarding(false)} />}
    </div>
  );
}
