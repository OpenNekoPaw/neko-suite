import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  runExtensionSlashCommandRuntime,
  type ExtensionSlashCommandRuntimeDeps,
  type ExtensionSlashCommandRuntimeEffects,
} from '../extension-slash-command-runtime';

type PostMessageMock = ReturnType<typeof vi.fn> &
  ((message: Parameters<ExtensionSlashCommandRuntimeEffects['postMessage']>[0]) => void);
type ExecuteHostEffectMock = ReturnType<typeof vi.fn> &
  ((effect: Parameters<ExtensionSlashCommandRuntimeEffects['executeHostEffect']>[0]) => void);
type ExecuteSkillPromptMock = ReturnType<typeof vi.fn> &
  ((
    dispatch: Parameters<NonNullable<ExtensionSlashCommandRuntimeEffects['executeSkillPrompt']>>[0],
  ) => void);

describe('extension slash command runtime', () => {
  let deps: ExtensionSlashCommandRuntimeDeps;
  let postMessage: PostMessageMock;
  let executeHostEffect: ExecuteHostEffectMock;
  let executeSkillPrompt: ExecuteSkillPromptMock;

  beforeEach(() => {
    postMessage = vi.fn() as PostMessageMock;
    executeHostEffect = vi.fn() as ExecuteHostEffectMock;
    executeSkillPrompt = vi.fn() as ExecuteSkillPromptMock;
    deps = createDeps();
  });

  it('runs builtin clear through command context and ordered host effects', () => {
    runExtensionSlashCommandRuntime(
      { command: 'clear', conversationId: 'conv-1' },
      deps,
      createEffects(),
    );

    expect(deps.conversations.clearCurrent).toHaveBeenCalledWith('conv-1');
    expect(executeHostEffect).toHaveBeenCalledWith({
      type: 'clearAgentHistory',
      conversationId: 'conv-1',
    });
    expect(executeHostEffect).toHaveBeenCalledWith({
      type: 'postHistoryCleared',
      conversationId: 'conv-1',
    });
    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'slashCommandResult',
        command: 'clear',
        success: true,
        message: 'Conversation cleared',
      }),
    );
  });

  it('projects status aliases as the canonical status command', () => {
    runExtensionSlashCommandRuntime(
      { command: 's', conversationId: 'conv-1' },
      deps,
      createEffects(),
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'status',
        action: 'showStatus',
        data: expect.objectContaining({
          provider: 'anthropic',
          model: 'claude-3',
          activeConversationId: 'conv-1',
          messageCount: 2,
        }),
      }),
    );
  });

  it('executes skill slash arguments with IDC metadata', async () => {
    deps.skills!.applySlashCommand = vi.fn().mockResolvedValue({
      applied: true,
      injection: { name: 'commit' },
      skill: { name: 'commit-workflow', command: 'commit' },
    });

    await runExtensionSlashCommandRuntime(
      { command: 'commit', conversationId: 'conv-1', args: 'fix bug' },
      deps,
      createEffects(),
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'commit',
        success: true,
      }),
    );
    expect(executeSkillPrompt).toHaveBeenCalledWith({
      conversationId: 'conv-1',
      messageText: 'fix bug',
      sessionMode: 'agent',
      executionOverrides: {
        metadata: {
          idc: {
            entrySignal: 'prompt-chain-skill',
            taskShape: 'multi-step',
            runKind: 'skill:commit-workflow',
          },
        },
      },
    });
  });

  it('reports unknown extension commands when no builtin or skill matches', async () => {
    deps.skills!.applySlashCommand = vi.fn().mockResolvedValue(null);

    await runExtensionSlashCommandRuntime(
      { command: 'config', conversationId: 'conv-1' },
      deps,
      createEffects(),
    );

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        command: 'config',
        success: false,
        error: expect.stringContaining('Unknown command'),
      }),
    );
  });

  function createEffects(): ExtensionSlashCommandRuntimeEffects {
    return {
      postMessage: (message) => postMessage(message),
      executeHostEffect: (effect) => executeHostEffect(effect),
      executeSkillPrompt: (dispatch) => executeSkillPrompt(dispatch),
    };
  }
});

function createDeps(): ExtensionSlashCommandRuntimeDeps {
  const conversations = {
    list: vi.fn(() => [
      { id: 'conv-1', title: 'Conversation 1', messages: ['a', 'b'] },
      { id: 'conv-2', title: 'Conversation 2', messages: ['a'] },
    ]),
    getMessageCount: vi.fn((conversationId: string) => (conversationId === 'conv-1' ? 2 : 1)),
    create: vi.fn(() => 'conv-new'),
    clearCurrent: vi.fn(),
  };
  const skills = {
    skillCount: vi.fn(() => 0),
    listSkills: vi.fn(() => []),
    listAllSkills: vi.fn(() => []),
    getSkill: vi.fn(),
    getSkillByCommand: vi.fn(),
    searchSkills: vi.fn(() => []),
    getActiveSkillName: vi.fn(() => null),
    clearActiveSkill: vi.fn(),
    applySlashCommand: vi.fn().mockResolvedValue(null),
  };

  return {
    conversations,
    skills,
    settings: {
      provider: 'anthropic',
      model: 'claude-3',
      executionMode: 'auto',
    },
    planMode: {
      isEnabled: vi.fn(() => false),
      toggle: vi.fn(() => false),
    },
    contextManager: {
      getTokenCount: vi.fn(() => 100),
      compress: vi.fn(),
    },
  };
}
