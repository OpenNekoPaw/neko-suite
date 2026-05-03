import { describe, expect, it } from 'vitest';
import {
  projectChatWorkspaceModelState,
  projectConfigStateMessage,
  projectMarketplaceError,
  projectMediaModelSelectionDefaults,
  projectMediaModelSelectionForSessionModeChange,
  projectMessageModelSelection,
  projectPluginCommandsMessage,
  projectPluginsAvailableMessage,
  projectProjectFilesMessage,
  projectSettingsDataMessage,
  projectSettingsMutationError,
  projectSsoErrorMessage,
  projectSsoSessionChangedMessage,
} from '../config-message-presenter';
import {
  buildConfigChangedMessage,
  buildConfigStateMessage,
  buildHooksDataMessage,
  buildSkillsDataMessage,
  buildToolSkillsDataMessage,
} from '@neko-agent/types';

describe('config message presenter', () => {
  it('projects settings data without overwriting configured providers', () => {
    expect(
      projectSettingsDataMessage({
        type: 'settingsData',
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            isConfigured: true,
            models: [{ id: 'gpt', name: 'GPT', description: 'Chat model' }],
          },
        ],
        selectedProviderId: 'openai',
        selectedModelId: 'gpt',
        systemPrompt: 'Prompt',
        autoExecuteTools: false,
        streamResponses: false,
        showToolCalls: false,
        temperature: 0.2,
        maxTokens: 2048,
        executionMode: 'auto',
        chatModelOptions: [
          {
            id: 'openai:gpt',
            label: 'OpenAI / GPT',
            providerId: 'openai',
            modelId: 'gpt',
            capabilities: ['chat', 'vision'],
          },
        ],
        defaultMediaModels: {
          image: 'image-provider:model',
        },
      }),
    ).toEqual({
      settingsPatch: {
        providers: [
          {
            id: 'openai',
            name: 'OpenAI',
            isConfigured: true,
            models: [{ id: 'gpt', name: 'GPT', description: 'Chat model' }],
          },
        ],
        selectedProviderId: 'openai',
        selectedModelId: 'gpt',
        systemPrompt: 'Prompt',
        autoExecuteTools: false,
        streamResponses: false,
        showToolCalls: false,
        temperature: 0.2,
        maxTokens: 2048,
        executionMode: 'auto',
        chatModelOptions: [
          {
            id: 'openai:gpt',
            label: 'OpenAI / GPT',
            providerId: 'openai',
            modelId: 'gpt',
            capabilities: ['chat', 'vision'],
          },
        ],
      },
      selectedModel: 'openai:gpt',
      defaultMediaModels: {
        image: 'image-provider:model',
      },
    });
  });

  it('projects project files and mention extras into mention items', () => {
    expect(
      projectProjectFilesMessage({
        type: 'projectFiles',
        conversationId: 'conv-1',
        files: [{ path: 'src/index.ts', name: 'index.ts', type: 'file' }],
        mentionExtras: [
          {
            type: 'character',
            id: 'char-1',
            label: 'Hero',
            summary: 'Main character',
          },
        ],
      }),
    ).toEqual({
      projectFiles: [{ path: 'src/index.ts', name: 'index.ts', type: 'file' }],
      mentionItems: [
        {
          id: 'file:src/index.ts',
          kind: 'file',
          label: 'index.ts',
          description: 'src/index.ts',
          filePath: 'src/index.ts',
        },
        {
          id: 'character:char-1',
          kind: 'character',
          label: 'Hero',
          description: 'character',
          contextPayload: {
            type: 'character',
            id: 'char-1',
            label: 'Hero',
            summary: 'Main character',
            data: {
              type: 'character',
              id: 'char-1',
              label: 'Hero',
              summary: 'Main character',
            },
          },
        },
      ],
    });
  });

  it('applies media model defaults only to empty selections', () => {
    const projection = projectMediaModelSelectionDefaults({
      selection: {
        image: 'none',
        video: 'existing-video',
        audio: 'none',
      },
      defaults: {
        image: 'image-provider:model',
        video: 'video-provider:model',
      },
    });

    expect(projection).toEqual({
      selection: {
        image: 'image-provider:model',
        video: 'existing-video',
        audio: 'none',
      },
      updated: true,
    });

    expect(
      projectMediaModelSelectionDefaults({
        selection: projection.selection,
        defaults: { image: 'another:model' },
      }),
    ).toEqual({
      selection: projection.selection,
      updated: false,
    });
  });

  it('projects selected chat and media models for sendMessage payloads', () => {
    expect(
      projectMessageModelSelection({
        selectedModel: 'openai:gpt-4.1',
        sessionMode: 'agent',
        agentMediaModels: {
          image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
        },
      }),
    ).toEqual({
      chatModel: { providerId: 'openai', modelId: 'gpt-4.1', category: 'llm' },
      mediaModels: {
        image: { providerId: 'flux', modelId: 'flux-pro', category: 'image' },
      },
    });

    expect(
      projectMessageModelSelection({
        selectedModel: 'auto',
        sessionMode: 'video',
        mediaProviderId: 'runway',
        mediaModelId: 'gen-4',
      }),
    ).toEqual({
      mediaModel: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
    });

    expect(
      projectMessageModelSelection({
        selectedModel: 'auto',
        sessionMode: 'image',
        mediaProviderId: 'openai',
        mediaModelId: 'none',
      }),
    ).toEqual({});
  });

  it('projects chat workspace model lists and agent media selections', () => {
    const projection = projectChatWorkspaceModelState({
      chatModelOptions: [
        { id: 'auto', label: 'Auto', providerId: '', modelId: '' },
        {
          id: 'openai:gpt-4.1',
          label: 'OpenAI / GPT 4.1',
          providerId: 'openai',
          modelId: 'gpt-4.1',
          category: 'llm',
        },
        {
          id: 'flux:pro',
          label: 'Flux / Pro',
          providerId: 'flux',
          modelId: 'pro',
          category: 'image',
        },
        {
          id: 'runway:gen-4',
          label: 'Runway / Gen 4',
          providerId: 'runway',
          modelId: 'gen-4',
          category: 'video',
        },
        {
          id: 'suno:chirp',
          label: 'Suno / Chirp',
          providerId: 'suno',
          modelId: 'chirp',
          category: 'music',
        },
      ],
      sessionMode: 'agent',
      mediaModelSelection: {
        image: 'flux:pro',
        video: 'runway:gen-4',
        audio: 'none',
      },
    });

    expect(projection.availableModels.map((model) => model.id)).toEqual([
      'auto',
      'openai:gpt-4.1',
      'suno:chirp',
    ]);
    expect(projection.availableMediaModels.map((model) => model.id)).toEqual([
      'flux:pro',
      'runway:gen-4',
    ]);
    expect(projection.activeMediaModel).toBeUndefined();
    expect(projection.agentMediaModels).toEqual({
      image: { providerId: 'flux', modelId: 'pro', category: 'image' },
      video: { providerId: 'runway', modelId: 'gen-4', category: 'video' },
    });
  });

  it('projects direct media mode active model and default model list fallback', () => {
    expect(
      projectChatWorkspaceModelState({
        chatModelOptions: [],
        sessionMode: 'agent',
        mediaModelSelection: { image: 'none', video: 'none', audio: 'none' },
      }),
    ).toMatchObject({
      allModels: [{ id: 'auto', label: 'Auto', providerId: '', modelId: '' }],
      availableModels: [{ id: 'auto', label: 'Auto', providerId: '', modelId: '' }],
      availableMediaModels: [],
    });

    const directProjection = projectChatWorkspaceModelState({
      chatModelOptions: [
        {
          id: 'runway:gen-4',
          label: 'Runway / Gen 4',
          providerId: 'runway',
          modelId: 'gen-4',
          category: 'video',
        },
      ],
      sessionMode: 'video',
      mediaModelSelection: { image: 'none', video: 'runway:gen-4', audio: 'none' },
    });

    expect(directProjection.activeMediaModel?.id).toBe('runway:gen-4');
    expect(directProjection.agentMediaModels).toBeUndefined();
  });

  it('projects media model selection changes from session mode transitions', () => {
    expect(
      projectMediaModelSelectionForSessionModeChange({
        sessionMode: 'video',
        mediaModelSelection: { image: 'flux:pro', video: 'none', audio: 'none' },
        chatModelOptions: [
          {
            id: 'runway:gen-4',
            label: 'Runway / Gen 4',
            providerId: 'runway',
            modelId: 'gen-4',
            category: 'video',
          },
        ],
      }),
    ).toEqual({
      sessionMode: 'video',
      mediaModelSelection: {
        image: 'flux:pro',
        video: 'runway:gen-4',
        audio: 'none',
      },
      updated: true,
    });

    expect(
      projectMediaModelSelectionForSessionModeChange({
        sessionMode: 'agent',
        mediaModelSelection: { image: 'flux:pro', video: 'runway:gen-4', audio: 'none' },
        chatModelOptions: [],
      }),
    ).toEqual({
      sessionMode: 'agent',
      mediaModelSelection: {
        image: 'flux:pro',
        video: 'runway:gen-4',
        audio: 'none',
      },
      updated: false,
    });
  });

  it('projects config state, plugin commands, plugin availability, and errors', () => {
    const configuredProviders = [
      {
        id: 'openai',
        name: 'OpenAI',
        type: 'openai' as const,
        enabled: true,
        isConfigured: true,
        models: [],
      },
    ];

    expect(buildConfigStateMessage({ configuredProviders })).toEqual({
      type: 'configState',
      config: { configuredProviders },
    });
    expect(buildConfigChangedMessage()).toEqual({ type: 'configChanged' });
    expect(buildSkillsDataMessage({ skills: [], commands: [] })).toEqual({
      type: 'skillsData',
      skills: [],
      commands: [],
    });
    expect(buildHooksDataMessage([])).toEqual({ type: 'hooksData', hooks: [] });
    expect(buildToolSkillsDataMessage([])).toEqual({
      type: 'toolSkillsData',
      toolSkills: [],
    });

    expect(
      projectConfigStateMessage({
        type: 'configState',
        config: { configuredProviders },
      }),
    ).toEqual({ configuredProviders });

    expect(
      projectPluginCommandsMessage({
        type: 'pluginCommands',
        commands: [
          {
            id: 'cmd-1',
            name: '/plugin',
            description: 'Run plugin command',
            extensionId: 'plugin.test',
          },
        ],
      }),
    ).toEqual([
      {
        id: 'cmd-1',
        name: '/plugin',
        description: 'Run plugin command',
        extensionId: 'plugin.test',
      },
    ]);

    expect(
      projectPluginsAvailableMessage({
        type: 'pluginsAvailable',
        plugins: { canvas: true },
      }),
    ).toEqual({ canvas: true });

    expect(projectSettingsMutationError({ type: 'settingsUpdated', success: false })).toBe(
      'Settings update failed.',
    );
    expect(projectMarketplaceError({ type: 'market:error', error: 'Market failed' })).toBe(
      'Market failed',
    );
  });

  it('projects SSO session and error messages for account UI', () => {
    expect(
      projectSsoSessionChangedMessage({
        type: 'ssoSessionChanged',
        session: { user: 'user@example.com', plan: 'Pro' },
      }),
    ).toEqual({
      settingsPatch: { ssoSession: { user: 'user@example.com', plan: 'Pro' } },
      showOnboarding: false,
    });

    expect(
      projectSsoSessionChangedMessage({
        type: 'ssoSessionChanged',
        session: null,
      }),
    ).toEqual({
      settingsPatch: { ssoSession: null },
      showOnboarding: undefined,
    });

    expect(projectSsoErrorMessage({ type: 'ssoError', error: 'Login failed' })).toEqual({
      globalError: 'Login failed',
      showOnboarding: true,
    });
  });
});
