import type { Skill, SkillApplicationResult } from '@neko/shared';
import { createSkillExecutionIdcMetadata } from '../session/idc-execution-metadata';
import {
  buildExtensionCommandConversationSummaries,
  buildExtensionCommandHostEffectPlan,
  buildExtensionCommandResultPayload,
  buildExtensionSkillCommandResultPayload,
  normalizeSlashCommandName,
  parseBuiltinCommandArgs,
  type ExtensionCommandConversationSummarySource,
  type ExtensionCommandHostEffect,
  type ExtensionCommandResultPayload,
} from './extension-command-presenter';
import { resolveSlashCommandCatalogEntry, type SlashCommandSkillLike } from './command-catalog';
import { getCommandHandler } from './command-executor';
import { handleStatus } from './handlers';
import type { CommandContext, CommandResult } from './types';

export interface ExtensionSlashCommandRuntimeInput {
  command: string;
  args?: string;
  conversationId: string;
}

export interface ExtensionSlashCommandRuntimeResult {
  command: string;
  handled: boolean;
  source: 'builtin' | 'skill' | 'unknown';
}

export interface ExtensionSlashCommandConversationSource {
  list(): readonly ExtensionCommandConversationSummarySource[];
  getMessageCount(conversationId: string): number | undefined;
  create(): string;
  clearCurrent(conversationId: string): void;
}

export interface ExtensionSlashCommandSkillSource {
  skillCount(): number;
  listSkills(): SlashCommandSkillLike[];
  listAllSkills(): SlashCommandSkillLike[];
  getSkill(name: string): unknown | undefined;
  getSkillByCommand(name: string): unknown | undefined;
  searchSkills(keyword: string): SlashCommandSkillLike[];
  getActiveSkillName(conversationId: string): string | null;
  clearActiveSkill(conversationId: string): void;
  applySlashCommand(input: {
    command: string;
    conversationId: string;
    args?: string;
  }): Promise<SkillApplicationResult | null>;
}

export interface ExtensionSlashCommandSettingsSource {
  provider?: string | null;
  model?: string | null;
  executionMode?: string | null;
}

export interface ExtensionSlashCommandPlanModeSource {
  isEnabled(conversationId: string): boolean;
  toggle(conversationId: string): boolean;
}

export interface ExtensionSlashCommandContextManager {
  getTokenCount(conversationId: string): number;
  compress(conversationId: string): Promise<void>;
}

export interface ExtensionSlashCommandRuntimeDeps {
  conversations: ExtensionSlashCommandConversationSource;
  skills?: ExtensionSlashCommandSkillSource;
  settings?: ExtensionSlashCommandSettingsSource;
  planMode?: ExtensionSlashCommandPlanModeSource;
  contextManager?: ExtensionSlashCommandContextManager;
}

export interface ExtensionSlashCommandExecutionDispatch {
  conversationId: string;
  messageText: string;
  sessionMode: 'agent';
  executionOverrides?: {
    metadata?: Record<string, unknown>;
  };
}

export interface ExtensionSlashCommandRuntimeEffects {
  postMessage(message: ExtensionCommandResultPayload): void | Promise<void>;
  executeHostEffect(effect: ExtensionCommandHostEffect): void | Promise<void>;
  executeSkillPrompt?(dispatch: ExtensionSlashCommandExecutionDispatch): void | Promise<void>;
}

