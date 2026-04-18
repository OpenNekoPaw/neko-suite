import { describe, expect, it } from 'vitest';
import {
  readWorkflowSettings,
  WORKFLOW_SETTING_DEFAULTS,
  WORKFLOW_SETTING_KEYS,
} from '../workflow-settings';

function fakeConfig(values: Record<string, unknown>): (() => unknown) & { get: unknown } {
  // Build a minimal getConfiguration override compatible with the helper.
  const getConfiguration = (_section: string): { get: <T>(key: string, fallback: T) => T } => ({
    get: <T>(key: string, fallback: T): T => {
      if (key in values) return values[key] as T;
      return fallback;
    },
  });
  // Cast to the shape readWorkflowSettings expects; the real vscode.d.ts
  // returns a WorkspaceConfiguration with many more methods, but we only
  // use `.get`.
  return getConfiguration as never;
}

describe('readWorkflowSettings', () => {
  it('returns defaults when nothing is configured', () => {
    const settings = readWorkflowSettings({ getConfiguration: fakeConfig({}) });
    expect(settings.orchestratorEnabled).toBe(WORKFLOW_SETTING_DEFAULTS.orchestratorEnabled);
    expect(settings.routerLlmEnabled).toBe(WORKFLOW_SETTING_DEFAULTS.routerLlmEnabled);
    expect(settings.routerLlmBudgetMs).toBe(WORKFLOW_SETTING_DEFAULTS.routerLlmBudgetMs);
    expect(settings.routerAskTimeoutMs).toBe(WORKFLOW_SETTING_DEFAULTS.routerAskTimeoutMs);
    expect(settings.planAutoApproveThreshold).toBe(
      WORKFLOW_SETTING_DEFAULTS.planAutoApproveThreshold,
    );
    expect(settings.consistencyEnabled).toBe(WORKFLOW_SETTING_DEFAULTS.consistencyEnabled);
    expect(settings.matchingContinuityEnabled).toBe(
      WORKFLOW_SETTING_DEFAULTS.matchingContinuityEnabled,
    );
    expect(settings.matchingSemanticEnabled).toBe(
      WORKFLOW_SETTING_DEFAULTS.matchingSemanticEnabled,
    );
    expect(settings.matchingLlmEnabled).toBe(WORKFLOW_SETTING_DEFAULTS.matchingLlmEnabled);
  });

  it('phase-4 matcher flags default off and can be flipped', () => {
    const on = readWorkflowSettings({
      getConfiguration: fakeConfig({
        [WORKFLOW_SETTING_KEYS.matchingSemanticEnabled]: true,
        [WORKFLOW_SETTING_KEYS.matchingLlmEnabled]: true,
      }),
    });
    expect(on.matchingSemanticEnabled).toBe(true);
    expect(on.matchingLlmEnabled).toBe(true);
  });

  it('reflects user overrides', () => {
    const settings = readWorkflowSettings({
      getConfiguration: fakeConfig({
        [WORKFLOW_SETTING_KEYS.orchestratorEnabled]: true,
        [WORKFLOW_SETTING_KEYS.routerLlmEnabled]: true,
        [WORKFLOW_SETTING_KEYS.planAutoApproveThreshold]: 0.95,
        [WORKFLOW_SETTING_KEYS.matchingContinuityEnabled]: false,
      }),
    });
    expect(settings.orchestratorEnabled).toBe(true);
    expect(settings.routerLlmEnabled).toBe(true);
    expect(settings.planAutoApproveThreshold).toBe(0.95);
    expect(settings.matchingContinuityEnabled).toBe(false);
  });

  it('clamps router budget to [250, 60000]', () => {
    const low = readWorkflowSettings({
      getConfiguration: fakeConfig({ [WORKFLOW_SETTING_KEYS.routerLlmBudgetMs]: 10 }),
    });
    expect(low.routerLlmBudgetMs).toBe(250);
    const high = readWorkflowSettings({
      getConfiguration: fakeConfig({ [WORKFLOW_SETTING_KEYS.routerLlmBudgetMs]: 999_999 }),
    });
    expect(high.routerLlmBudgetMs).toBe(60_000);
  });

  it('falls back to default when router budget is NaN', () => {
    const settings = readWorkflowSettings({
      getConfiguration: fakeConfig({ [WORKFLOW_SETTING_KEYS.routerLlmBudgetMs]: NaN }),
    });
    expect(settings.routerLlmBudgetMs).toBe(WORKFLOW_SETTING_DEFAULTS.routerLlmBudgetMs);
  });

  it('clamps autoApproveThreshold to [0, 1.1]', () => {
    const neg = readWorkflowSettings({
      getConfiguration: fakeConfig({ [WORKFLOW_SETTING_KEYS.planAutoApproveThreshold]: -0.5 }),
    });
    expect(neg.planAutoApproveThreshold).toBe(0);
    const high = readWorkflowSettings({
      getConfiguration: fakeConfig({ [WORKFLOW_SETTING_KEYS.planAutoApproveThreshold]: 5 }),
    });
    expect(high.planAutoApproveThreshold).toBe(1.1);
  });

  it('accepts 0.95 as a realistic auto-approve threshold', () => {
    const settings = readWorkflowSettings({
      getConfiguration: fakeConfig({ [WORKFLOW_SETTING_KEYS.planAutoApproveThreshold]: 0.95 }),
    });
    expect(settings.planAutoApproveThreshold).toBe(0.95);
  });

  it('clamps askTimeoutMs to [1000, 600000]', () => {
    const low = readWorkflowSettings({
      getConfiguration: fakeConfig({ [WORKFLOW_SETTING_KEYS.routerAskTimeoutMs]: 100 }),
    });
    expect(low.routerAskTimeoutMs).toBe(1000);
  });
});
