import { describe, expect, it, vi } from 'vitest';
import { SettingsManager } from './settingsManager';

describe('SettingsManager', () => {
  it('projects provider, model, and runtime scalars from the effective workspace snapshot', () => {
    const manager = new SettingsManager({
      getAssistantRuntimeSettingsSnapshot: vi.fn().mockReturnValue({
        selectedProviderId: 'user-provider',
        selectedModelId: 'user-model',
        customSystemPrompt: 'system',
        autoExecuteTools: true,
        streamResponses: true,
        showToolCalls: true,
        temperature: 0.2,
        maxTokens: 4096,
        thinkingBudget: 2048,
        executionMode: 'ask',
      }),
      getEffectiveAgentWorkspaceConfigSnapshot: vi.fn().mockReturnValue({
        providerId: 'workspace-provider',
        modelId: 'workspace-model',
        temperature: 0.55,
        maxTokens: 1024,
        thinkingBudget: 512,
        executionMode: 'auto',
      }),
    } as never);

    expect(manager.selectedProviderId).toBe('workspace-provider');
    expect(manager.selectedModelId).toBe('workspace-model');
    expect(manager.temperature).toBe(0.55);
    expect(manager.maxTokens).toBe(1024);
    expect(manager.thinkingBudget).toBe(512);
    expect(manager.executionMode).toBe('auto');
    expect(manager.customSystemPrompt).toBe('system');
    expect(manager.autoExecuteTools).toBe(true);
  });
});
