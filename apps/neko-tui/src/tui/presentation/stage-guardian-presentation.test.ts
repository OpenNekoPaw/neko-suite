import { describe, expect, it } from 'vitest';
import { createTestAgentTerminalPresentation } from './testing';
import { presentStageGuardianIssue } from './stage-guardian-presentation';

describe('StageGuardian presentation', () => {
  it('localizes Neko-owned guidance while preserving the diagnostic code', () => {
    const issue = {
      code: 'stage-out-of-order',
      stage: 'apply',
      at: 1,
    } as const;

    expect(presentStageGuardianIssue(issue, createTestAgentTerminalPresentation('en'))).toBe(
      '[stage-out-of-order] Entered Apply without visiting Draft / Plan first; high-risk tool calls should traverse the earlier stages per ADR §3.2.',
    );
    expect(presentStageGuardianIssue(issue, createTestAgentTerminalPresentation('zh-cn'))).toBe(
      '[stage-out-of-order] 未先进入 Draft / Plan 就进入了 Apply；高风险工具调用应按 ADR §3.2 先经过前置阶段。',
    );
  });

  it('keeps semantic values unchanged in localized timeout and approval diagnostics', () => {
    expect(
      presentStageGuardianIssue(
        {
          code: 'stage-timeout',
          stage: 'plan',
          at: 2,
          detail: { elapsedMs: 2500, budgetMs: 1000 },
        },
        createTestAgentTerminalPresentation('zh-cn'),
      ),
    ).toBe('[stage-timeout] 阶段“plan”已持续 2500 毫秒，超过 1000 毫秒预算。');

    expect(
      presentStageGuardianIssue(
        {
          code: 'approval-skipped',
          stage: 'apply',
          at: 3,
          detail: { subject: 'tool:write_file' },
        },
        createTestAgentTerminalPresentation('zh-cn'),
      ),
    ).toBe('[approval-skipped] 主题“tool:write_file”的 Apply 未经先前审批决策即已提交。');
  });
});
