# neko-agent Settings Redesign Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the SettingsView tab with a lightweight AccountBar (in Header) and OnboardingFlow (first-run overlay) for video creator users.

**Architecture:** Delete the 6-file SettingsView; add `AccountBar` component to Header right side; add `OnboardingFlow` overlay that appears when no AI service is configured. SSO login and custom API Key are the two supported auth paths. MCP moves to `.neko/settings.json` file config.

**Tech Stack:** React 18, TypeScript, Tailwind CSS (VSCode CSS vars), Vitest, `postMessage` ↔ ConfigBridge

---

## Reference Files

- Design doc: `docs/plans/2026-03-07-neko-agent-settings-redesign-design.md`
- Root component: `packages/neko-agent/packages/webview/src/components/index.tsx`
- Types: `packages/neko-agent/packages/webview/src/components/types.ts`
- Header: `packages/neko-agent/packages/webview/src/components/Header/index.tsx`
- ConfigBridge: `packages/neko-agent/packages/extension/src/services/configBridge.ts`
- useConfigState: `packages/neko-agent/packages/webview/src/hooks/useConfigState.ts`
- Types test: `packages/neko-agent/packages/webview/src/components/__tests__/types.test.ts`

## Test Commands

```bash
# Run webview unit tests
cd packages/neko-agent/packages/webview && npx vitest run

# TypeScript check (webview)
cd packages/neko-agent/packages/webview && npx tsc --noEmit

# TypeScript check (extension)
cd packages/neko-agent/packages/extension && npx tsc --noEmit
```

---

## Task 1: Update types.ts — remove SettingsSubTab, add SsoSession

**Files:**
- Modify: `packages/neko-agent/packages/webview/src/components/types.ts`

**Step 1: Edit types.ts**

Make these changes:

1. Change `TabType` — remove `'settings'`:
```typescript
// Before
export type TabType = 'chat' | 'settings' | 'tasks' | 'agents';

// After
export type TabType = 'chat' | 'tasks' | 'agents';
```

2. Remove the `SettingsSubTab` line entirely:
```typescript
// Delete this line:
export type SettingsSubTab = 'provider' | 'mcp' | 'models' | 'skills';
```

3. Add `SsoSession` type before `SettingsState`:
```typescript
export interface SsoSession {
  /** Display name or email */
  user: string;
  /** Plan tier, e.g. 'Pro' */
  plan?: string;
  /** Token usage this period */
  usage?: number;
}
```

4. Add `ssoSession` field to `SettingsState` (after `chatModelOptions`):
```typescript
  chatModelOptions: Array<import('@neko/shared').ChatModelOption>;
  // SSO session info (null when using custom key or not logged in)
  ssoSession: SsoSession | null;
```

**Step 2: Run typecheck**

```bash
cd packages/neko-agent/packages/webview && npx tsc --noEmit
```

Expected: errors about `SettingsSubTab` usages and `ssoSession` missing from `DEFAULT_SETTINGS` — these are fixed in later tasks.

**Step 3: Commit**

```bash
git add packages/neko-agent/packages/webview/src/components/types.ts
git commit -m "refactor(neko-agent): remove SettingsSubTab type, add SsoSession to types"
```

---

## Task 2: Update types.test.ts — remove SettingsSubTab test, add SsoSession test

**Files:**
- Modify: `packages/neko-agent/packages/webview/src/components/__tests__/types.test.ts`

**Step 1: Edit the test file**

1. Remove `SettingsSubTab` from the import:
```typescript
// Before
import type {
  ...
  TabType,
  SettingsSubTab,
  ...
} from '../types';

// After
import type {
  ...
  TabType,
  SsoSession,
  ...
} from '../types';
```