export function runExtensionSlashCommandRuntime(
  input: ExtensionSlashCommandRuntimeInput,
  deps: ExtensionSlashCommandRuntimeDeps,
  effects: ExtensionSlashCommandRuntimeEffects,
): Promise<ExtensionSlashCommandRuntimeResult> | ExtensionSlashCommandRuntimeResult {
  const command = normalizeSlashCommandName(input.command);
  const context = createExtensionSlashCommandContext(input.conversationId, deps);
  const commandEntry = resolveSlashCommandCatalogEntry(command, {
    surface: 'extension',
    skills: deps.skills?.listAllSkills(),
  });

  if (commandEntry?.source === 'builtin') {
    const handler = getCommandHandler(command);
    if (!handler) {
      return runExtensionSkillSlashCommand(command, input, deps, effects);
    }

    const result = handler(parseBuiltinCommandArgs(input.args), context);
    if (isPromiseLike(result)) {
      return result.then(async (resolved) => {
        await dispatchBuiltinSlashCommandResult(command, input, deps, effects, resolved);
        return { command, handled: true, source: 'builtin' };
      });
    }

    const dispatched = dispatchBuiltinSlashCommandResult(command, input, deps, effects, result);
    if (isPromiseLike(dispatched)) {
      return dispatched.then(() => ({ command, handled: true, source: 'builtin' }));
    }

    return { command, handled: true, source: 'builtin' };
  }

  return runExtensionSkillSlashCommand(command, input, deps, effects);
}

export function buildExtensionSlashStatusPayload(input: {
  conversationId: string;
  deps: ExtensionSlashCommandRuntimeDeps;
}): ExtensionCommandResultPayload {
  const result = handleStatus(
    [],
    createExtensionSlashCommandContext(input.conversationId, input.deps),
  );

  return buildExtensionCommandResultPayload({
    conversationId: input.conversationId,
    command: 'status',
    result: isPromiseLike(result)
      ? {
          handled: false,
          continueExecution: true,
          error: 'Status command returned an asynchronous result unexpectedly',
        }
      : result,
  });
}

function createExtensionSlashCommandContext(
  conversationId: string,
  deps: ExtensionSlashCommandRuntimeDeps,
): CommandContext {
  return {
    skillService: {
      registry: {
        skillCount: deps.skills?.skillCount() ?? 0,
        listSkills: () => deps.skills?.listSkills() ?? [],
        listAllSkills: () => deps.skills?.listAllSkills() ?? [],
        getSkill: (name: string) => deps.skills?.getSkill(name),
        getSkillByCommand: (name: string) => deps.skills?.getSkillByCommand(name),
        searchSkills: (keyword: string) => deps.skills?.searchSkills(keyword) ?? [],
      },
      skillCount: deps.skills?.skillCount() ?? 0,
      getActiveSkill: () => {
        const name = deps.skills?.getActiveSkillName(conversationId);
        return name ? { name } : null;
      },
      clearActiveSkill: () => deps.skills?.clearActiveSkill(conversationId),
    },
    config: {
      provider: deps.settings?.provider ?? undefined,
      model: deps.settings?.model ?? undefined,
      executionMode: deps.settings?.executionMode ?? undefined,
    },
    conversations: {
      list: () => deps.conversations.list().map(({ id, title }) => ({ id, title })),
      getActiveId: () => conversationId,
      getActiveMessageCount: () => deps.conversations.getMessageCount(conversationId) ?? 0,
      create: () => deps.conversations.create(),
      clearCurrent: () => deps.conversations.clearCurrent(conversationId),
    },
    planMode: {
      isEnabled: () => deps.planMode?.isEnabled(conversationId) ?? false,
      toggle: () => deps.planMode?.toggle(conversationId) ?? false,
    },
    contextManager: {
      getTokenCount: (id: string) => deps.contextManager?.getTokenCount(id) ?? 0,
      compress: async (id: string) => {
        await deps.contextManager?.compress(id);
      },
    },
  };
}

function dispatchBuiltinSlashCommandResult(
  command: string,
  input: ExtensionSlashCommandRuntimeInput,
  deps: ExtensionSlashCommandRuntimeDeps,
  effects: ExtensionSlashCommandRuntimeEffects,
  result: CommandResult,
): void | Promise<void> {
  if (result.action === 'showStatus') {
    return effects.postMessage(
      buildExtensionSlashStatusPayload({ conversationId: input.conversationId, deps }),
    );
  }

  const effectPlan = buildExtensionCommandHostEffectPlan({
    result,
    isPlanMode: deps.planMode?.isEnabled(input.conversationId) ?? false,
    ...(input.conversationId ? { activeConversationId: input.conversationId } : {}),
    ...(input.args !== undefined ? { rawArgs: input.args } : {}),
  });

  const before = executeHostEffects(effectPlan.beforeResult, effects);
  if (isPromiseLike(before)) {
    return before.then(() => {
      const posted = postBuiltinResult(command, input.conversationId, result, deps, effects);
      const after = executeHostEffects(effectPlan.afterResult, effects);
      return waitForPostAndAfterEffects(posted, after);
    });
  }

  const posted = postBuiltinResult(command, input.conversationId, result, deps, effects);
  const after = executeHostEffects(effectPlan.afterResult, effects);
  return waitForPostAndAfterEffects(posted, after);
}

