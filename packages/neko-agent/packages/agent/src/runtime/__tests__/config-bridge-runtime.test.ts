import { describe, expect, it, vi } from 'vitest';
import type {
  ConfiguredHook,
  ConfiguredSkill,
  ConfiguredSlashCommand,
  ConfiguredToolGroup,
  IAuthSession,
} from '@neko/shared';
import {
  SKILL_ENABLED_STATE_STORAGE_KEY,
  TOOL_SKILL_ENABLED_STATE_STORAGE_KEY,
  buildConfigBridgeGlobalErrorMessage,
  buildConfigBridgeSsoSessionChangedMessage,
  buildConfigChangedRuntimeMessage,
  createEnabledStateRuntimeStore,
  createHookConfigSyncRuntime,
  createSkillConfigSyncRuntime,
  createToolSkillConfigSyncRuntime,
  runConfigBridgeQueryRuntime,
  runConfigBridgeSsoLoginRuntime,
  runConfigBridgeSsoLogoutRuntime,
  type EnabledStateRuntimeStorage,
} from '../config-bridge-runtime';

describe('config-bridge-runtime', () => {
  it('loads, applies, and persists enabled state through an injected storage adapter', () => {
    const storage = createStorage({ 'skill:review': false });
    const store = createEnabledStateRuntimeStore({
      storageKey: SKILL_ENABLED_STATE_STORAGE_KEY,
      storage,
    });

    expect(store.get('skill:review')).toBe(false);
    expect(
      store.applyTo([makeSkill('review'), makeSkill('story')], (skill) => `skill:${skill.name}`),
    ).toEqual([{ ...makeSkill('review'), enabled: false }, makeSkill('story')]);

    store.set('skill:story', false);

    expect(storage.saved).toEqual({
      'skill:review': false,
      'skill:story': false,
    });
  });

  it('keeps skill and command sync state in runtime and preserves init idempotency', async () => {
    const scanSkills = vi.fn(async () => 'scan-1');
    const runtime = createSkillConfigSyncRuntime({
      enabledState: createEnabledStateRuntimeStore({
        storageKey: SKILL_ENABLED_STATE_STORAGE_KEY,
        storage: createStorage({ 'command:commit': false }),
      }),
      scanSkills,
      toConfigured: (scanResult: string) => ({
        skills: [makeSkill(scanResult)],
        commands: [makeCommand('commit')],
      }),
    });

    runtime.init();
    runtime.init();
    await runtime.waitForInit();

    expect(scanSkills).toHaveBeenCalledTimes(1);
    expect(runtime.getSkills().map((skill) => skill.name)).toEqual(['scan-1']);
    expect(runtime.getCommands()).toEqual([{ ...makeCommand('commit'), enabled: false }]);

    const changed = runtime.handleChanged('scan-2');

    expect(changed.skills.map((skill) => skill.name)).toEqual(['scan-2']);
    expect(runtime.getSkills().map((skill) => skill.name)).toEqual(['scan-2']);
  });

  it('keeps hook sync state and swallows init failures through logger', async () => {
    const logger = { error: vi.fn() };
    const runtime = createHookConfigSyncRuntime({
      scanHooks: async () => {
        throw new Error('denied');
      },
      toConfigured: (scanResult: ConfiguredHook[]) => scanResult,
      logger,
    });

    await runtime.init();

    expect(runtime.getHooks()).toEqual([]);
    expect(logger.error).toHaveBeenCalledWith(
      'Failed to initialize hook file sync:',
      expect.any(Error),
    );

    const changed = runtime.handleChanged([makeHook('post-tool')]);

    expect(changed).toEqual([makeHook('post-tool')]);
    expect(runtime.getHooks()).toEqual([makeHook('post-tool')]);
  });

  it('applies enabled state to tool skills in runtime', () => {
    const runtime = createToolSkillConfigSyncRuntime({
      enabledState: createEnabledStateRuntimeStore({
        storageKey: TOOL_SKILL_ENABLED_STATE_STORAGE_KEY,
        storage: createStorage({ media: false }),
      }),
    });

    expect(runtime.setToolSkills([makeToolSkill('media'), makeToolSkill('code')])).toEqual([
      { ...makeToolSkill('media'), enabled: false },
      makeToolSkill('code'),
    ]);
    expect(runtime.getToolSkills().map((toolSkill) => [toolSkill.name, toolSkill.enabled])).toEqual(
      [
        ['media', false],
        ['code', true],
      ],
    );
  });

  it('projects config bridge query requests into webview messages', async () => {
    const deps = {
      getConfigState: () => ({ providers: [{ id: 'openai', name: 'OpenAI', type: 'openai' }] }),
      getSkills: () => [makeSkill('review')],
      getCommands: () => [makeCommand('commit')],
      getHooks: () => [makeHook('post-tool')],
      getToolSkills: () => [makeToolSkill('media')],
    };

    await expect(runConfigBridgeQueryRuntime({ type: 'getConfig' }, deps)).resolves.toEqual({
      handled: true,
      message: {
        type: 'configState',
        config: { providers: [{ id: 'openai', name: 'OpenAI', type: 'openai' }] },
      },
    });
  });

  it('projects config sync broadcasts through runtime helpers', () => {
    expect(buildConfigChangedRuntimeMessage()).toEqual({ type: 'configChanged' });
  });

  it('projects bridge host events without extension-owned protocol builders', () => {
    const session = makeAuthSession({
      user: 'user@example.test',
      plan: 'pro',
    });

    expect(buildConfigBridgeSsoSessionChangedMessage(session)).toEqual({
      type: 'ssoSessionChanged',
      session: { user: 'user@example.test', plan: 'pro' },
    });
    expect(
      buildConfigBridgeGlobalErrorMessage({ action: 'getConfig', error: new Error('bad') }),
    ).toEqual({
      type: 'globalError',
      message: 'Failed to getConfig: bad',
    });
  });

  it('delegates SSO login/logout through config bridge runtime wrappers', async () => {
    const session = makeAuthSession({ user: 'user@example.test' });
    const posted: unknown[] = [];
    const auth = {
      login: vi.fn(async () => session),
      logout: vi.fn(async () => undefined),
    };

    await expect(
      runConfigBridgeSsoLoginRuntime(
        { force: true },
        {
          getAuth: async () => auth,
          postMessage: (message) => {
            posted.push(message);
          },
        },
      ),
    ).resolves.toEqual({
      status: 'authenticated',
      message: { type: 'ssoSessionChanged', session: { user: 'user@example.test' } },
    });
    await expect(
      runConfigBridgeSsoLogoutRuntime({
        getAuth: async () => auth,
        postMessage: (message) => {
          posted.push(message);
        },
      }),
    ).resolves.toEqual({
      status: 'cleared',
      message: { type: 'ssoSessionChanged', session: null },
    });

    expect(auth.login).toHaveBeenCalledWith({ force: true });
    expect(auth.logout).toHaveBeenCalled();
    expect(posted).toEqual([
      { type: 'ssoSessionChanged', session: { user: 'user@example.test' } },
      { type: 'ssoSessionChanged', session: null },
    ]);
  });
});

