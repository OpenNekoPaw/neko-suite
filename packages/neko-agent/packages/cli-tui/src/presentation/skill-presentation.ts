import type { AgentTerminalPresentationContext } from './context';
import type { AgentTerminalCommandProjection } from './model-family-presentation';
import type { AgentTerminalMessageKey } from './terminal-messages';

export type SkillSemanticResult =
  | Readonly<{ readonly kind: 'catalog-unavailable' }>
  | Readonly<{ readonly kind: 'catalog-empty' }>
  | Readonly<{ readonly kind: 'ambiguous-deactivation'; readonly records: readonly string[] }>
  | Readonly<{ readonly kind: 'deactivated' }>
  | Readonly<{ readonly kind: 'activated'; readonly skillName: string }>
  | Readonly<{ readonly kind: 'not-found'; readonly skillName: string }>
  | Readonly<{ readonly kind: 'invocation-invalid'; readonly input: string }>
  | Readonly<{ readonly kind: 'service-unavailable' }>
  | Readonly<{ readonly kind: 'disabled'; readonly skillName: string }>
  | Readonly<{ readonly kind: 'load-failed'; readonly skillName: string; readonly detail?: string }>
  | Readonly<{ readonly kind: 'no-content'; readonly skillName: string }>;

type Context = AgentTerminalPresentationContext<AgentTerminalMessageKey>;

export function presentSkillCommand(
  result: SkillSemanticResult,
  context: Context,
): AgentTerminalCommandProjection {
  switch (result.kind) {
    case 'catalog-unavailable':
      return { kind: 'output', output: context.t('agent.terminal.skill.catalogUnavailable') };
    case 'catalog-empty':
      return { kind: 'output', output: context.t('agent.terminal.skill.catalogEmpty') };
    case 'ambiguous-deactivation':
      return {
        kind: 'output',
        output: context.t('agent.terminal.skill.deactivationAmbiguous', {
          records: result.records.join(', '),
        }),
      };
    case 'deactivated':
      return { kind: 'output', output: context.t('agent.terminal.skill.deactivated') };
    case 'activated':
      return {
        kind: 'output',
        output: context.t('agent.terminal.skill.activated', { skillName: result.skillName }),
      };
    case 'not-found':
      return {
        kind: 'error',
        diagnosticCode: 'skill.not-found',
        error: context.t('agent.terminal.diagnostic.skill.notFound', {
          skillName: result.skillName,
        }),
      };
    case 'invocation-invalid':
      return {
        kind: 'error',
        diagnosticCode: 'skill.invocation-invalid',
        error: context.t('agent.terminal.diagnostic.skill.invocationInvalid', {
          input: result.input,
        }),
      };
    case 'service-unavailable':
      return {
        kind: 'error',
        diagnosticCode: 'skill.service-unavailable',
        error: context.t('agent.terminal.diagnostic.skill.serviceUnavailable'),
      };
    case 'disabled':
      return {
        kind: 'error',
        diagnosticCode: 'skill.disabled',
        error: context.t('agent.terminal.diagnostic.skill.disabled', {
          skillName: result.skillName,
        }),
      };
    case 'load-failed':
      return {
        kind: 'error',
        diagnosticCode: 'skill.load-failed',
        error: result.detail
          ? context.t('agent.terminal.diagnostic.skill.loadFailedWithDetail', {
              skillName: result.skillName,
              detail: result.detail,
            })
          : context.t('agent.terminal.diagnostic.skill.loadFailed', {
              skillName: result.skillName,
            }),
      };
    case 'no-content':
      return {
        kind: 'error',
        diagnosticCode: 'skill.no-content',
        error: context.t('agent.terminal.diagnostic.skill.noContent', {
          skillName: result.skillName,
        }),
      };
  }
}

export function presentSkillMenu(context: Context): {
  readonly title: string;
  readonly deactivateLabel: string;
  readonly deactivateDescription: string;
} {
  return {
    title: context.t('agent.terminal.skill.menu.title'),
    deactivateLabel: context.t('agent.terminal.skill.menu.deactivate.label'),
    deactivateDescription: context.t('agent.terminal.skill.menu.deactivate.description'),
  };
}
