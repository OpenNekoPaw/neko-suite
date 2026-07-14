import type { StageGuardianIssue } from '@neko/agent/skill';
import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalMessageKey } from './terminal-messages';

export function presentStageGuardianIssue(
  issue: StageGuardianIssue,
  context: AgentTerminalPresentationContext<AgentTerminalMessageKey>,
): string {
  switch (issue.code) {
    case 'stage-out-of-order':
      return context.t('agent.terminal.stageGuardian.stageOutOfOrder', { code: issue.code });
    case 'stage-timeout':
      return context.t('agent.terminal.stageGuardian.stageTimeout', {
        budgetMs: issue.detail.budgetMs,
        code: issue.code,
        elapsedMs: issue.detail.elapsedMs,
        stage: issue.stage,
      });
    case 'approval-skipped':
      return context.t('agent.terminal.stageGuardian.approvalSkipped', {
        code: issue.code,
        subject: issue.detail.subject,
      });
  }
}
