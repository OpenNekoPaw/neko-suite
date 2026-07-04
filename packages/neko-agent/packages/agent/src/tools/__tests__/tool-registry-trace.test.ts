import { describe, expect, it, vi } from 'vitest';
import {
  CapturedLogTransport,
  ConsoleLogger,
  LogLevel,
  PUPPET_RENDER_SERVICE_PORT_ID,
  SCENE_RENDER_SERVICE_PORT_ID,
  createAgentTraceContext,
  createTool,
  type ToolExecuteOptions,
} from '@neko/shared';

describe('ToolRegistry trace isolation', () => {
  it('logs trace without adding trace to model-authored tool arguments', async () => {
    const transport = new CapturedLogTransport();
    const { setRootLogger } = await import('../../utils/logger');
    setRootLogger(new ConsoleLogger('Agent', LogLevel.Debug, [transport]));
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(async () => ({ success: true, data: 'ok' }));
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadFile',
        description: 'Read a file',
        category: 'file',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            path: { type: 'string' },
          },
          required: ['path'],
        },
        execute,
      }),
    );

    const args = { path: 'package.json' };
    await registry.execute('ReadFile', args, {
      trace: createAgentTraceContext({
        conversationId: 'conv-1',
        runId: 'run-1',
        turnId: 'turn-1',
        phase: 'tool',
      }),
    });

    expect(execute).toHaveBeenCalledTimes(1);
    const [receivedArgs, receivedOptions] = execute.mock.calls[0] as [
      Record<string, unknown>,
      ToolExecuteOptions,
    ];
    expect(receivedArgs).toEqual(args);
    expect(receivedArgs).not.toHaveProperty('trace');
    expect(receivedOptions.trace).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        phase: 'tool',
      }),
    );

    const requestLog = transport
      .list()
      .find((entry) => entry.message === 'neko.agent.tool.execute.request');
    expect(requestLog?.data).toEqual(
      expect.objectContaining({
        requestId: expect.stringMatching(/^tool-/),
        trace: expect.objectContaining({
          conversationId: 'conv-1',
          toolRequestId: expect.stringMatching(/^tool-/),
        }),
      }),
    );
  });
});

describe('ToolRegistry argument normalization', () => {
  it('unwraps valid raw JSON object arguments before schema validation', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(async () => ({ success: true, data: 'ok' }));
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadDocument',
        description: 'Read a document',
        category: 'document',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'object' },
          },
          required: ['source'],
        },
        execute,
      }),
    );

    const result = await registry.execute('ReadDocument', {
      _raw: '{"source":{"kind":"file","path":"${A}/book.epub"},"mode":"manifest"}',
    });

    expect(result.success).toBe(true);
    expect(execute).toHaveBeenCalledWith(
      {
        source: { kind: 'file', path: '${A}/book.epub' },
        mode: 'manifest',
      },
      undefined,
    );
  });

  it('keeps malformed raw arguments fail-visible', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(async () => ({ success: true, data: 'ok' }));
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadDocument',
        description: 'Read a document',
        category: 'document',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          properties: {
            source: { type: 'object' },
          },
          required: ['source'],
        },
        execute,
      }),
    );

    const result = await registry.execute('ReadDocument', { _raw: 'not json' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required field: "source"');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('ToolRegistry nested schema validation', () => {
  it('rejects array object items that miss required fields before execution', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const execute = vi.fn(async () => ({ success: true, data: 'ok' }));
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadImage',
        description: 'Read image content',
        category: 'analysis',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              items: {
                type: 'object',
                required: ['resourceRef'],
                properties: {
                  entryPath: { type: 'string' },
                  resourceRef: { type: 'object' },
                },
              },
            },
          },
        },
        execute,
      }),
    );

    const result = await registry.execute('ReadImage', {
      images: [{ entryPath: 'OPS/page-1.jpg' }],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing required field: "images[0].resourceRef"');
    expect(execute).not.toHaveBeenCalled();
  });
});