2. Replace the `TabType and SettingsSubTab` describe block:
```typescript
// Before
describe('TabType and SettingsSubTab', () => {
  it('should accept valid tab types', () => {
    const tabTypes: TabType[] = ['chat', 'settings', 'tasks'];
    tabTypes.forEach((type) => {
      expect(['chat', 'settings', 'tasks']).toContain(type);
    });
  });

  it('should accept valid settings sub tabs', () => {
    const subTabs: SettingsSubTab[] = ['provider', 'mcp', 'models', 'skills'];
    subTabs.forEach((tab) => {
      expect(['provider', 'mcp', 'models', 'skills']).toContain(tab);
    });
  });
});

// After
describe('TabType', () => {
  it('should accept valid tab types', () => {
    const tabTypes: TabType[] = ['chat', 'tasks', 'agents'];
    tabTypes.forEach((type) => {
      expect(['chat', 'tasks', 'agents']).toContain(type);
    });
  });
});

describe('SsoSession type', () => {
  it('should accept full SSO session', () => {
    const session: SsoSession = {
      user: 'user@studio.com',
      plan: 'Pro',
      usage: 12400,
    };
    expect(session.user).toBe('user@studio.com');
    expect(session.plan).toBe('Pro');
    expect(session.usage).toBe(12400);
  });

  it('should accept minimal SSO session', () => {
    const session: SsoSession = { user: 'user@example.com' };
    expect(session.plan).toBeUndefined();
    expect(session.usage).toBeUndefined();
  });
});
```

3. In the `SettingsState` test, add `ssoSession: null` to both test objects:
```typescript
// Add to both valid settings state objects:
ssoSession: null,
```

**Step 2: Run tests**

```bash
cd packages/neko-agent/packages/webview && npx vitest run
```

Expected: tests in types.test.ts pass. Other test failures may appear due to later changes — those are fixed in subsequent tasks.

**Step 3: Commit**

```bash
git add packages/neko-agent/packages/webview/src/components/__tests__/types.test.ts
git commit -m "test(neko-agent): update types tests for new TabType and SsoSession"
```

---

## Task 3: Update useConfigState — add ssoSession, remove UIModelConfig import

**Files:**
- Modify: `packages/neko-agent/packages/webview/src/hooks/useConfigState.ts`

**Step 1: Edit useConfigState.ts**

