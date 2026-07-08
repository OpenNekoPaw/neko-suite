import { describe, expect, it } from 'vitest';
import {
  createAgentWorkspaceRuntimeStateRuntime,
  type AgentWorkspaceRuntimeStateFsOps,
} from '../agent-workspace-runtime-state';

function createMemoryFs(): AgentWorkspaceRuntimeStateFsOps & {
  readonly files: Map<string, string>;
} {
  const files = new Map<string, string>();
  return {
    files,
    readFile: async (filePath) => {
      const content = files.get(filePath);
      if (content === undefined) {
        throw new Error(`File not found: ${filePath}`);
      }
      return content;
    },
    writeFile: async (filePath, content) => {
      files.set(filePath, content);
    },
    exists: async (filePath) => files.has(filePath),
  };
}

describe('AgentWorkspaceRuntimeStateRuntime', () => {
  it('shares conversation runtime state through a workspace-scoped file', async () => {
    const fs = createMemoryFs();
    const tuiRuntime = createAgentWorkspaceRuntimeStateRuntime({
      workDir: '/repo/project',
      source: 'tui',
      filePath: '/state/agent-runtime-state.json',
      fs,
      now: () => 100,
    });

    await tuiRuntime.patch({
      activeConversationId: 'conv-1',
      conversation: {
        conversationId: 'conv-1',
        status: 'running',
        phase: 'acting',
        toolName: 'ReadDocument',
        executionMode: 'auto',
        sessionMode: 'agent',
        contextTokenCount: 42,
        chatModel: { providerId: 'openai', modelId: 'gpt-test' },
        messageQueue: {
          conversationId: 'conv-1',
          pendingCount: 1,
          version: 2,
          items: [
            {
              id: 'queue-1',
              conversationId: 'conv-1',
              content: 'next',
              createdAt: 90,
              source: 'composer',
            },
          ],
        },
      },
    });

    const extensionRuntime = createAgentWorkspaceRuntimeStateRuntime({
      workDir: '/repo/project',
      source: 'extension',
      filePath: '/state/agent-runtime-state.json',
      fs,
      now: () => 200,
    });
    const state = await extensionRuntime.read();

    expect(state.activeConversationId).toBe('conv-1');
    expect(state.conversations['conv-1']).toMatchObject({
      conversationId: 'conv-1',
      updatedBy: 'tui',
      status: 'running',
      phase: 'acting',
      toolName: 'ReadDocument',
      contextTokenCount: 42,
      chatModel: { providerId: 'openai', modelId: 'gpt-test' },
    });
    expect(state.conversations['conv-1']?.messageQueue?.pendingCount).toBe(1);
  });

  it('clears the active conversation projection without deleting other conversations', async () => {
    const fs = createMemoryFs();
    const runtime = createAgentWorkspaceRuntimeStateRuntime({
      workDir: '/repo/project',
      source: 'tui',
      filePath: '/state/agent-runtime-state.json',
      fs,
      now: () => 100,
    });
    await runtime.patch({
      activeConversationId: 'conv-a',
      conversation: { conversationId: 'conv-a', status: 'idle' },
    });
    await runtime.patch({
      conversation: { conversationId: 'conv-b', status: 'running' },
    });

    const state = await runtime.clearConversation('conv-a');

    expect(state.activeConversationId).toBeNull();
    expect(state.conversations['conv-a']).toBeUndefined();
    expect(state.conversations['conv-b']?.status).toBe('running');
  });

  it('fails visibly when the stored workDir does not match the runtime workspace', async () => {
    const fs = createMemoryFs();
    fs.files.set(
      '/state/agent-runtime-state.json',
      JSON.stringify({
        version: 1,
        workDir: '/other/project',
        updatedAt: 1,
        updatedBy: 'tui',
        activeConversationId: null,
        conversations: {},
      }),
    );
    const runtime = createAgentWorkspaceRuntimeStateRuntime({
      workDir: '/repo/project',
      source: 'extension',
      filePath: '/state/agent-runtime-state.json',
      fs,
    });

    await expect(runtime.read()).rejects.toThrow('workDir mismatch');
  });
});