describe('ToolRegistry provider schema projection', () => {
  it('keeps provider tool parameters as top-level object schemas', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadImage',
        description: 'Read image content',
        category: 'analysis',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          required: ['images'],
          properties: {
            images: {
              type: 'array',
              items: { type: 'object' },
            },
            mode: {
              type: 'string',
              enum: ['metadata', 'vision'],
            },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions();
    const parameters = definition?.function.parameters;

    expect(parameters).toEqual(
      expect.objectContaining({
        type: 'object',
        properties: expect.objectContaining({
          mode: expect.objectContaining({
            enum: ['metadata', 'vision'],
          }),
        }),
      }),
    );
    expect(parameters).not.toHaveProperty('anyOf');
    expect(parameters).not.toHaveProperty('oneOf');
    expect(parameters).not.toHaveProperty('allOf');
    expect(parameters).not.toHaveProperty('enum');
    expect(parameters).not.toHaveProperty('not');
  });

  it('projects localized tool descriptions and parameter descriptions for Chinese runtime prompts', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ReadDocument',
        description: 'Read a document file and return text plus image metadata.',
        category: 'document',
        isConcurrencySafe: true,
        isReadOnly: true,
        parameters: {
          type: 'object',
          required: ['source'],
          properties: {
            source: {
              type: 'object',
              description: 'Document source. Use a file source with a stable path.',
            },
            mode: {
              type: 'string',
              enum: ['manifest', 'next'],
              description: 'Read mode.',
            },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions(undefined, { locale: 'zh' });
    const properties = definition?.function.parameters['properties'] as Record<
      string,
      { description?: string }
    >;

    expect(definition?.function.description).toBe(
      '读取文档文件，返回文本、结构信息和可供 ReadImage 使用的 imageInfo/resourceRef。',
    );
    expect(properties['source']?.description).toBe(
      '文档来源。读取本地文件时使用 { kind: "file", path }，path 可为 ${VAR}/path。',
    );
    expect(properties['mode']?.description).toBe('读取模式，例如 manifest、next 或 text。');
  });

  it('prefers tool-provided localization metadata for dynamically registered tools', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'custom_story_tool',
        description: 'Create story data.',
        category: 'workflow',
        localization: {
          zh: {
            description: '创建剧情数据。',
            parameters: {
              title: '剧情标题。',
            },
          },
        },
        parameters: {
          type: 'object',
          required: ['title'],
          properties: {
            title: { type: 'string', description: 'Story title.' },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions(undefined, { locale: 'zh-CN' });
    const properties = definition?.function.parameters['properties'] as Record<
      string,
      { description?: string }
    >;

    expect(definition?.function.description).toBe('创建剧情数据。');
    expect(properties['title']?.description).toBe('剧情标题。');
  });

  it('projects optional domain metadata outside provider parameters', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'ModelInspectScene',
        description: 'Inspect the active 3D scene.',
        category: 'analysis',
        isConcurrencySafe: true,
        isReadOnly: true,
        domain: {
          id: 'scene',
          source: 'engine-tool',
          servicePortId: SCENE_RENDER_SERVICE_PORT_ID,
        },
        parameters: {
          type: 'object',
          properties: {
            nodeId: { type: 'string' },
          },
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions();

    expect(definition?.domain).toEqual({
      id: 'scene',
      source: 'engine-tool',
      servicePortId: SCENE_RENDER_SERVICE_PORT_ID,
    });
    expect(definition?.function.parameters).not.toHaveProperty('domain');
  });

  it('projects planning metadata outside provider parameters', async () => {
    const { ToolRegistry } = await import('../tool-registry');
    const registry = new ToolRegistry();
    registry.register(
      createTool({
        name: 'PuppetSetBone',
        description: 'Move a native puppet bone.',
        category: 'media',
        safetyKind: 'non-destructive-mutation',
        targetRequirements: {
          required: ['puppetId', 'bone'],
          allowedFallbacks: ['selection'],
        },
        queryBeforeMutate: {
          preferredQueryTools: ['InspectPuppet2D'],
          reason: 'Resolve native puppet capability and stable bone ids before editing.',
        },
        parameters: {
          type: 'object',
          properties: {
            puppetId: { type: 'string' },
            bone: { type: 'string' },
          },
          required: ['puppetId', 'bone'],
        },
        execute: async () => ({ success: true, data: 'ok' }),
      }),
    );

    const [definition] = registry.toToolDefinitions();

    expect(definition?.planning).toEqual({
      safetyKind: 'non-destructive-mutation',
      targetRequirements: {
        required: ['puppetId', 'bone'],
        allowedFallbacks: ['selection'],
      },
      queryBeforeMutate: {
        preferredQueryTools: ['InspectPuppet2D'],
        reason: 'Resolve native puppet capability and stable bone ids before editing.',
      },
    });
    expect(definition?.function.parameters).not.toHaveProperty('planning');
    expect(definition?.function.parameters).not.toHaveProperty('safetyKind');
    expect(definition?.function.parameters).not.toHaveProperty('targetRequirements');
    expect(definition?.function.parameters).not.toHaveProperty('queryBeforeMutate');
  });

  it('projects engine provider scene and puppet tool domains', async () => {
    vi.doMock('vscode', () => ({
      commands: {
        executeCommand: vi.fn(),
      },
    }));
    const { ToolRegistry } = await import('../tool-registry');
    const { createEngineCapabilityProvider } =
      await import('../../../../../../neko-engine/packages/extension/src/agentCapabilityProvider');
    const registry = new ToolRegistry();
    for (const tool of createEngineCapabilityProvider().getTools({ extensionContext: undefined })) {
      registry.register(tool);
    }

    const definitions = registry.toToolDefinitions();
    const scene = definitions.find((definition) => definition.function.name === 'InspectScene3D');
    const puppet = definitions.find((definition) => definition.function.name === 'InspectPuppet2D');

    expect(scene?.domain).toEqual({
      id: 'scene',
      source: 'engine-tool',
      servicePortId: SCENE_RENDER_SERVICE_PORT_ID,
    });
    expect(puppet?.domain).toEqual({
      id: 'puppet',
      source: 'engine-tool',
      servicePortId: PUPPET_RENDER_SERVICE_PORT_ID,
    });
    expect(scene?.function.parameters).not.toHaveProperty('domain');
    expect(puppet?.function.parameters).not.toHaveProperty('domain');
  });
});
