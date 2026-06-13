import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_RENDER_SERVICE_PORT_ID,
  PUPPET_RENDER_SERVICE_PORT_ID,
  SCENE_RENDER_SERVICE_PORT_ID,
  TIMELINE_RENDER_SERVICE_PORT_ID,
  TOOL_NAMES_PUPPET,
  type Tool,
} from '@neko/shared';

const executeCommand = vi.hoisted(() => vi.fn());

vi.mock('vscode', () => ({
  commands: {
    executeCommand,
  },
}));

function toolByName(tools: readonly Tool[], name: string): Tool {
  const tool = tools.find((candidate) => candidate.name === name);
  if (!tool) {
    throw new Error(`Expected tool ${name} to be registered`);
  }
  return tool;
}

const providerContext = { extensionContext: undefined };

describe('EngineCapabilityProvider domain metadata', () => {
  beforeEach(() => {
    executeCommand.mockReset();
    executeCommand.mockResolvedValue('{"status":"ok","data":{"ok":true}}');
  });

  it('registers scene and puppet tools with serializable engine domains', async () => {
    const { createEngineCapabilityProvider } = await import('./agentCapabilityProvider');
    const provider = createEngineCapabilityProvider();
    const tools = provider.getTools(providerContext);

    expect(toolByName(tools, 'InspectScene3D').domain).toEqual({
      id: 'scene',
      source: 'engine-tool',
      servicePortId: SCENE_RENDER_SERVICE_PORT_ID,
    });
    expect(toolByName(tools, 'InspectPuppet2D').domain).toEqual({
      id: 'puppet',
      source: 'engine-tool',
      servicePortId: PUPPET_RENDER_SERVICE_PORT_ID,
    });
    expect(JSON.parse(JSON.stringify(tools.map((tool) => tool.domain)))).toEqual(
      tools.map((tool) => tool.domain),
    );
  });

  it('annotates existing engine tools when their creative domain is known', async () => {
    const { createEngineCapabilityProvider } = await import('./agentCapabilityProvider');
    const tools = createEngineCapabilityProvider().getTools(providerContext);

    expect(toolByName(tools, 'AnalyzeLoudness').domain).toEqual({
      id: 'audio',
      source: 'engine-tool',
      servicePortId: AUDIO_RENDER_SERVICE_PORT_ID,
    });
    expect(toolByName(tools, 'ExtractVideoFrame').domain).toEqual({
      id: 'timeline',
      source: 'engine-tool',
      servicePortId: TIMELINE_RENDER_SERVICE_PORT_ID,
    });
  });

  it('dispatches scene and puppet inspection through engine command bridge', async () => {
    const { createEngineCapabilityProvider } = await import('./agentCapabilityProvider');
    const tools = createEngineCapabilityProvider().getTools(providerContext);

    await toolByName(tools, 'InspectScene3D').execute({});
    await toolByName(tools, 'InspectPuppet2D').execute({});

    expect(executeCommand).toHaveBeenCalledWith('neko.engine.dispatch', 'scenes', 'snapshot', {});
    expect(executeCommand).toHaveBeenCalledWith('neko.engine.dispatch', 'puppets', 'snapshot', {});
  });

  it('registers native puppet tools with safety metadata', async () => {
    const { createEngineCapabilityProvider } = await import('./agentCapabilityProvider');
    const tools = createEngineCapabilityProvider().getTools(providerContext);

    for (const name of Object.values(TOOL_NAMES_PUPPET)) {
      expect(toolByName(tools, name).domain).toEqual({
        id: 'puppet',
        source: 'engine-tool',
        servicePortId: PUPPET_RENDER_SERVICE_PORT_ID,
      });
    }

    expect(toolByName(tools, TOOL_NAMES_PUPPET.PUPPET_QUERY)).toEqual(
      expect.objectContaining({
        safetyKind: 'read-only-query',
        isReadOnly: true,
        isConcurrencySafe: true,
      }),
    );
    expect(toolByName(tools, TOOL_NAMES_PUPPET.PUPPET_SET_BONE)).toEqual(
      expect.objectContaining({
        safetyKind: 'non-destructive-mutation',
        targetRequirements: expect.objectContaining({
          required: ['bone', 'transform', 'seq', 'baseRevision'],
        }),
        queryBeforeMutate: expect.objectContaining({
          preferredQueryTools: [TOOL_NAMES_PUPPET.PUPPET_QUERY, 'InspectPuppet2D'],
        }),
      }),
    );
    expect(toolByName(tools, TOOL_NAMES_PUPPET.PUPPET_AUTO_RIG)).toEqual(
      expect.objectContaining({
        safetyKind: 'confirmation-gated',
        requiresConfirmation: true,
      }),
    );
  });

  it('dispatches native puppet query through capabilities bridge', async () => {
    const { createEngineCapabilityProvider } = await import('./agentCapabilityProvider');
    const tools = createEngineCapabilityProvider().getTools(providerContext);

    await toolByName(tools, TOOL_NAMES_PUPPET.PUPPET_QUERY).execute({});

    expect(executeCommand).toHaveBeenCalledWith(
      'neko.engine.dispatch',
      'puppets',
      'capabilities',
      {},
    );
  });

  it('dispatches native BlendShape mutation through revision-aware command bridge', async () => {
    executeCommand
      .mockResolvedValueOnce(
        '{"status":"ok","data":{"format":"native","native":true,"revision":3}}',
      )
      .mockResolvedValueOnce(
        '{"status":"ok","data":{"seq":4,"appliedSeq":4,"baseRevision":3,"revision":4,"status":"applied"}}',
      );
    const { createEngineCapabilityProvider } = await import('./agentCapabilityProvider');
    const tools = createEngineCapabilityProvider().getTools(providerContext);

    const result = await toolByName(tools, TOOL_NAMES_PUPPET.PUPPET_SET_BLENDSHAPE).execute({
      name: 'jawOpen',
      weight: 0.8,
      seq: 4,
      baseRevision: 3,
      transactionId: 'tx-1',
    });

    expect(result.success).toBe(true);
    expect(executeCommand).toHaveBeenLastCalledWith(
      'neko.engine.dispatch',
      'puppets',
      'native_command',
      {
        seq: 4,
        baseRevision: 3,
        transactionId: 'tx-1',
        command: { type: 'setNativeBlendShape', name: 'jawOpen', weight: 0.8 },
      },
    );
  });

  it('returns native-readiness diagnostics for native puppet mutations against MOC3 assets', async () => {
    executeCommand.mockResolvedValueOnce(
      '{"status":"ok","data":{"format":"legacy","native":false,"revision":2,"diagnostics":[{"code":"legacy-only-puppet"}]}}',
    );
    const { createEngineCapabilityProvider } = await import('./agentCapabilityProvider');
    const tools = createEngineCapabilityProvider().getTools(providerContext);

    const result = await toolByName(tools, TOOL_NAMES_PUPPET.PUPPET_SET_EXPRESSION).execute({
      name: 'happy',
      seq: 3,
      baseRevision: 2,
    });

    expect(result).toEqual({
      success: false,
      error: 'Native puppet command requires a .nkp v2 bone-blendshape project.',
      data: expect.objectContaining({
        code: 'native-puppet-required',
      }),
    });
    expect(executeCommand).toHaveBeenCalledTimes(1);
  });
});
