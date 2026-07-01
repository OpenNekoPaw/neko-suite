import * as vscode from 'vscode';
import type { AgentContextPayload } from '@neko/shared';
import { normalizeAgentRuntimePromptLocale } from '@neko/agent/runtime';
import type { WebviewToExtensionMessage } from '@neko-agent/types';
import type { ChatWebviewMessageRouterDeps } from './types';
import { resolveRequiredConversationId } from './conversationId';

export function tryHandleMessageRoute(
  message: WebviewToExtensionMessage,
  deps: ChatWebviewMessageRouterDeps,
): boolean {
  const { webview } = deps;

  switch (message.type) {
    case 'sendMessage':
      if (deps.characterDialogue?.hasSession(message.conversationId)) {
        void deps.characterDialogue.routeUserMessage(message.conversationId, message.message);
        return true;
      }
      if (deps.embodyCharacter?.hasSession(message.conversationId)) {
        void deps.embodyCharacter.routeUserMessage(message.conversationId, message.message);
        return true;
      }
      deps.messages?.handleUserMessage(webview, {
        conversationId: message.conversationId,
        messageText: message.message,
        sessionMode: message.sessionMode,
        chatModel: message.chatModel,
        agentModels: message.agentModels,
        llmConfig: message.llmConfig,
        mediaModel: message.mediaModel,
        mediaModels: message.mediaModels,
        attachments: message.attachments,
        contextPayloads: message.contextPayloads,
        fileReferences: message.fileReferences,
        promptId: message.promptId,
        locale: vscode.env.language,
      });
      return true;

    case 'searchProjectFiles': {
      const allowsTablessSearch = message.purpose === 'roleplay' || message.purpose === 'entry';
      const conversationId = allowsTablessSearch
        ? message.conversationId
        : resolveRequiredConversationId(webview, message, 'searchProjectFiles');
      if (!allowsTablessSearch && !conversationId) return true;
      deps.messages?.searchProjectFiles(webview, message.filter, conversationId, {
        purpose: message.purpose,
      });
      return true;
    }

    case 'startCharacterDialogueFromSlash':
      void deps.characterDialogue?.launchFromSlash({ args: message.args });
      return true;

    case 'mermaidError': {
      const conversationId = resolveRequiredConversationId(
        webview,
        message,
        'report Mermaid error',
      );
      if (!conversationId) return true;
      deps.messages?.handleUserMessage(webview, {
        conversationId,
        messageText: message.feedbackMessage,
        sessionMode: 'agent',
        locale: vscode.env.language,
      });
      return true;
    }

    case 'requestCanvasMarkdownHandoff': {
      const locale = vscode.env.language;
      deps.messages?.handleUserMessage(webview, {
        conversationId: message.conversationId,
        messageText: buildCanvasMarkdownHandoffPrompt(message, locale),
        sessionMode: 'agent',
        contextPayloads: [buildCanvasMarkdownHandoffContextPayload(message, locale)],
        locale,
      });
      return true;
    }

    default:
      return false;
  }
}

function buildCanvasMarkdownHandoffPrompt(
  message: Extract<WebviewToExtensionMessage, { type: 'requestCanvasMarkdownHandoff' }>,
  locale?: string,
): string {
  const title = message.title ?? 'Assistant Markdown';
  if (normalizeAgentRuntimePromptLocale(locale) === 'zh') {
    return [
      `把 "${title}" 发送到 Canvas。`,
      '请基于 Markdown 和附加 handoff 上下文判断是否调用 Canvas，以及应该使用哪个 Canvas capability/tool。',
      '不要默认当作普通表格；只有合适时才选择笔记、通用表格、creative table、storyboard profile 或其他 Canvas 工具。',
      '使用 handoff 上下文里的稳定 resource refs。不要使用 Webview render URI、blob URL、runtime handle、旧 plugin-transfer payload 或 CanvasNode JSON。',
      '',
      message.markdown,
    ].join('\n');
  }
  return [
    `Send "${title}" to Canvas.`,
    'Decide whether to call Canvas and which Canvas capability/tool to use based on the Markdown and attached handoff context.',
    'Do not assume a generic table; choose a note, generic table, creative table, storyboard profile, or another Canvas tool only when appropriate.',
    'Use stable resource refs from the handoff context. Do not use Webview render URIs, blob URLs, runtime handles, old plugin-transfer payloads, or CanvasNode JSON.',
    '',
    message.markdown,
  ].join('\n');
}

function buildCanvasMarkdownHandoffContextPayload(
  message: Extract<WebviewToExtensionMessage, { type: 'requestCanvasMarkdownHandoff' }>,
  locale?: string,
): AgentContextPayload {
  const title = message.title ?? 'Assistant Markdown';
  const resourceCount = message.resources?.length ?? 0;
  const isZh = normalizeAgentRuntimePromptLocale(locale) === 'zh';
  const summaryParts = [
    message.sourceFormat ?? 'markdown',
    isZh
      ? `${resourceCount} 个稳定 resource ref`
      : resourceCount === 1
        ? '1 stable resource ref'
        : `${resourceCount} stable resource refs`,
  ];
  return {
    type: 'document-selection' as const,
    id: message.requestId,
    label: isZh ? `Canvas Markdown 交接: ${title}` : `Canvas Markdown handoff: ${title}`,
    summary: summaryParts.join(', '),
    intent:
      message.userIntent ??
      (isZh
        ? '通过 Agent 工具选择把这段 Markdown 发送到 Canvas。'
        : 'Send this Markdown to Canvas through Agent tool selection.'),
    data: {
      kind: 'canvas-markdown-handoff',
      requestId: message.requestId,
      markdown: message.markdown,
      title,
      ...(message.sourceFormat ? { sourceFormat: message.sourceFormat } : {}),
      ...(message.resources ? { resources: message.resources } : {}),
      ...(message.target ? { target: message.target } : {}),
      ...(message.provenance ? { provenance: message.provenance } : {}),
      ...(message.userIntent ? { userIntent: message.userIntent } : {}),
      ...(message.declaredIntentHint ? { declaredIntentHint: message.declaredIntentHint } : {}),
      ...(message.declaredProfileHint ? { declaredProfileHint: message.declaredProfileHint } : {}),
    },
  };
}
