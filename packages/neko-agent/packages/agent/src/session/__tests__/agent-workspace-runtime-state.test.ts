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
    renameFile: async (sourcePath, targetPath) => {
      const content = files.get(sourcePath);
      if (content === undefined) {
        throw new Error(`File not found: ${sourcePath}`);
      }
      files.delete(sourcePath);
      files.set(targetPath, content);
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

  it('fails visibly when a stored state still uses the removed cli source', async () => {
    const fs = createMemoryFs();
    fs.files.set(
      '/state/agent-runtime-state.json',
      JSON.stringify({
        version: 1,
        workDir: '/repo/project',
        updatedAt: 1,
        updatedBy: 'cli',
        activeConversationId: null,
        conversations: {},
      }),
    );
    const runtime = createAgentWorkspaceRuntimeStateRuntime({
      workDir: '/repo/project',
      source: 'tui',
      filePath: '/state/agent-runtime-state.json',
      fs,
    });

    await expect(runtime.read()).rejects.toThrow('updatedBy is invalid');
  });

  it('recovers a corrupt runtime projection when reading', async () => {
    const fs = createMemoryFs();
    fs.files.set('/state/agent-runtime-state.json', '{"version":1}\n}');
    const runtime = createAgentWorkspaceRuntimeStateRuntime({
      workDir: '/repo/project',
      source: 'tui',
      filePath: '/state/agent-runtime-state.json',
      fs,
      now: () => 300,
    });

    const state = await runtime.read();

    expect(state).toEqual({
      version: 1,
      workDir: '/repo/project',
      updatedAt: 300,
      updatedBy: 'tui',
      activeConversationId: null,
      conversations: {},
    });
    expect(fs.files.has('/state/agent-runtime-state.json')).toBe(false);
    expect(fs.files.get('/state/agent-runtime-state.json.corrupt.300')).toBe('{"version":1}\n}');
  });

  it('recovers a corrupt runtime projection when writing a new patch', async () => {
    const fs = createMemoryFs();
    fs.files.set('/state/agent-runtime-state.json', '{"version":1}\n}');
    const runtime = createAgentWorkspaceRuntimeStateRuntime({
      workDir: '/repo/project',
      source: 'tui',
      filePath: '/state/agent-runtime-state.json',
      fs,
      now: () => 300,
    });

    const state = await runtime.patch({
      activeConversationId: 'conv-recovered',
      conversation: { conversationId: 'conv-recovered', status: 'interactive' },
    });

    expect(state.activeConversationId).toBe('conv-recovered');
    expect(state.conversations['conv-recovered']?.status).toBe('interactive');
    expect(JSON.parse(fs.files.get('/state/agent-runtime-state.json') ?? '')).toMatchObject({
      version: 1,
      workDir: '/repo/project',
      activeConversationId: 'conv-recovered',
    });
    expect(fs.files.get('/state/agent-runtime-state.json.corrupt.300')).toBe('{"version":1}\n}');
  });

  it('serializes concurrent patches for the same runtime state file', async () => {
    const fs = createMemoryFs();
    let now = 400;
    const runtime = createAgentWorkspaceRuntimeStateRuntime({
      workDir: '/repo/project',
      source: 'extension',
      filePath: '/state/agent-runtime-state.json',
      fs,
      now: () => {
        now += 1;
        return now;
      },
    });

    await Promise.all([
      runtime.patch({
        activeConversationId: 'conv-a',
        conversation: { conversationId: 'conv-a', status: 'running' },
      }),
      runtime.patch({
        activeConversationId: 'conv-b',
        conversation: { conversationId: 'conv-b', status: 'waiting_confirmation' },
      }),
      runtime.patch({
        conversation: { conversationId: 'conv-c', status: 'idle' },
      }),
    ]);

    const state = await runtime.read();

    expect(Object.keys(state.conversations).sort()).toEqual(['conv-a', 'conv-b', 'conv-c']);
    expect(state.conversations['conv-a']?.status).toBe('running');
    expect(state.conversations['conv-b']?.status).toBe('waiting_confirmation');
    expect(state.conversations['conv-c']?.status).toBe('idle');
  });
});