1. Remove the `UIModelConfig` import (it comes from SettingsView which we're deleting):
```typescript
// Delete this line:
import type { UIModelConfig } from '@/components/SettingsView/ModelSettings';
```

2. Update `DEFAULT_SETTINGS` to include `ssoSession`:
```typescript
export const DEFAULT_SETTINGS: SettingsState = {
  // ... all existing fields ...
  chatModelOptions: [],
  ssoSession: null,   // ADD THIS
};
```

3. In `ConfigState` interface, remove `modelPresets: UIModelConfig[]` and replace with:
```typescript
export interface ConfigState {
  settings: SettingsState;
  projectFiles: ProjectFileInfo[];
}
```

4. In the hook return value, remove `modelPresets` and `setModelPresets`. Check if `modelPresets` is used elsewhere (it feeds `ModelSettings` which is being deleted). Remove its `useState` and return it from the hook.

**Step 2: Run typecheck**

```bash
cd packages/neko-agent/packages/webview && npx tsc --noEmit
```

Expected: errors about `modelPresets` usages in `index.tsx` — fixed in Task 8.

**Step 3: Commit**

```bash
git add packages/neko-agent/packages/webview/src/hooks/useConfigState.ts
git commit -m "refactor(neko-agent): remove UIModelConfig dep and add ssoSession to config state"
```

---

## Task 4: Delete SettingsView files

**Files:**
- Delete: `packages/neko-agent/packages/webview/src/components/SettingsView/index.tsx`
- Delete: `packages/neko-agent/packages/webview/src/components/SettingsView/ProviderSettings.tsx`
- Delete: `packages/neko-agent/packages/webview/src/components/SettingsView/MCPSettings.tsx`
- Delete: `packages/neko-agent/packages/webview/src/components/SettingsView/ModelSettings.tsx`
- Delete: `packages/neko-agent/packages/webview/src/components/SettingsView/SkillSettings.tsx`
- Delete: `packages/neko-agent/packages/webview/src/components/SettingsView/SkillContentEditor.tsx`
- Delete: `packages/neko-agent/packages/webview/src/components/SettingsView/README.md`

**Step 1: Delete the files**

```bash
rm -rf packages/neko-agent/packages/webview/src/components/SettingsView
```

**Step 2: Commit**

```bash
git add -A packages/neko-agent/packages/webview/src/components/SettingsView
git commit -m "refactor(neko-agent): delete SettingsView — replaced by AccountBar + OnboardingFlow"
```

---

## Task 5: Create AccountBar component

**Files:**
- Create: `packages/neko-agent/packages/webview/src/components/AccountBar/index.tsx`

**Step 1: Create the component**

```typescript
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

  const activeProvider = configuredProviders.find(p => p.enabled !== false && p.apiKey);
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
        onClick={() => setOpen(v => !v)}
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
        <div className="absolute right-0 top-full mt-1 w-52 bg-[var(--vscode-menu-background)] border border-[var(--vscode-menu-border)] rounded shadow-lg z-50 py-1">
          {ssoSession ? (
            <>
              <div className="px-3 py-2 border-b border-[var(--vscode-menu-separatorBackground)]">
                <div className="text-[11px] font-medium truncate">{ssoSession.user}</div>
                {ssoSession.plan && (
                  <div className="text-[10px] text-[var(--vscode-descriptionForeground)] mt-0.5">
                    {ssoSession.plan}
                    {ssoSession.usage !== undefined && ` · ${ssoSession.usage.toLocaleString()} tokens`}
                  </div>
                )}
              </div>
              <button
                onClick={() => { setOpen(false); postMessage({ type: 'ssoLogout' }); }}
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
                onClick={() => { setOpen(false); onOpenOnboarding(); }}
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
```

**Step 2: Typecheck**

```bash
cd packages/neko-agent/packages/webview && npx tsc --noEmit 2>&1 | grep AccountBar
```

Expected: no errors for AccountBar itself (other errors from still-missing updates are OK).

**Step 3: Commit**

```bash
git add packages/neko-agent/packages/webview/src/components/AccountBar/
git commit -m "feat(neko-agent): add AccountBar component to replace settings gear"
```

---

## Task 6: Create OnboardingFlow component

**Files:**
- Create: `packages/neko-agent/packages/webview/src/components/OnboardingFlow/index.tsx`

**Step 1: Create the component**

```typescript
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

  const handleTestAndSave = async () => {
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
      const msg = event.data;
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
              {providerTemplates.map(t => (
                <button
                  key={t.id}
                  onClick={() => handleSelectProvider(t)}
                  className="w-full text-left px-3 py-2 rounded border border-[var(--vscode-panel-border)] hover:bg-[var(--vscode-list-hoverBackground)] transition-colors text-[12px]"
                >
                  {t.displayName}
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
```

**Step 2: Typecheck**

```bash
cd packages/neko-agent/packages/webview && npx tsc --noEmit 2>&1 | grep OnboardingFlow
```

Expected: no errors for OnboardingFlow itself.

**Step 3: Commit**

```bash
git add packages/neko-agent/packages/webview/src/components/OnboardingFlow/
git commit -m "feat(neko-agent): add OnboardingFlow component for first-run AI service setup"
```

---

## Task 7: Update Header — remove onToggleSettings, add AccountBar

**Files:**
- Modify: `packages/neko-agent/packages/webview/src/components/Header/index.tsx`

**Step 1: Edit Header**

1. Add imports:
```typescript
import { AccountBar } from '@/components/AccountBar';
import type { SsoSession, ConfiguredProvider } from '@/components/types';
```

2. Update `HeaderProps` — remove `onToggleSettings`, add AccountBar props:
```typescript
interface HeaderProps {
  tabs: OpenTab[];
  activeTabId: string | null;
  activeView: TabType;
  conversations: ConversationSummary[];
  activeConversationId: string | null;
  activeTasksCount?: number;
  activeAgentsCount?: number;
  onSwitchTab: (tabId: string) => void;
  onCloseTab: (tabId: string, e?: React.MouseEvent) => void;
  onNewChat: () => void;
  onOpenConversation: (conversationId: string, title: string) => void;
  onDeleteConversation: (conversationId: string) => void;
  onClearAllConversations?: () => void;
  onToggleTasks?: () => void;
  onToggleAgents?: () => void;
  // AccountBar props
  ssoSession: SsoSession | null;
  configuredProviders: ConfiguredProvider[];
  selectedModelId: string | null;
  onOpenOnboarding: () => void;
}
```

3. Update the function signature to remove `onToggleSettings` and add new props.

4. Replace the gear button section with `<AccountBar>`:
```typescript
{/* AccountBar — replaces gear button */}
<AccountBar
  ssoSession={ssoSession}
  configuredProviders={configuredProviders}
  selectedModelId={selectedModelId}
  onOpenOnboarding={onOpenOnboarding}
/>
```

**Step 2: Typecheck**

```bash
cd packages/neko-agent/packages/webview && npx tsc --noEmit 2>&1 | grep -i header
```

Expected: errors in `index.tsx` about missing new props — fixed in Task 8.

**Step 3: Commit**

```bash
git add packages/neko-agent/packages/webview/src/components/Header/
git commit -m "feat(neko-agent): replace settings gear with AccountBar in Header"
```

---

## Task 8: Update AIAssistant root component (index.tsx)

**Files:**
- Modify: `packages/neko-agent/packages/webview/src/components/index.tsx`

This is the largest change. Read the full file before editing.

**Step 1: Update imports**

Remove:
```typescript
import { SettingsView } from '@/components/SettingsView';
import { ConfiguredMCPServer, ConfiguredProvider } from '@/components/types';
```

Add:
```typescript
import { ConfiguredProvider } from '@/components/types';
import { OnboardingFlow } from '@/components/OnboardingFlow';
```

**Step 2: Remove settings-related state and handlers**

Remove the keyboard shortcut for settings:
```typescript
// Delete:
COMMON_SHORTCUTS.settings(() => {
  setActiveTab(activeTab === 'settings' ? 'chat' : 'settings');
}),
```

Remove all handler callbacks that reference SettingsView props (onAddProvider, onRemoveProvider, onToggleProvider, onUpdateProviders, onDeleteProvider, onAddModel, onUpdateModel, onDeleteModel, onUpdateMCPServers, onDeleteMCPServer, onTestMCPServer, onConfigureModel, onToggleModel, onRemoveModelConfig, onExportConfig, onImportConfig, onAddCustomModel, onUpdateSkill, onDeleteSkill, onUpdateCommand, onDeleteCommand, onDuplicateSkill, onDuplicateCommand, onCreateSkill, onUpdateToolSkill).

Remove `modelPresets` and `setModelPresets` from the `config` destructure (removed from hook in Task 3).

**Step 3: Add onboarding state**

```typescript
const [showOnboarding, setShowOnboarding] = useState(false);

// Show onboarding if not configured and not already open
const isAiConfigured = !!(settings.ssoSession || settings.configuredProviders.find(p => p.enabled !== false && p.apiKey));
useEffect(() => {
  if (!isAiConfigured) {
    setShowOnboarding(true);
  }
}, [isAiConfigured]);
```

**Step 4: Handle ssoSessionChanged message**

In the mount effect or message handler, handle `ssoSessionChanged`:
```typescript
case 'ssoSessionChanged':
  updateSettings({ ssoSession: message.session ?? null });
  setShowOnboarding(false);
  break;
```

**Step 5: Update Header props**

```typescript
<Header
  tabs={openTabs}
  activeTabId={activeTabId}
  activeView={activeTab}
  conversations={conversations}
  activeConversationId={activeConversationId}
  activeTasksCount={backgroundTasks.filter(t => t.status === 'running').length}
  onSwitchTab={...}
  onCloseTab={...}
  onNewChat={...}
  onOpenConversation={...}
  onDeleteConversation={...}
  onClearAllConversations={...}
  onToggleTasks={...}
  onToggleAgents={...}
  ssoSession={settings.ssoSession}
  configuredProviders={settings.configuredProviders}
  selectedModelId={settings.selectedModelId}
  onOpenOnboarding={() => setShowOnboarding(true)}
/>
```

**Step 6: Remove SettingsView render block**

Find and delete:
```typescript
{activeTab === 'settings' && (
  <SettingsView
    settings={settings}
    ...
  />
)}
```

**Step 7: Add OnboardingFlow**

Add before the closing div of the root element:
```typescript
{showOnboarding && (
  <OnboardingFlow
    providerTemplates={settings.providerTemplates}
    onComplete={() => setShowOnboarding(false)}
  />
)}
```

**Step 8: Typecheck**

```bash
cd packages/neko-agent/packages/webview && npx tsc --noEmit
```

Expected: clean (or only pre-existing errors in unrelated files).

**Step 9: Commit**

```bash
git add packages/neko-agent/packages/webview/src/components/index.tsx
git commit -m "feat(neko-agent): wire AccountBar and OnboardingFlow into root component"
```

---

## Task 9: Remove MCP/Skill CRUD from ConfigBridge

**Files:**
- Modify: `packages/neko-agent/packages/extension/src/services/configBridge.ts`

**Step 1: Remove unused message handlers**

In `handleMessage()`, remove these `case` blocks entirely:
- `'updateMCPServer'`
- `'deleteMCPServer'`
- `'createSkill'`
- `'updateSkill'`
- `'deleteSkill'`
- `'duplicateSkill'`
- `'updateCommand'`
- `'deleteCommand'`
- `'updateToolSkill'`

Keep: `getConfig`, `getConfigWithStatus`, `getSkills`, `getHooks`, `getConnectionStates`, `getToolSkills`, `updateProvider`, `updateModel`, `deleteProvider`, `deleteModel`, `updatePrompt`, `deletePrompt`, `listProviderModels`, `validateApiKey`.

**Step 2: Handle ssoLogin / ssoLogout messages**

These are forwarded from the Webview but handled at a higher level (the extension's activation). Add stubs that return `false` (not handled) so they fall through to other handlers:

No change needed — `default: return false` already handles unknown message types.

**Step 3: Typecheck (extension)**

```bash
cd packages/neko-agent/packages/extension && npx tsc --noEmit
```

Expected: clean.

**Step 4: Commit**

```bash
git add packages/neko-agent/packages/extension/src/services/configBridge.ts
git commit -m "refactor(neko-agent): remove MCP/Skill CRUD handlers from ConfigBridge"
```

---

## Task 10: Add i18n keys

**Files:**
- Modify: `packages/neko-agent/l10n/bundle.l10n.json`
- Modify: `packages/neko-agent/l10n/bundle.l10n.zh-cn.json`

**Step 1: Read existing i18n files to understand format**

```bash
cat packages/neko-agent/l10n/bundle.l10n.json | head -30
```

**Step 2: Add keys to bundle.l10n.json (English base)**

Add these entries:
```json
"accountBar.connectTitle": "Connect an AI service to get started",
"accountBar.connectCta": "Connect AI Service",
"accountBar.signOut": "Sign out",
"accountBar.changeKey": "Change API Key",
"onboarding.title": "Connect AI Service",
"onboarding.subtitle": "Choose how you want to connect",
"onboarding.ssoButton": "Sign in with Studio account",
"onboarding.or": "or",
"onboarding.customKeyButton": "Use a custom API Key",
"onboarding.back": "Back",
"onboarding.selectProvider": "Select AI service",
"onboarding.enterKey": "Enter your API Key",
"onboarding.testing": "Testing connection...",
"onboarding.testAndStart": "Test & Get Started",
"onboarding.testFailed": "Connection failed. Check your key and try again."
```

**Step 3: Add Chinese translations to bundle.l10n.zh-cn.json**

```json
"accountBar.connectTitle": "连接 AI 服务以开始使用",
"accountBar.connectCta": "连接 AI 服务",
"accountBar.signOut": "退出登录",
"accountBar.changeKey": "更改 API Key",
"onboarding.title": "连接 AI 服务",
"onboarding.subtitle": "选择连接方式",
"onboarding.ssoButton": "使用 Studio 账号登录",
"onboarding.or": "或",
"onboarding.customKeyButton": "使用自定义 API Key",
"onboarding.back": "返回",
"onboarding.selectProvider": "选择 AI 服务",
"onboarding.enterKey": "输入 API Key",
"onboarding.testing": "测试连接中...",
"onboarding.testAndStart": "测试并开始使用",
"onboarding.testFailed": "连接失败，请检查 Key 后重试"
```

**Step 4: Run tests**

```bash
cd packages/neko-agent/packages/webview && npx vitest run
```

Expected: all pass.

**Step 5: Commit**

```bash
git add packages/neko-agent/l10n/
git commit -m "feat(neko-agent): add i18n keys for AccountBar and OnboardingFlow"
```

---

## Task 11: Final verification

**Step 1: Full typecheck**

```bash
cd packages/neko-agent/packages/webview && npx tsc --noEmit
cd packages/neko-agent/packages/extension && npx tsc --noEmit
```

Expected: clean (pre-existing errors in neko-assets/neko-client are acceptable — filter by filename).

**Step 2: Run all webview tests**

```bash
cd packages/neko-agent/packages/webview && npx vitest run
```

Expected: all pass.

**Step 3: Search for remaining references to deleted symbols**

```bash
grep -r "SettingsView\|SettingsSubTab\|onToggleSettings" \
  packages/neko-agent/packages/webview/src \
  packages/neko-agent/packages/extension/src
```

Expected: no results.

**Step 4: Final commit if any cleanup needed**

```bash
git add -A
git commit -m "chore(neko-agent): final cleanup after settings redesign"
```