function makeAuthSession(input: Pick<IAuthSession, 'user'> & Partial<IAuthSession>): IAuthSession {
  return {
    user: input.user,
    accessToken: input.accessToken ?? 'access-token',
    expiresAt: input.expiresAt ?? 1777392000000,
    ...(input.plan !== undefined ? { plan: input.plan } : {}),
    ...(input.usage !== undefined ? { usage: input.usage } : {}),
    ...(input.refreshToken !== undefined ? { refreshToken: input.refreshToken } : {}),
  };
}

interface TestStorage extends EnabledStateRuntimeStorage {
  saved: Record<string, boolean> | null;
}

function createStorage(record: Record<string, boolean>): TestStorage {
  return {
    saved: null,
    load: () => record,
    save(storageKey, state) {
      expect(storageKey).toBeTypeOf('string');
      this.saved = { ...state };
    },
  };
}

function makeSkill(name: string): ConfiguredSkill {
  return {
    name,
    description: `${name} description`,
    content: `${name} content`,
    source: 'personal',
    enabled: true,
  };
}

function makeCommand(command: string): ConfiguredSlashCommand {
  return {
    command,
    description: `${command} description`,
    content: `${command} content`,
    source: 'personal',
    enabled: true,
  };
}

function makeHook(name: string): ConfiguredHook {
  return {
    name,
    description: `${name} description`,
    event: 'PostToolUse',
    action: `${name} action`,
    source: 'personal',
    enabled: true,
  };
}

function makeToolSkill(name: string): ConfiguredToolGroup {
  return {
    name,
    description: `${name} description`,
    tools: [],
    source: 'builtin',
    enabled: true,
  };
}
