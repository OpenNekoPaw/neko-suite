import { describe, expect, it, vi } from 'vitest';
import type { ActiveSkillLifecycleRecordProjection, ChatModelOption, Task } from '@neko/shared';
import {
  handleTuiControlCommand,
  type TuiCommandRouterContext,
  type TuiExecutionMode,
  type TuiSessionMode,
  type TuiArtifactPorts,
  type TuiCapabilityPorts,
} from '../tui-command-router';
import { DEFAULT_CLI_CONFIG } from '../types';
import { createTuiMessageQueue } from '../message-queue';

describe('handleTuiControlCommand', () => {
  it('routes execution mode commands through the mode port', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/plan', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toBe('Plan mode enabled');
    expect(context.ports.mode?.setExecutionMode).toHaveBeenCalledWith('plan');
  });

  it('routes model switching through the model port', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model gpt-5.3-codex', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toBe(
      'Chat model switched to: anthropic:gpt-5.3-codex (Anthropic / GPT 5.3 Codex)',
    );
    expect(context.ports.model?.selectChatModel).toHaveBeenCalledWith({
      providerId: 'anthropic',
      modelId: 'gpt-5.3-codex',
      providerExpressionProfileId: 'provider-expression:anthropic:gpt-5.3-codex',
      optionId: 'anthropic:gpt-5.3-codex',
      label: 'Anthropic / GPT 5.3 Codex',
      category: 'llm',
    });
  });

  it('rejects invalid model identities visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model missing-provider:missing-model', context);

    expect(result.error).toBe(
      'Unknown chat model identity: missing-provider:missing-model. Use /model chat to list available chat models.',
    );
    expect(context.ports.model?.selectChatModel).not.toHaveBeenCalled();
  });

  it('lists chat and media models through /model status', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model list', context);

    expect(result.output).toContain('Model Selection:');
    expect(result.output).toContain('chat: anthropic:claude-sonnet-4-20250514');
    expect(result.output).toContain('Available chat models:');
    expect(result.output).toContain('anthropic:gpt-5.3-codex  Anthropic / GPT 5.3 Codex');
    expect(result.output).toContain('Available media models:');
    expect(result.output).toContain('image openai:gpt-image-1  OpenAI / GPT Image');
    expect(result.output).toContain(
      '/model <image|video|audio> <provider:model|provider/model|model-id|none>',
    );
  });

  it('opens the chat model selector for /model chat without a model argument', async () => {
    const context = createContext({
      selectedMenuItem: 'anthropic:gpt-5.3-codex',
    });

    const result = await handleTuiControlCommand('/model chat', context);

    expect(result.output).toBe(
      'Chat model switched to: anthropic:gpt-5.3-codex (Anthropic / GPT 5.3 Codex)',
    );
    expect(context.ports.model?.selectMenuItem).toHaveBeenCalledWith({
      title: 'Chat Model',
      items: [
        {
          id: 'anthropic:gpt-5.3-codex',
          label: 'Anthropic / GPT 5.3 Codex',
          description: 'anthropic/gpt-5.3-codex',
          active: false,
        },
      ],
    });
    expect(result.output).not.toContain('Usage: /model chat');
  });

  it('opens a media model selector for /model image without a model argument', async () => {
    const context = createContext({
      selectedMenuItem: 'openai:gpt-image-1',
    });

    const result = await handleTuiControlCommand('/model image', context);

    expect(result.output).toBe('image model set to: openai:gpt-image-1 (OpenAI / GPT Image)');
    expect(context.ports.model?.selectMenuItem).toHaveBeenCalledWith({
      title: 'Image Model',
      items: [
        {
          id: 'openai:gpt-image-1',
          label: 'OpenAI / GPT Image',
          description: 'openai/gpt-image-1',
          active: true,
        },
        {
          id: '__none__',
          label: 'None',
          description: 'Disable image generation for this session',
          active: false,
        },
      ],
    });
    expect(context.ports.media?.setMediaModel).toHaveBeenCalledWith('image', {
      providerId: 'openai',
      modelId: 'gpt-image-1',
      providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
      optionId: 'openai:gpt-image-1',
      label: 'OpenAI / GPT Image',
      category: 'image',
    });
    expect(result.output).not.toContain('Usage: /media image');
  });

  it('routes /model media category selection through the media port without exiting', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model image openai:gpt-image-1', context);

    expect(result.source).toBe('tui-router');
    expect(result.continueExecution).toBe(true);
    expect(result.output).toBe('image model set to: openai:gpt-image-1 (OpenAI / GPT Image)');
    expect(context.ports.media?.setMediaModel).toHaveBeenCalledWith('image', {
      providerId: 'openai',
      modelId: 'gpt-image-1',
      providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
      optionId: 'openai:gpt-image-1',
      label: 'OpenAI / GPT Image',
      category: 'image',
    });
    expect(context.ports.model?.selectChatModel).not.toHaveBeenCalled();
    expect(context.ports.lifecycle?.exit).not.toHaveBeenCalled();
  });

  it('routes /model media none selection through the media port', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model video none', context);

    expect(result.source).toBe('tui-router');
    expect(result.continueExecution).toBe(true);
    expect(result.output).toBe('video media generation disabled for this session.');
    expect(context.ports.media?.setMediaModel).toHaveBeenCalledWith('video', 'none');
    expect(context.ports.lifecycle?.exit).not.toHaveBeenCalled();
  });

  it('rejects invalid /model media category identities visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/model video openai:gpt-image-1', context);

    expect(result.error).toBe(
      'Unknown video model identity: openai:gpt-image-1. Use /model video to list available models.',
    );
    expect(context.ports.media?.setMediaModel).not.toHaveBeenCalled();
  });

  it('lists and selects explicit media model identities', async () => {
    const context = createContext();

    const listed = await handleTuiControlCommand('/media image', context);
    const selected = await handleTuiControlCommand('/media image openai:gpt-image-1', context);

    expect(listed.output).toContain('openai:gpt-image-1  OpenAI / GPT Image');
    expect(selected.output).toBe('image model set to: openai:gpt-image-1 (OpenAI / GPT Image)');
    expect(context.ports.media?.setMediaModel).toHaveBeenCalledWith('image', {
      providerId: 'openai',
      modelId: 'gpt-image-1',
      providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
      optionId: 'openai:gpt-image-1',
      label: 'OpenAI / GPT Image',
      category: 'image',
    });
  });

  it('rejects invalid media identities visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/media video openai:gpt-image-1', context);

    expect(result.error).toBe(
      'Unknown video media model identity: openai:gpt-image-1. Use /media video to list available models.',
    );
    expect(context.ports.media?.setMediaModel).not.toHaveBeenCalled();
  });

  it('validates and applies LLM parameters through the parameter port', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/param set reasoning deep', context);

    expect(result.output).toContain('Parameter updated: reasoning = deep');
    expect(context.ports.parameters?.validate).toHaveBeenCalledWith({ reasoningPreset: 'deep' });
    expect(context.ports.parameters?.apply).toHaveBeenCalledWith({
      config: { reasoningPreset: 'deep' },
      chatOptions: { thinkingBudget: 12000 },
      providerOptions: {},
      summary: 'Applied: thinkingBudget=12000',
    });
  });

  it('rejects unsupported parameters visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/param set imaginary true', context);

    expect(result.error).toContain('Unsupported parameter: imaginary');
    expect(context.ports.parameters?.validate).not.toHaveBeenCalled();
  });

  it('shows and changes session mode through the mode port', async () => {
    const context = createContext();

    const status = await handleTuiControlCommand('/mode', context);
    const changed = await handleTuiControlCommand('/mode image', context);

    expect(status.output).toContain('Session mode: agent');
    expect(status.output).toContain('agent, image, video, audio');
    expect(changed.output).toBe('Session mode set to: image');
    expect(context.ports.mode?.setSessionMode).toHaveBeenCalledWith('image');
  });

  it('rejects unsupported session modes visibly', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/mode music', context);

    expect(result.error).toBe('Unsupported session mode: music. Valid: agent, image, video, audio');
    expect(context.ports.mode?.setSessionMode).not.toHaveBeenCalled();
  });

  it('routes status through host state and context token ports', async () => {
    const context = createContext({
      getTokenCount: vi.fn(() => 321),
    });

    const result = await handleTuiControlCommand('/status', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('Model: claude-sonnet-4-20250514');
    expect(result.output).toContain('Model Identity: anthropic:claude-sonnet-4-20250514');
    expect(result.output).toContain('Session: agent');
    expect(result.output).toContain('Mode: auto');
    expect(result.output).toContain('Media: image=openai:gpt-image-1');
    expect(result.output).toContain('Params: reasoning=deep');
    expect(result.output).toContain('Context Tokens: 321');
  });

  it('lists background tasks through the task port', async () => {
    const context = createContext({
      tasks: [
        createTask({
          id: 'task_1783527068036_1',
          status: 'running',
          progress: 35,
          payload: {
            prompt: '猫咪玩耍',
            providerId: 'nekoapi-media',
          },
          lifecycle: {
            ownerConversationId: 'conversation-1',
            runMode: 'background',
          },
        }),
      ],
    });

    const result = await handleTuiControlCommand('/tasks', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('Tasks:');
    expect(result.output).toContain('task_1783527068036_1');
    expect(result.output).toContain('running');
    expect(result.output).toContain('35%');
    expect(result.output).toContain('猫咪玩耍');
  });

  it('reports missing context token estimate visibly in status', async () => {
    const context = createContext({ getTokenCount: undefined });

    const result = await handleTuiControlCommand('/status', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('Context: token estimate unavailable');
  });

  it('runs compact through the context compaction port', async () => {
    const compact = vi.fn(async () => ({
      originalTokens: 1000,
      compressedTokens: 250,
      ratio: 0.25,
    }));
    const context = createContext({ compact });

    const result = await handleTuiControlCommand('/compact', context);

    expect(result.source).toBe('tui-router');
    expect(compact).toHaveBeenCalledTimes(1);
    expect(result.output).toBe('Context compressed: 1000 -> 250 tokens (25.0%)');
  });

  it('returns visible diagnostics when compaction port is missing', async () => {
    const context = createContext({ compact: undefined });

    const result = await handleTuiControlCommand('/compact', context);

    expect(result.source).toBe('tui-router');
    expect(result.error).toBe('Context compaction is not available for this session.');
  });

  it('lists and mutates queued messages through the queue port', async () => {
    const queue = createTuiMessageQueue({ conversationId: 'conv-1', now: () => 1000 });
    const first = queue.enqueue('first');
    const second = queue.enqueue('second');
    const context = createContext({ queue });

    const listed = await handleTuiControlCommand('/queue list', context);
    const promoted = await handleTuiControlCommand(`/queue promote ${second.id}`, context);
    const sentNext = await handleTuiControlCommand(`/queue send-next ${first.id}`, context);
    const sentNow = await handleTuiControlCommand(`/queue send-now ${first.id}`, context);
    const edited = await handleTuiControlCommand(`/queue edit ${first.id} first revised`, context);
    const cancelled = await handleTuiControlCommand(`/queue cancel ${second.id}`, context);

    expect(listed.output).toContain('Queue: 2 pending');
    expect(promoted.output).toBe(
      `Queued message scheduled as next eligible user message: ${second.id}`,
    );
    expect(sentNext.output).toBe(
      `Queued message scheduled as next eligible user message: ${first.id}`,
    );
    expect(sentNow.error).toBe(
      'The send-now command cannot interrupt the active turn. Use /queue send-next <id> or /queue promote <id>.',
    );
    expect(edited.output).toBe(`Queued message edited: ${first.id}`);
    expect(cancelled.output).toBe(`Queued message cancelled: ${second.id}`);
    expect(queue.snapshot().items).toEqual([
      expect.objectContaining({ id: first.id, content: 'first revised' }),
    ]);
  });

  it('reports stale queue item diagnostics visibly', async () => {
    const queue = createTuiMessageQueue({ conversationId: 'conv-1' });
    const context = createContext({ queue });

    const result = await handleTuiControlCommand('/queue cancel missing', context);

    expect(result.error).toBe('stale-item: Unknown queue item: missing');
  });

  it('lists MCP server connection status', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/mcp', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('MCP Servers:');
    expect(result.output).toContain('filesystem  connected  transport=stdio  tools=2');
    expect(result.output).toContain('asset-library  disconnected  transport=http  tools=0');
    expect(result.output).toContain('disabled-server  disabled');
  });

  it('lists MCP tools globally and by server', async () => {
    const context = createContext();

    const all = await handleTuiControlCommand('/mcp tools', context);
    const scoped = await handleTuiControlCommand('/mcp tools filesystem', context);

    expect(all.output).toContain('MCP Tools:');
    expect(all.output).toContain('mcp__filesystem__read_file');
    expect(scoped.output).toContain('MCP Tools for filesystem:');
    expect(scoped.output).toContain('mcp__filesystem__search');
  });

  it('routes MCP connect, disconnect, and reconnect through MCP ports', async () => {
    const context = createContext();

    const connected = await handleTuiControlCommand('/mcp connect asset-library', context);
    const disconnected = await handleTuiControlCommand('/mcp disconnect filesystem', context);
    const reconnected = await handleTuiControlCommand('/mcp reconnect filesystem', context);

    expect(connected.output).toBe('MCP server connected: asset-library');
    expect(disconnected.output).toBe('MCP server disconnected: filesystem');
    expect(reconnected.output).toBe('MCP server reconnected: filesystem');
    expect(context.ports.mcp?.connect).toHaveBeenCalledWith('asset-library');
    expect(context.ports.mcp?.disconnect).toHaveBeenCalledWith('filesystem');
    expect(context.ports.mcp?.reconnect).toHaveBeenCalledWith('filesystem');
  });

  it('reports MCP diagnostics visibly', async () => {
    const missingPorts = createContext({ mcp: undefined });
    const context = createContext();

    const unavailable = await handleTuiControlCommand('/mcp', missingPorts);
    const unknown = await handleTuiControlCommand('/mcp connect missing', context);
    const disabled = await handleTuiControlCommand('/mcp connect disabled-server', context);

    expect(unavailable.error).toBe('MCP controls are not available for this session.');
    expect(unknown.error).toBe('Unknown MCP server: missing');
    expect(disabled.error).toBe('MCP server is disabled: disabled-server');
  });

  it('lists capability providers and diagnostics', async () => {
    const context = createContext();

    const result = await handleTuiControlCommand('/capability', context);

    expect(result.source).toBe('tui-router');
    expect(result.output).toContain('TUI Capability Providers:');
    expect(result.output).toContain('neko-assets  loaded  loaded=1 skipped=0');
    expect(result.output).toContain('neko-cut  skipped  loaded=0 skipped=1');
    expect(result.output).toContain('Capability Diagnostics:');
    expect(result.output).toContain('warn neko-cut provider: host-not-supported');
  });

  it('shows one capability provider and lists capability tools', async () => {
    const context = createContext();

    const shown = await handleTuiControlCommand('/capability show neko-assets', context);
    const allTools = await handleTuiControlCommand('/capability tools', context);
    const scopedTools = await handleTuiControlCommand('/capability tools neko-assets', context);

    expect(shown.output).toContain('Capability Provider: neko-assets');
    expect(shown.output).toContain('tool  assets.list');
    expect(allTools.output).toContain('Capability Tools:');
    expect(allTools.output).toContain('assets.list');
    expect(scopedTools.output).toContain('Capability Tools for neko-assets:');
    expect(scopedTools.output).toContain('assets.list');
  });

  it('reports unavailable capability diagnostics visibly', async () => {
    const missingPorts = createContext({ capability: undefined });
    const context = createContext();

    const unavailable = await handleTuiControlCommand('/capability', missingPorts);
    const unknown = await handleTuiControlCommand('/capability show missing', context);

    expect(unavailable.error).toBe('Capability diagnostics are not available for this session.');
    expect(unknown.error).toBe('Unknown capability provider: missing');
  });

  it('lists, shows, opens, and sends artifact references through artifact ports', async () => {
    const artifact = {
      id: 'asset-img-1',
      kind: 'image' as const,
      assetId: 'asset-img-1',
      path: 'neko/generated/shot-01.png',
      dimensions: '1024x1024',
      diagnostics: [],
      commands: ['/artifact show asset-img-1'],
    };
    const ports: TuiArtifactPorts = {
      list: vi.fn(() => [artifact]),
      show: vi.fn((id) => (id === artifact.assetId ? artifact : null)),
      open: vi.fn((id) => `Opened ${id}`),
      send: vi.fn((target, id) => `Sent ${id} to ${target}`),
    };
    const context = createContext({ artifact: ports });

    const listed = await handleTuiControlCommand('/artifact list', context);
    const shown = await handleTuiControlCommand('/artifact show asset-img-1', context);
    const opened = await handleTuiControlCommand('/artifact open asset-img-1', context);
    const sent = await handleTuiControlCommand('/artifact send canvas asset-img-1', context);

    expect(listed.output).toContain('asset-img-1  image  neko/generated/shot-01.png  1024x1024');
    expect(shown.output).toContain('Image reference');
    expect(opened.output).toBe('Opened asset-img-1');
    expect(sent.output).toBe('Sent asset-img-1 to canvas');
    expect(ports.open).toHaveBeenCalledWith('asset-img-1');
    expect(ports.send).toHaveBeenCalledWith('canvas', 'asset-img-1');
  });

  it('reports unavailable artifact host actions visibly', async () => {
    const context = createContext({ artifact: {} });

    const list = await handleTuiControlCommand('/artifact list', context);
    const show = await handleTuiControlCommand('/artifact show asset-img-1', context);
    const open = await handleTuiControlCommand('/artifact open asset-img-1', context);
    const send = await handleTuiControlCommand('/artifact send canvas asset-img-1', context);

    expect(list.error).toBe('Artifact listing is not available for this session.');
    expect(show.error).toBe('Artifact details are not available for this session.');
    expect(open.error).toBe('Artifact open is not available for this session.');
    expect(send.error).toBe('Artifact send is not available for this session.');
  });

  it('routes skill clear ambiguity through Skill lifecycle records', async () => {
    const context = createContext({
      activeRecords: [
        {
          id: 'domain-1',
          skillName: 'review',
          slot: 'domainSkill',
          owner: 'user',
          clearable: true,
          status: 'active',
        },
        {
          id: 'reference-1',
          skillName: 'review',
          slot: 'referenceSkill',
          owner: 'agent',
          clearable: true,
          status: 'active',
        },
      ],
    });

    const result = await handleTuiControlCommand('/skill off', context);

    expect(result.source).toBe('tui-router');
    expect(context.ports.skill?.deactivate).not.toHaveBeenCalled();
    expect(result.output).toContain('Multiple active Skill lifecycle records');
  });

  it('delegates command artifacts to slash core after TUI controls', async () => {
    const commandSkill = {
      name: 'commit-skill',
      description: 'Commit helper',
      content: 'Commit instructions',
      enabled: true,
      entryPointKind: 'command-artifact',
      command: 'commit',
    };
    const context = createContext({ skills: [commandSkill] });

    const result = await handleTuiControlCommand('/commit fix bug', context);

    expect(result.source).toBe('slash-core');
    expect(result.lifecycleActivation).toEqual({ skillName: 'commit-skill', args: 'fix bug' });
    expect(result.agentPrompt).toBe('fix bug');
  });
});

