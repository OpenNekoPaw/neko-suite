import type { CommandResult } from './types';

export interface ExtensionCommandConversationSummary {
  id: string;
  title: string;
  messageCount: number;
}

export interface ExtensionCommandConversationSummarySource {
  id: string;
  title: string;
  messages?: readonly unknown[];
}

export interface ExtensionCommandResultPayload {
  type: 'slashCommandResult';
  conversationId: string;
  command: string;
  success: boolean;
  action?: string;
  data?: Record<string, unknown>;
  message?: string;
  error?: string;
}

export interface BuildExtensionCommandResultPayloadInput {
  conversationId: string;
  command: string;
  result: CommandResult;
  resumeConversations?: readonly ExtensionCommandConversationSummary[];
}

export type ExtensionSkillCommandResultStatus = 'activated' | 'failed' | 'unknown';

export interface BuildExtensionSkillCommandResultPayloadInput {
  conversationId: string;
  command: string;
  status: ExtensionSkillCommandResultStatus;
  error?: string;
}

export type ExtensionCommandHostEffect =
  | { type: 'clearAgentHistory'; conversationId: string }
  | { type: 'postHistoryCleared'; conversationId: string }
  | { type: 'refreshConversationList' }
  | { type: 'refreshActiveConversation' }
  | { type: 'sendTasks'; conversationId: string }
  | {
      type: 'executePlanPrompt';
      conversationId: string;
      messageText: string;
      sessionMode: 'agent';
    };

export interface ExtensionCommandHostEffectPlan {
  beforeResult: ExtensionCommandHostEffect[];
  afterResult: ExtensionCommandHostEffect[];
}

export interface BuildExtensionCommandHostEffectPlanInput {
  result: CommandResult;
  activeConversationId?: string;
  isPlanMode: boolean;
  rawArgs?: string;
}

const OUTPUT_SUPPRESSED_ACTIONS = new Set([
  'showHelp',
  'showStatus',
  'showModelSelector',
  'showSettings',
  'showPermissions',
  'showTasks',
  'showMCPServers',
  'resumeConversation',
  'initProject',
]);

export function normalizeSlashCommandName(command: string): string {
  return command.startsWith('/') ? command.slice(1) : command;
}

export function parseBuiltinCommandArgs(rawArgs?: string): string[] {
  if (!rawArgs) return [];

  return rawArgs
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

export function buildExtensionCommandResultPayload(
  input: BuildExtensionCommandResultPayloadInput,
): ExtensionCommandResultPayload {
  const data = getExtensionCommandData(input.result, input.resumeConversations);
  const message = getExtensionCommandMessage(input.result);

  return {
    type: 'slashCommandResult',
    conversationId: input.conversationId,
    command: input.command,
    success: !input.result.error,
    ...(input.result.action ? { action: input.result.action } : {}),
    ...(data ? { data } : {}),
    ...(message ? { message } : {}),
    ...(input.result.error ? { error: input.result.error } : {}),
  };
}

export function buildExtensionSkillCommandResultPayload(
  input: BuildExtensionSkillCommandResultPayloadInput,
): ExtensionCommandResultPayload {
  if (input.status === 'activated') {
    return {
      type: 'slashCommandResult',
      conversationId: input.conversationId,
      command: input.command,
      success: true,
      message: `Command /${input.command} activated`,
    };
  }

  return {
    type: 'slashCommandResult',
    conversationId: input.conversationId,
    command: input.command,
    success: false,
    error:
      input.error ??
      (input.status === 'unknown'
        ? `Unknown command: /${input.command}. Type /help for available commands.`
        : `Failed to execute command: /${input.command}`),
  };
}

export function buildExtensionCommandConversationSummaries(
  conversations: readonly ExtensionCommandConversationSummarySource[],
  options: {
    getMessageCount?: (conversationId: string) => number | undefined;
  } = {},
): ExtensionCommandConversationSummary[] {
  return conversations.map((conversation) => ({
    id: conversation.id,
    title: conversation.title,
    messageCount: options.getMessageCount?.(conversation.id) ?? conversation.messages?.length ?? 0,
  }));
}

export function shouldExecutePlanPromptAfterToggle(input: {
  result: CommandResult;
  isPlanMode: boolean;
  rawArgs?: string;
}): boolean {
  return (
    input.result.action === 'togglePlanMode' &&
    input.isPlanMode &&
    typeof input.rawArgs === 'string' &&
    input.rawArgs.trim().length > 0
  );
}

export function buildExtensionCommandHostEffectPlan(
  input: BuildExtensionCommandHostEffectPlanInput,
): ExtensionCommandHostEffectPlan {
  const beforeResult: ExtensionCommandHostEffect[] = [];
  const afterResult: ExtensionCommandHostEffect[] = [];

  if (input.result.action === 'clearHistory') {
    if (input.activeConversationId) {
      beforeResult.push({
        type: 'clearAgentHistory',
        conversationId: input.activeConversationId,
      });
      beforeResult.push({
        type: 'postHistoryCleared',
        conversationId: input.activeConversationId,
      });
    }
  }

  if (input.result.action === 'newConversation') {
    beforeResult.push({ type: 'refreshConversationList' }, { type: 'refreshActiveConversation' });
  }

  if (input.result.action === 'showTasks' && input.activeConversationId) {
    beforeResult.push({
      type: 'sendTasks',
      conversationId: input.activeConversationId,
    });
  }

  if (
    input.activeConversationId &&
    shouldExecutePlanPromptAfterToggle({
      result: input.result,
      isPlanMode: input.isPlanMode,
      rawArgs: input.rawArgs,
    })
  ) {
    afterResult.push({
      type: 'executePlanPrompt',
      conversationId: input.activeConversationId,
      messageText: input.rawArgs?.trim() ?? '',
      sessionMode: 'agent',
    });
  }

  return { beforeResult, afterResult };
}

function getExtensionCommandData(
  result: CommandResult,
  resumeConversations: readonly ExtensionCommandConversationSummary[] | undefined,
): Record<string, unknown> | undefined {
  if (result.action === 'resumeConversation') {
    return { conversations: resumeConversations ?? [] };
  }

  return result.data;
}

function getExtensionCommandMessage(result: CommandResult): string | undefined {
  if (result.action === 'clearHistory') {
    return 'Conversation cleared';
  }

  if (result.action && OUTPUT_SUPPRESSED_ACTIONS.has(result.action)) {
    return undefined;
  }

  return result.output;
}
