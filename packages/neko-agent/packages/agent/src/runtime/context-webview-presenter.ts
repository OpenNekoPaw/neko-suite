export interface ContextTokenCountMessage {
  type: 'contextTokenCount';
  conversationId?: string;
  tokenCount: number;
}

export interface CompressionResultMessage {
  type: 'compressionResult';
  conversationId: string;
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
}

export interface CompressionErrorMessage {
  type: 'compressionError';
  conversationId?: string;
  error: string;
}

export type ContextWebviewMessage =
  | ContextTokenCountMessage
  | CompressionResultMessage
  | CompressionErrorMessage;

export interface CompressionResultData {
  originalTokens: number;
  compressedTokens: number;
  ratio: number;
}

export function buildContextTokenCountMessage(input: {
  conversationId?: string;
  tokenCount: number;
}): ContextTokenCountMessage {
  return {
    type: 'contextTokenCount',
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    tokenCount: input.tokenCount,
  };
}

export function buildCompressionResultMessage(input: {
  conversationId: string;
  result: CompressionResultData;
}): CompressionResultMessage {
  return {
    type: 'compressionResult',
    conversationId: input.conversationId,
    originalTokens: input.result.originalTokens,
    compressedTokens: input.result.compressedTokens,
    ratio: input.result.ratio,
  };
}

export function buildCompressionErrorMessage(input: {
  conversationId?: string;
  error: unknown;
}): CompressionErrorMessage {
  return {
    type: 'compressionError',
    ...(input.conversationId !== undefined ? { conversationId: input.conversationId } : {}),
    error:
      input.error instanceof Error
        ? input.error.message
        : typeof input.error === 'string'
          ? input.error
          : 'Unknown error',
  };
}