function createContext(
  overrides: {
    readonly getTokenCount?: (() => number) | undefined;
    readonly compact?:
      | (() => Promise<{
          readonly originalTokens: number;
          readonly compressedTokens: number;
          readonly ratio: number;
        }>)
      | undefined;
    readonly activeRecords?: readonly ActiveSkillLifecycleRecordProjection[];
    readonly skills?: readonly Record<string, unknown>[];
    readonly chatModelOptions?: readonly ChatModelOption[];
    readonly mediaModelOptions?: readonly ChatModelOption[];
    readonly selectedMenuItem?: string | null;
    readonly queue?: ReturnType<typeof createTuiMessageQueue>;
    readonly tasks?: readonly Task[];
    readonly mcp?: TuiCommandRouterContext['ports']['mcp'];
    readonly capability?: TuiCapabilityPorts;
    readonly artifact?: TuiArtifactPorts;
  } = {},
): TuiCommandRouterContext {
  const skills = overrides.skills ?? [
    {
      name: 'review',
      description: 'Review changes',
      content: 'Review instructions',
      enabled: true,
    },
  ];
  const chatModelOptions = overrides.chatModelOptions ?? [
    {
      id: 'anthropic:gpt-5.3-codex',
      label: 'Anthropic / GPT 5.3 Codex',
      providerId: 'anthropic',
      modelId: 'gpt-5.3-codex',
      providerExpressionProfileId: 'provider-expression:anthropic:gpt-5.3-codex',
      category: 'llm',
    },
  ];
  const mediaModelOptions = overrides.mediaModelOptions ?? [
    {
      id: 'openai:gpt-image-1',
      label: 'OpenAI / GPT Image',
      providerId: 'openai',
      modelId: 'gpt-image-1',
      providerExpressionProfileId: 'provider-expression:openai:gpt-image-1',
      category: 'image',
    },
    {
      id: 'runway:gen-4',
      label: 'Runway / Gen 4',
      providerId: 'runway',
      modelId: 'gen-4',
      category: 'video',
    },
  ];
  return {
    slash: {
      config: {
        ...DEFAULT_CLI_CONFIG,
        defaultMediaModels: {
          image: 'openai:gpt-image-1',
        },
        llmConfig: {
          reasoningPreset: 'deep',
        },
      },
      skillService: {
        registry: {
          skillCount: skills.length,
          listSkills: vi.fn(() => skills),
          listAllSkills: vi.fn(() => skills),
          getSkill: vi.fn((name: string) => skills.find((skill) => skill['name'] === name)),
          getSkillByCommand: vi.fn((command: string) =>
            skills.find((skill) => skill['command'] === command),
          ),
          searchSkills: vi.fn(() => []),
          ensureLoaded: vi.fn(),
        },
        skillCount: skills.length,
        apply: vi.fn(),
      } as never,
    },
    ports: {
      output: {
        info: vi.fn(),
        error: vi.fn(),
      },
      history: {
        clear: vi.fn(),
      },
      lifecycle: {
        exit: vi.fn(),
      },
      mode: {
        setExecutionMode: vi.fn(),
        getSessionMode: vi.fn((): TuiSessionMode => 'agent'),
        setSessionMode: vi.fn((mode: string) => `Session mode set to: ${mode}`),
      },
      model: {
        selectChatModel: vi.fn(),
        listChatModels: vi.fn(() => ['gpt-5.3-codex']),
        listChatModelOptions: vi.fn(() => chatModelOptions),
        selectMenuItem: vi.fn(async () => overrides.selectedMenuItem ?? null),
      },
      media: {
        listMediaModelOptions: vi.fn(() => mediaModelOptions),
        getCurrentMediaModels: vi.fn(() => ({ image: 'openai:gpt-image-1' })),
        setMediaModel: vi.fn(),
        resetMediaModels: vi.fn(),
      },
      parameters: {
        getConfig: vi.fn(() => ({ reasoningPreset: 'deep' as const })),
        validate: vi.fn((config) => ({
          config,
          chatOptions: config.reasoningPreset === 'deep' ? { thinkingBudget: 12000 } : {},
          providerOptions: {},
          summary:
            config.reasoningPreset === 'deep'
              ? 'Applied: thinkingBudget=12000'
              : 'Applied: provider defaults',
        })),
        apply: vi.fn(),
      },
      skill: {
        listEnabled: vi.fn(() =>
          skills.map((skill) => ({
            name: String(skill['name']),
            description:
              typeof skill['description'] === 'string' ? skill['description'] : undefined,
          })),
        ),
        getActiveSkillName: vi.fn(() => null),
        getActiveRecords: vi.fn(() => overrides.activeRecords ?? []),
        activate: vi.fn(() => true),
        deactivate: vi.fn(() => true),
      },
      context: {
        getTokenCount: overrides.getTokenCount,
        compact: overrides.compact,
      },
      queue: overrides.queue
        ? {
            getSnapshot: () => overrides.queue!.snapshot(),
            promote: (queueItemId) => overrides.queue!.promote(queueItemId),
            cancel: (queueItemId) => overrides.queue!.cancel(queueItemId),
            edit: (queueItemId, content) => overrides.queue!.edit(queueItemId, content),
          }
        : undefined,
      task: overrides.tasks
        ? {
            list: vi.fn(() => overrides.tasks!),
          }
        : undefined,
      mcp:
        overrides.mcp === undefined && 'mcp' in overrides
          ? undefined
          : (overrides.mcp ?? {
              listServers: vi.fn(() => [
                {
                  id: 'filesystem',
                  name: 'filesystem',
                  enabled: true,
                  connected: true,
                  transport: 'stdio',
                  toolCount: 2,
                },
                {
                  id: 'asset-library',
                  name: 'Asset Library',
                  enabled: true,
                  connected: false,
                  transport: 'http',
                  toolCount: 0,
                },
                {
                  id: 'disabled-server',
                  name: 'Disabled Server',
                  enabled: false,
                  connected: false,
                  transport: 'stdio',
                  toolCount: 0,
                },
              ]),
              listTools: vi.fn((serverId?: string) => {
                const tools = [
                  'mcp__filesystem__read_file',
                  'mcp__filesystem__search',
                  'mcp__asset-library__lookup',
                ];
                return serverId
                  ? tools.filter((tool) => tool.startsWith(`mcp__${serverId}__`))
                  : tools;
              }),
              connect: vi.fn(),
              disconnect: vi.fn(),
              reconnect: vi.fn(),
            }),
      capability:
        overrides.capability === undefined && 'capability' in overrides
          ? undefined
          : (overrides.capability ??
            ({
              getProviderSummaries: vi.fn(
                (): ReturnType<TuiCapabilityPorts['getProviderSummaries']> => [
                  {
                    providerId: 'neko-assets',
                    version: '1.0.0',
                    loaded: [{ kind: 'tool' as const, name: 'assets.list' }],
                    skipped: [],
                  },
                  {
                    providerId: 'neko-cut',
                    version: '1.0.0',
                    loaded: [],
                    skipped: [
                      {
                        level: 'warn' as const,
                        providerId: 'neko-cut',
                        contributionKind: 'provider' as const,
                        code: 'capability.provider.host-not-supported',
                        reason: 'host-not-supported',
                        message: 'Provider is not TUI-safe.',
                        host: 'tui',
                      },
                    ],
                  },
                ],
              ),
              getDiagnostics: vi.fn((): ReturnType<TuiCapabilityPorts['getDiagnostics']> => [
                {
                  level: 'warn' as const,
                  providerId: 'neko-cut',
                  contributionKind: 'provider' as const,
                  code: 'capability.provider.host-not-supported',
                  reason: 'host-not-supported',
                  message: 'Provider is not TUI-safe.',
                  host: 'tui',
                },
              ]),
              listTools: vi.fn((providerId?: string): readonly string[] =>
                providerId === undefined || providerId === 'neko-assets' ? ['assets.list'] : [],
              ),
            } satisfies TuiCapabilityPorts)),
      artifact: overrides.artifact,
      status: {
        getSnapshot: vi.fn(() => ({
          sessionMode: 'agent' as TuiSessionMode,
          executionMode: 'auto' as TuiExecutionMode,
          agentStatus: 'idle',
          tokensTotal: 42,
          chatModelIdentity: 'anthropic:claude-sonnet-4-20250514',
          mediaModelSummary: 'image=openai:gpt-image-1',
          llmParameterSummary: 'reasoning=deep',
          queueCount: overrides.queue?.snapshot().pendingCount ?? 0,
          runningTaskSummary: overrides.tasks
            ?.filter((task) => task.status === 'pending' || task.status === 'running')
            .map((task) => `${task.status}:${task.id}`)
            .join(', '),
        })),
      },
    },
  };
}

function createTask(overrides: {
  readonly id: string;
  readonly status: Task['status'];
  readonly progress: number;
  readonly payload?: Record<string, unknown>;
  readonly lifecycle?: Partial<NonNullable<Task['lifecycle']>>;
}): Task {
  return {
    id: overrides.id,
    type: 'image_generation',
    status: overrides.status,
    input: {
      type: 'image_generation',
      payload: overrides.payload ?? {},
      ...(overrides.lifecycle ? { lifecycle: overrides.lifecycle } : {}),
    },
    progress: overrides.progress,
    createdAt: 1,
    updatedAt: 2,
    ...(overrides.lifecycle
      ? {
          lifecycle: {
            runMode: 'foreground',
            costPhase: 'idle',
            interruptPolicy: 'cancel-with-agent',
            recoverPolicy: 'retry-executor',
            ...overrides.lifecycle,
          },
        }
      : {}),
  };
}
