import { describe, expect, it } from 'vitest';
import {
  buildExtensionCommandConversationSummaries,
  buildExtensionCommandHostEffectPlan,
  buildExtensionCommandResultPayload,
  buildExtensionSkillCommandResultPayload,
  normalizeSlashCommandName,
  parseBuiltinCommandArgs,
  shouldExecutePlanPromptAfterToggle,
} from '../extension-command-presenter';

describe('extension command presenter', () => {
  it('normalizes slash command names and parses arguments', () => {
    expect(normalizeSlashCommandName('/status')).toBe('status');
    expect(normalizeSlashCommandName('status')).toBe('status');
    expect(parseBuiltinCommandArgs('  a   b c  ')).toEqual(['a', 'b', 'c']);
    expect(parseBuiltinCommandArgs()).toEqual([]);
  });

  it('builds slashCommandResult payloads with extension-specific command messages', () => {
    expect(
      buildExtensionCommandResultPayload({
        conversationId: 'conv-1',
        command: 'clear',
        result: {
          handled: true,
          continueExecution: true,
          action: 'clearHistory',
          output: 'Cleared',
        },
      }),
    ).toEqual({
      type: 'slashCommandResult',
      conversationId: 'conv-1',
      command: 'clear',
      success: true,
      action: 'clearHistory',
      message: 'Conversation cleared',
    });
  });

  it('suppresses output for UI-only actions', () => {
    expect(
      buildExtensionCommandResultPayload({
        conversationId: 'conv-1',
        command: 'tasks',
        result: {
          handled: true,
          continueExecution: true,
          action: 'showTasks',
          output: 'Tasks',
        },
      }),
    ).toEqual({
      type: 'slashCommandResult',
      conversationId: 'conv-1',
      command: 'tasks',
      success: true,
      action: 'showTasks',
    });
  });

  it('builds skill command result payloads without mixing skill injection state', () => {
    expect(
      buildExtensionSkillCommandResultPayload({
        conversationId: 'conv-1',
        command: 'commit',
        status: 'activated',
      }),
    ).toEqual({
      type: 'slashCommandResult',
      conversationId: 'conv-1',
      command: 'commit',
      success: true,
      message: 'Command /commit activated',
    });

    expect(
      buildExtensionSkillCommandResultPayload({
        conversationId: 'conv-1',
        command: 'missing',
        status: 'unknown',
      }),
    ).toEqual({
      type: 'slashCommandResult',
      conversationId: 'conv-1',
      command: 'missing',
      success: false,
      error: 'Unknown command: /missing. Type /help for available commands.',
    });
  });

  it('projects resume conversation data from host-provided summaries', () => {
    expect(
      buildExtensionCommandResultPayload({
        conversationId: 'conv-1',
        command: 'resume',
        result: {
          handled: true,
          continueExecution: true,
          action: 'resumeConversation',
        },
        resumeConversations: [{ id: 'conv-1', title: 'Conversation', messageCount: 2 }],
      }),
    ).toEqual({
      type: 'slashCommandResult',
      conversationId: 'conv-1',
      command: 'resume',
      success: true,
      action: 'resumeConversation',
      data: {
        conversations: [{ id: 'conv-1', title: 'Conversation', messageCount: 2 }],
      },
    });
  });

  it('builds resume conversation summaries from host conversations', () => {
    expect(
      buildExtensionCommandConversationSummaries(
        [
          { id: 'conv-1', title: 'Loaded', messages: ['a', 'b'] },
          { id: 'conv-2', title: 'Lazy' },
        ],
        { getMessageCount: (id) => (id === 'conv-2' ? 3 : undefined) },
      ),
    ).toEqual([
      { id: 'conv-1', title: 'Loaded', messageCount: 2 },
      { id: 'conv-2', title: 'Lazy', messageCount: 3 },
    ]);
  });

  it('decides whether a /plan argument should be executed after toggling plan mode', () => {
    expect(
      shouldExecutePlanPromptAfterToggle({
        result: { handled: true, continueExecution: true, action: 'togglePlanMode' },
        isPlanMode: true,
        rawArgs: 'draft a plan',
      }),
    ).toBe(true);
    expect(
      shouldExecutePlanPromptAfterToggle({
        result: { handled: true, continueExecution: true, action: 'togglePlanMode' },
        isPlanMode: false,
        rawArgs: 'draft a plan',
      }),
    ).toBe(false);
  });

  it('builds host effects for command actions', () => {
    expect(
      buildExtensionCommandHostEffectPlan({
        result: { handled: true, continueExecution: true, action: 'clearHistory' },
        activeConversationId: 'conv-1',
        isPlanMode: false,
      }),
    ).toEqual({
      beforeResult: [
        { type: 'clearAgentHistory', conversationId: 'conv-1' },
        { type: 'postHistoryCleared', conversationId: 'conv-1' },
      ],
      afterResult: [],
    });

    expect(
      buildExtensionCommandHostEffectPlan({
        result: { handled: true, continueExecution: true, action: 'newConversation' },
        isPlanMode: false,
      }),
    ).toEqual({
      beforeResult: [{ type: 'refreshConversationList' }, { type: 'refreshActiveConversation' }],
      afterResult: [],
    });

    expect(
      buildExtensionCommandHostEffectPlan({
        result: { handled: true, continueExecution: true, action: 'showTasks' },
        activeConversationId: 'conv-1',
        isPlanMode: false,
      }),
    ).toEqual({
      beforeResult: [{ type: 'sendTasks', conversationId: 'conv-1' }],
      afterResult: [],
    });
  });

  it('schedules plan prompt execution after result payload', () => {
    expect(
      buildExtensionCommandHostEffectPlan({
        result: { handled: true, continueExecution: true, action: 'togglePlanMode' },
        activeConversationId: 'conv-1',
        isPlanMode: true,
        rawArgs: '  draft a plan  ',
      }),
    ).toEqual({
      beforeResult: [],
      afterResult: [
        {
          type: 'executePlanPrompt',
          conversationId: 'conv-1',
          messageText: 'draft a plan',
          sessionMode: 'agent',
        },
      ],
    });
  });
});
