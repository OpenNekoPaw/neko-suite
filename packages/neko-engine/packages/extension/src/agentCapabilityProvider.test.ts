import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Tool } from '@neko/shared';

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
      servicePortId: 'scene-render',
    });
    expect(toolByName(tools, 'InspectPuppet2D').domain).toEqual({
      id: 'puppet',
      source: 'engine-tool',
      servicePortId: 'puppet-render',
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
      servicePortId: 'audio-render',
    });
    expect(toolByName(tools, 'ExtractVideoFrame').domain).toEqual({
      id: 'timeline',
      source: 'engine-tool',
      servicePortId: 'media-render',
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
});
