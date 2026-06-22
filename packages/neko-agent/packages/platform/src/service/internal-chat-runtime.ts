import type { ChatMessage } from '../types/adapter';
import type { ServiceOptions, ServiceResponse } from '../types/service';

export const INTERNAL_CHAT_DEFAULT_MAX_TOKENS = 1000;

export interface InternalChatRuntimeService {
  chat(messages: ChatMessage[], options?: ServiceOptions): Promise<ServiceResponse>;
}

export interface InternalChatRuntimeLogger {
  warn(message: string, details?: unknown): void;
}

export interface InternalChatRuntimeInput {
  messages: ChatMessage[];
  options?: ServiceOptions;
}

export interface InternalChatRuntimeDeps {
  createService?: () => InternalChatRuntimeService;
  getSelectedChatModel?: () => { providerId?: string | null; modelId?: string | null } | undefined;
  logger?: InternalChatRuntimeLogger;
}

export async function runInternalChatRuntime(
  input: InternalChatRuntimeInput,
  deps: InternalChatRuntimeDeps,
): Promise<string | null> {
  if (!deps.createService) {
    return null;
  }

  try {
    const selectedChatModel = deps.getSelectedChatModel?.();
    if (!selectedChatModel?.providerId || !selectedChatModel.modelId) {
      throw new Error(
        'Internal chat requires a configured LLM provider and model before sending a request.',
      );
    }

    const service = deps.createService();
    const response = await service.chat(input.messages, {
      ...input.options,
      providerId: selectedChatModel.providerId,
      modelId: selectedChatModel.modelId,
      maxTokens: input.options?.maxTokens ?? INTERNAL_CHAT_DEFAULT_MAX_TOKENS,
    });
    const content = response.message.content;
    return typeof content === 'string' ? content : null;
  } catch (error) {
    deps.logger?.warn('neko.agent.internalChat failed', { error });
    return null;
  }
}