function postBuiltinResult(
  command: string,
  conversationId: string,
  result: CommandResult,
  deps: ExtensionSlashCommandRuntimeDeps,
  effects: ExtensionSlashCommandRuntimeEffects,
): void | Promise<void> {
  return effects.postMessage(
    buildExtensionCommandResultPayload({
      conversationId,
      command,
      result,
      resumeConversations:
        result.action === 'resumeConversation'
          ? buildExtensionCommandConversationSummaries(deps.conversations.list(), {
              getMessageCount: (conversationId) =>
                deps.conversations.getMessageCount(conversationId),
            })
          : undefined,
    }),
  );
}

function executeHostEffects(
  hostEffects: readonly ExtensionCommandHostEffect[],
  effects: ExtensionSlashCommandRuntimeEffects,
): void | Promise<void> {
  for (let index = 0; index < hostEffects.length; index += 1) {
    const effect = hostEffects[index];
    if (!effect) continue;

    const executed = effects.executeHostEffect(effect);
    if (isPromiseLike(executed)) {
      return executed.then(() => executeHostEffects(hostEffects.slice(index + 1), effects));
    }
  }
}

function waitForPostAndAfterEffects(
  posted: void | Promise<void>,
  after: void | Promise<void>,
): void | Promise<void> {
  if (isPromiseLike(posted) && isPromiseLike(after)) {
    return Promise.all([posted, after]).then(() => undefined);
  }
  if (isPromiseLike(posted)) {
    return posted;
  }
  return after;
}

async function runExtensionSkillSlashCommand(
  command: string,
  input: ExtensionSlashCommandRuntimeInput,
  deps: ExtensionSlashCommandRuntimeDeps,
  effects: ExtensionSlashCommandRuntimeEffects,
): Promise<ExtensionSlashCommandRuntimeResult> {
  const result = await deps.skills?.applySlashCommand({
    command,
    conversationId: input.conversationId,
    ...(input.args !== undefined ? { args: input.args } : {}),
  });

  if (!result) {
    await effects.postMessage(
      buildExtensionSkillCommandResultPayload({
        conversationId: input.conversationId,
        command,
        status: 'unknown',
      }),
    );
    return { command, handled: false, source: 'unknown' };
  }

  if (!result.applied) {
    await effects.postMessage(
      buildExtensionSkillCommandResultPayload({
        conversationId: input.conversationId,
        command,
        status: 'failed',
        error: result.error,
      }),
    );
    return { command, handled: true, source: 'skill' };
  }

  await effects.postMessage(
    buildExtensionSkillCommandResultPayload({
      conversationId: input.conversationId,
      command,
      status: 'activated',
    }),
  );

  const nextPrompt = input.args?.trim();
  if (result.injection && nextPrompt) {
    await effects.executeSkillPrompt?.({
      conversationId: input.conversationId,
      messageText: nextPrompt,
      sessionMode: 'agent',
      ...createSkillExecutionOverrides(result.skill),
    });
  }

  return { command, handled: true, source: 'skill' };
}

function createSkillExecutionOverrides(
  skill: Skill | undefined,
): Pick<ExtensionSlashCommandExecutionDispatch, 'executionOverrides'> {
  const metadata = createSkillExecutionIdcMetadata(skill);
  if (!metadata) return {};

  return {
    executionOverrides: {
      metadata,
    },
  };
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object' && value !== null && 'then' in value;
}
