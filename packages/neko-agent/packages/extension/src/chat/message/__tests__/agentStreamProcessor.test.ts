/**
 * AgentStreamProcessor unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentStreamProcessor } from '../agentStreamProcessor';
import type { EntityMemoryContribution } from '@neko/shared';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({ fsPath }),
  },
  workspace: {
    workspaceFolders: [{ uri: { fsPath: '/workspace' } }],
    getConfiguration: () => ({
      get: (_key: string, fallback: unknown) => fallback,
    }),
  },
  window: {
    showInformationMessage: vi.fn(),
  },
  commands: {
    executeCommand: vi.fn(),
  },
}));

// Mock the logger
vi.mock('../../../base', () => ({
  getLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

function createMockWebview() {
  return {
    postMessage: vi.fn().mockResolvedValue(true),
    asWebviewUri: vi.fn((uri: any) => ({ toString: () => `webview-uri:${uri.fsPath}` })),
  };
}

function createMockCallbacks() {
  return {
    messageId: 'assistant-stream',
    onPhaseChange: vi.fn(),
  };
}

/**
 * Helper to create an async iterable from an array of events
 */
async function* toAsyncIterable<T>(items: T[]): AsyncIterable<T> {
  for (const item of items) {
    yield item;
  }
}

describe('AgentStreamProcessor', () => {
  let processor: AgentStreamProcessor;
  let webview: ReturnType<typeof createMockWebview>;
  let callbacks: ReturnType<typeof createMockCallbacks>;

  beforeEach(() => {
    vi.clearAllMocks();
    webview = createMockWebview();
    callbacks = createMockCallbacks();
    processor = new AgentStreamProcessor({});
  });

  describe('processStream', () => {
    it('should return empty result for empty stream', async () => {
      const events = toAsyncIterable([]);
      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedResponse).toBe('');
      expect(result.accumulatedThinking).toBe('');
      expect(result.hasError).toBe(false);
      expect(result.collectedToolCalls).toEqual([]);
      expect(result.contentBlocks).toEqual([]);
    });

    it('should handle thinking_content events', async () => {
      const events = toAsyncIterable([
        { type: 'thinking_content', thinking: 'Let me think...' },
        { type: 'thinking_content', thinking: ' about this.' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedThinking).toBe('Let me think... about this.');
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0]!.type).toBe('thinking');
      expect(result.contentBlocks[0]!.thinking).toBe('Let me think... about this.');
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('thinking', undefined);

      // Should have sent streamThinking messages
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamThinking', content: 'Let me think...' }),
      );
    });

    it('should handle text events', async () => {
      const events = toAsyncIterable([
        { type: 'text', content: 'Hello ' },
        { type: 'text_delta', content: 'world!' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedResponse).toBe('Hello world!');
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0]!.type).toBe('text');
      expect(result.contentBlocks[0]!.content).toBe('Hello world!');
      expect(result.contentBlocks[0]!.isStreaming).toBe(false); // Marked complete at end
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('streaming', undefined);
    });

    it('persists partial assistant snapshots using the provided stream message id', async () => {
      const conversations = {
        get: vi.fn(() => ({
          id: 'conv-1',
          messages: [{ id: 'user-1', role: 'user', content: 'hello', timestamp: 1 }],
        })),
        upsertMessageToConversation: vi.fn(),
      };
      processor = new AgentStreamProcessor({ conversations: conversations as any });

      await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([{ type: 'text', content: 'Hello' }]),
        { ...callbacks, messageId: 'assistant-stream' },
      );

      expect(conversations.upsertMessageToConversation).toHaveBeenCalledWith(
        'conv-1',
        expect.objectContaining({
          id: 'assistant-stream',
          role: 'assistant',
          content: 'Hello',
          isStreaming: true,
        }),
      );
    });

    it('posts runtime-projected entity memory contribution payloads on stream completion', async () => {
      const events = toAsyncIterable([
        {
          type: 'text',
          content:
            'Storyboard\n\n```neko-composite\n{"template":"storyboard-table","title":"Opening","sections":[{"heading":"主要角色观察","content":"| 角色 | 当前证据支撑的观察 |\\n| --- | --- |\\n| 瑞德 | 红色围巾。 |"}]}\n```',
        },
        { type: 'done' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);
      const composite = result.contentBlocks.find((block) => block.type === 'composite')?.composite;
      const contribution = composite?.extensions?.['neko.entityMemoryContributionPayload'] as
        | EntityMemoryContribution
        | undefined;

      expect(contribution).toMatchObject({
        contributionId: 'character-analysis-opening',
        sourcePackage: 'neko-agent',
        reviewPolicy: 'requires-user-review',
        entityCandidates: [expect.objectContaining({ name: '瑞德' })],
      });
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'streamComplete',
          contentBlocks: expect.arrayContaining([
            expect.objectContaining({
              type: 'composite',
              composite: expect.objectContaining({
                extensions: expect.objectContaining({
                  'neko.entityMemoryContributionPayload': expect.objectContaining({
                    contributionId: 'character-analysis-opening',
                  }),
                }),
              }),
            }),
          ]),
        }),
      );
    });

    it('should mark thinking complete when text starts', async () => {
      const events = toAsyncIterable([
        { type: 'thinking_content', thinking: 'Thinking...' },
        { type: 'text', content: 'Response' },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.contentBlocks).toHaveLength(2);
      expect(result.contentBlocks[0]!.type).toBe('thinking');
      expect(result.contentBlocks[0]!.isThinkingComplete).toBe(true);
      expect(result.contentBlocks[1]!.type).toBe('text');
    });

    it('should handle tool_call events', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'read_file', arguments: { path: '/tmp/test.ts' } },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls).toHaveLength(1);
      expect(result.collectedToolCalls[0]!.name).toBe('read_file');
      expect(result.contentBlocks).toHaveLength(1);
      expect(result.contentBlocks[0]!.type).toBe('tool_call');
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('acting', 'read_file');
    });

    it('should stop text streaming when tool_call arrives', async () => {
      const events = toAsyncIterable([
        { type: 'text', content: 'Let me read that file.' },
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'read_file', arguments: { path: '/tmp/test.ts' } },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.contentBlocks).toHaveLength(2);
      // Text block should be finalized (not streaming)
      expect(result.contentBlocks[0]!.isStreaming).toBe(false);
    });

    it('should handle tool_result events and update tool call data', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'read_file', arguments: { path: '/tmp/test.ts' } },
        },
        {
          type: 'tool_result',
          toolResult: { toolCallId: 'tc-1', success: true, data: 'file content' },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls[0]!.result).toEqual({
        success: true,
        data: 'file content',
        error: undefined,
      });

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'toolResult', toolCallId: 'tc-1', success: true }),
      );
    });

    it('automates entity memory contributions and backfills the decision summary', async () => {
      const contribution = makeEntityMemoryContribution();
      const automation = {
        processContribution: vi.fn().mockResolvedValue({
          contributionId: contribution.contributionId,
          decisions: [
            {
              kind: 'created-candidate',
              name: '少年英雄',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        }),
      };
      processor = new AgentStreamProcessor({
        entityMemoryContributionAutomation: automation,
      });
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: {
            id: 'tc-memory',
            name: 'AnalyzeComicPage',
            arguments: {},
          },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-memory',
            success: true,
            data: { entityMemoryContribution: contribution },
          },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(automation.processContribution).toHaveBeenCalledWith({
        contribution,
        toolCallId: 'tc-memory',
      });
      expect(result.collectedToolCalls[0]!.result?.data).toMatchObject({
        entityMemoryAutomation: {
          status: 'succeeded',
          contributionId: 'contribution-page-1',
          decisions: [
            {
              kind: 'created-candidate',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        },
      });
      expect(result.collectedToolCalls[0]!.result?.artifacts).toEqual([
        {
          type: 'artifactExecutionSummary',
          summary: expect.objectContaining({
            summaryId: 'entity-memory:contribution-page-1',
            actionId: 'entity-memory.processContribution',
            providerId: 'neko-entity',
            status: 'succeeded',
          }),
        },
      ]);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolResultBackfill',
          toolCallId: 'tc-memory',
          dataPatch: expect.objectContaining({
            entityMemoryAutomation: expect.objectContaining({
              contributionId: 'contribution-page-1',
            }),
          }),
        }),
      );
    });

    it('automates entity memory contributions embedded in final composite text', async () => {
      const contribution = makeEntityMemoryContribution();
      const automation = {
        processContribution: vi.fn().mockResolvedValue({
          contributionId: contribution.contributionId,
          decisions: [
            {
              kind: 'matched-candidate',
              name: '少年英雄',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        }),
      };
      processor = new AgentStreamProcessor({
        entityMemoryContributionAutomation: automation,
      });
      const text =
        '分析完成。\n\n```neko-composite\n' +
        JSON.stringify({
          schemaVersion: 1,
          kind: 'composite-artifact',
          artifactId: 'comic-storyboard-plan',
          profile: 'comic-to-animation-plan',
          title: 'Comic Storyboard Plan',
          extensions: {
            'neko.entityMemoryContributionPayload': contribution,
          },
          blocks: [
            {
              blockId: 'summary',
              kind: 'text',
              format: 'plain',
              text: 'summary',
            },
          ],
        }) +
        '\n```';

      const result = await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_call',
            toolCall: {
              id: 'tc-memory',
              name: 'ReadImage',
              arguments: { image_paths: ['/tmp/page-1.jpg'] },
            },
          },
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-memory',
              success: true,
              data: { imagePaths: ['/tmp/page-1.jpg'] },
            },
          },
          { type: 'text', content: text },
          { type: 'done' },
        ]),
        callbacks,
      );

      expect(automation.processContribution).toHaveBeenCalledWith({
        contribution,
        toolCallId: 'tc-memory',
        sourceArtifactId: 'comic-storyboard-plan',
      });
      expect(result.collectedToolCalls[0]!.result?.data).toMatchObject({
        entityMemoryAutomation: {
          contributionId: 'contribution-page-1',
          decisions: [
            {
              kind: 'matched-candidate',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        },
      });
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolResultBackfill',
          toolCallId: 'tc-memory',
          artifacts: [
            {
              type: 'artifactExecutionSummary',
              summary: expect.objectContaining({
                artifactId: 'comic-storyboard-plan',
                status: 'succeeded',
              }),
            },
          ],
        }),
      );
    });

    it('automates entity memory contributions embedded in json fenced composite artifacts', async () => {
      const contribution = makeEntityMemoryContribution();
      const automation = {
        processContribution: vi.fn().mockResolvedValue({
          contributionId: contribution.contributionId,
          decisions: [
            {
              kind: 'matched-candidate',
              name: '少年英雄',
              candidateId: 'candidate:character:char_少年英雄',
            },
          ],
        }),
      };
      processor = new AgentStreamProcessor({
        entityMemoryContributionAutomation: automation,
      });
      const text =
        '分析完成。\n\n```json\n' +
        JSON.stringify({
          schemaVersion: 1,
          kind: 'composite-artifact',
          artifactId: 'comic-storyboard-plan',
          profile: 'comic-to-animation-plan',
          title: 'Comic Storyboard Plan',
          extensions: {
            'neko.entityMemoryContributionPayload': contribution,
          },
          blocks: [
            {
              blockId: 'storyboard-domain',
              kind: 'domain',
              domainKind: 'StoryboardTable',
              schemaVersion: 1,
              payload: {
                schemaVersion: 1,
                kind: 'storyboard-table',
                title: 'Storyboard',
                scenes: [
                  {
                    sceneId: 'scene-1',
                    sceneTitle: 'Page 1',
                    shots: [
                      {
                        shotNumber: 1,
                        duration: 3,
                        visualDescription: 'Panel action.',
                        characterAction: 'Hero enters.',
                        imageStrategy: 'use-as-reference',
                        sourceMediaRefs: [
                          {
                            refId: 'source-panel-1',
                            role: 'source',
                            locator: {
                              type: 'tool-result',
                              toolCallId: 'tc-memory',
                              assetIndex: 0,
                            },
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            },
          ],
        }) +
        '\n```';

      const result = await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_call',
            toolCall: {
              id: 'tc-memory',
              name: 'ReadImage',
              arguments: { image_paths: ['/tmp/page-1.jpg'] },
            },
          },
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-memory',
              success: true,
              data: { imagePaths: ['/tmp/page-1.jpg'] },
            },
          },
          { type: 'text', content: text },
          { type: 'done' },
        ]),
        callbacks,
      );

      expect(automation.processContribution).toHaveBeenCalledWith({
        contribution,
        toolCallId: 'tc-memory',
        sourceArtifactId: 'comic-storyboard-plan',
      });
      expect(result.collectedToolCalls[0]!.result?.data).toMatchObject({
        entityMemoryAutomation: {
          contributionId: 'contribution-page-1',
        },
      });
    });

    it('automates entity memory contributions embedded in uppercase neko fenced artifacts', async () => {
      const contribution = makeEntityMemoryContribution();
      const automation = {
        processContribution: vi.fn().mockResolvedValue({
          contributionId: contribution.contributionId,
          decisions: [{ kind: 'matched-candidate', candidateId: 'candidate:hero' }],
        }),
      };
      processor = new AgentStreamProcessor({
        entityMemoryContributionAutomation: automation,
      });
      const text =
        '分析完成。\n\n```NEKO\n' +
        JSON.stringify({
          schemaVersion: 1,
          kind: 'composite-artifact',
          artifactId: 'comic-storyboard-plan',
          title: 'Comic Storyboard Plan',
          extensions: {
            'neko.entityMemoryContributionPayload': contribution,
          },
          blocks: [{ blockId: 'summary', kind: 'text', text: 'summary' }],
        }) +
        '\n```';

      await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_call',
            toolCall: {
              id: 'tc-memory',
              name: 'ReadImage',
              arguments: { image_paths: ['/tmp/page-1.jpg'] },
            },
          },
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-memory',
              success: true,
              data: { imagePaths: ['/tmp/page-1.jpg'] },
            },
          },
          { type: 'text', content: text },
          { type: 'done' },
        ]),
        callbacks,
      );

      expect(automation.processContribution).toHaveBeenCalledWith({
        contribution,
        toolCallId: 'tc-memory',
        sourceArtifactId: 'comic-storyboard-plan',
      });
    });

    it('projects document image paths to webview URIs only for webview delivery', async () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, filePath: string) => `webview-uri:${filePath}`),
      };
      processor = new AgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
      });
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-1', name: 'ReadDocument', arguments: { file_path: '/books/a.epub' } },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-1',
            success: true,
            data: {
              source: { filePath: '/books/a.epub', format: 'epub' },
              imagePaths: ['/tmp/page-1.jpg'],
              imageInfo: [{ path: '/tmp/page-1.jpg', width: 1494, height: 2133 }],
            },
          },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls[0]!.result?.data).toEqual({
        source: { filePath: '/books/a.epub', format: 'epub' },
        imagePaths: ['/tmp/page-1.jpg'],
        imageInfo: [{ path: '/tmp/page-1.jpg', width: 1494, height: 2133 }],
      });
      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        '/tmp/page-1.jpg',
        'neko-agent.stream-tool-result',
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolResult',
          data: {
            source: { filePath: '/books/a.epub', format: 'epub' },
            imagePaths: ['/tmp/page-1.jpg'],
            imagePathWebviewUris: ['webview-uri:/tmp/page-1.jpg'],
            imageInfo: [
              {
                path: '/tmp/page-1.jpg',
                webviewUri: 'webview-uri:/tmp/page-1.jpg',
                width: 1494,
                height: 2133,
              },
            ],
          },
        }),
      );
    });

    it('projects ReadImage arguments to webview URIs when the tool call starts', async () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, filePath: string) => `webview-uri:${filePath}`),
      };
      processor = new AgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
      });
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: {
            id: 'tc-read-image',
            name: 'ReadImage',
            arguments: {
              image_paths: ['/tmp/page-1.jpg'],
              images: [{ label: 'Page 1', path: '/tmp/page-1.jpg' }],
            },
          },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.collectedToolCalls[0]!.arguments).toEqual({
        image_paths: ['/tmp/page-1.jpg'],
        images: [{ label: 'Page 1', path: '/tmp/page-1.jpg' }],
      });
      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        '/tmp/page-1.jpg',
        'neko-agent.stream-tool-result',
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolCall',
          toolCallId: 'tc-read-image',
          arguments: {
            image_paths: ['/tmp/page-1.jpg'],
            imagePathWebviewUris: ['webview-uri:/tmp/page-1.jpg'],
            images: [
              {
                label: 'Page 1',
                path: '/tmp/page-1.jpg',
                webviewUri: 'webview-uri:/tmp/page-1.jpg',
              },
            ],
          },
        }),
      );
    });

    it('leaves unauthorized document image paths unresolved when unified access rejects them', async () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn(() => undefined),
      };
      processor = new AgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
      });
      const events = toAsyncIterable([
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-1',
            success: true,
            data: {
              imagePaths: ['/tmp/page-1.jpg'],
              imageInfo: [{ path: '/tmp/page-1.jpg', width: 1494, height: 2133 }],
            },
          },
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        '/tmp/page-1.jpg',
        'neko-agent.stream-tool-result',
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolResult',
          data: {
            imagePaths: ['/tmp/page-1.jpg'],
            resourceProjectionDiagnostics: [
              expect.objectContaining({
                code: 'resource-projection-denied',
                field: 'imagePaths',
                source: '/tmp/page-1.jpg',
              }),
            ],
            imageInfo: [
              {
                path: '/tmp/page-1.jpg',
                resourceProjectionDiagnostics: [
                  expect.objectContaining({
                    code: 'resource-projection-denied',
                    field: 'path',
                    source: '/tmp/page-1.jpg',
                  }),
                ],
                width: 1494,
                height: 2133,
              },
            ],
          },
        }),
      );
    });

    it('returns projection diagnostics for macOS system temp image paths instead of display URIs', async () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn(() => undefined),
      };
      processor = new AgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
      });
      const tempImagePath =
        '/var/folders/26/b9fmn08x6mv2bcl771rnjyt80000gn/T/neko_epub_1vehc43/0001_moe-017905.jpg';
      const events = toAsyncIterable([
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-1',
            success: true,
            data: {
              imagePaths: [tempImagePath],
              imageInfo: [{ path: tempImagePath, width: 1494, height: 2133 }],
            },
          },
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        tempImagePath,
        'neko-agent.stream-tool-result',
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolResult',
          data: expect.objectContaining({
            imagePaths: [tempImagePath],
            resourceProjectionDiagnostics: [
              expect.objectContaining({
                code: 'resource-projection-denied',
                field: 'imagePaths',
                source: tempImagePath,
              }),
            ],
            imageInfo: [
              expect.objectContaining({
                path: tempImagePath,
                resourceProjectionDiagnostics: [
                  expect.objectContaining({
                    code: 'resource-projection-denied',
                    field: 'path',
                    source: tempImagePath,
                  }),
                ],
              }),
            ],
          }),
        }),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            imagePathWebviewUris: expect.any(Array),
          }),
        }),
      );
    });

    it('projects managed resource cache paths in tool stream results', async () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, filePath: string) => `webview-uri:${filePath}`),
      };
      processor = new AgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
      });
      const managedPath = '/workspace/.neko/.cache/resources/documents/doc_comic/OPS/page-1.jpg';
      const events = toAsyncIterable([
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-1',
            success: true,
            data: {
              imagePaths: [managedPath],
              imageInfo: [{ path: managedPath, width: 1494, height: 2133 }],
            },
          },
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        managedPath,
        'neko-agent.stream-tool-result',
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolResult',
          data: {
            imagePaths: [managedPath],
            imagePathWebviewUris: [`webview-uri:${managedPath}`],
            imageInfo: [
              {
                path: managedPath,
                webviewUri: `webview-uri:${managedPath}`,
                width: 1494,
                height: 2133,
              },
            ],
          },
        }),
      );
    });

    it('projects top-level tool result media fields for webview delivery', async () => {
      const localResourceAccess = {
        toWebviewUri: vi.fn((_webview, filePath: string) => `webview-uri:${filePath}`),
      };
      processor = new AgentStreamProcessor({
        localResourceAccess: localResourceAccess as any,
      });
      const imagePath = '/tmp/page-1.jpg';
      const events = toAsyncIterable([
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-read-image',
            success: true,
            data: { images: [{ path: imagePath, mimeType: 'image/jpeg', byteSize: 10 }] },
            attachments: [
              {
                type: 'image',
                path: imagePath,
                mimeType: 'image/jpeg',
                assetRef: {
                  assetId: 'read-image-page-1',
                  uri: imagePath,
                  mimeType: 'image/jpeg',
                },
              },
            ],
            perceptionCards: [
              {
                version: 1,
                assetId: 'read-image-page-1',
                modality: 'image',
                createdAt: 1,
                layerStatus: { layer0: 'complete', layer1: 'skipped', layer2: 'complete' },
                structural: { format: 'jpeg', mimeType: 'image/jpeg', byteSize: 10 },
                perceptual: {
                  keyframeRefs: [
                    {
                      assetId: 'read-image-page-1',
                      uri: imagePath,
                      mimeType: 'image/jpeg',
                    },
                  ],
                },
              },
            ],
          },
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(localResourceAccess.toWebviewUri).toHaveBeenCalledWith(
        webview,
        imagePath,
        'neko-agent.stream-tool-result',
      );
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolResult',
          attachments: [
            expect.objectContaining({
              path: imagePath,
              webviewUri: `webview-uri:${imagePath}`,
              assetRef: expect.objectContaining({
                uri: `webview-uri:${imagePath}`,
                localPath: imagePath,
              }),
            }),
          ],
          perceptionCards: [
            expect.objectContaining({
              perceptual: expect.objectContaining({
                keyframeRefs: [
                  expect.objectContaining({
                    uri: `webview-uri:${imagePath}`,
                    localPath: imagePath,
                  }),
                ],
              }),
            }),
          ],
        }),
      );
    });

    it('should handle tool_confirmation events', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_confirmation',
          toolConfirmation: {
            toolCall: { id: 'tc-1', name: 'write_file' },
            action: 'confirm',
            description: 'Writing file',
            details: { path: '/tmp/out.ts' },
          },
        },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'toolConfirmation',
          toolName: 'write_file',
          action: 'confirm',
        }),
      );
    });

    it('should handle error events', async () => {
      // Start with a non-idle phase so the phase transition to idle is triggered
      const events = toAsyncIterable([
        { type: 'text', content: 'Partial response' },
        { type: 'error', error: { message: 'Rate limited' } },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.hasError).toBe(true);
      expect(result.errorMessage).toBe('Rate limited');
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('idle', undefined);
      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'error', message: 'Rate limited' }),
      );
    });

    it('should handle messageQueued events', async () => {
      const events = toAsyncIterable([
        { type: 'messageQueued', content: 'Queued message', pendingCount: 2 },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'messageQueued',
          content: 'Queued message',
          pendingCount: 2,
        }),
      );
    });

    it('should handle done event without treating usage as context tokens', async () => {
      const events = toAsyncIterable([
        { type: 'text', content: 'Done!' },
        { type: 'done', usage: { totalTokens: 1500 } },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamComplete' }),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount' }),
      );
      expect(callbacks.onPhaseChange).toHaveBeenCalledWith('idle', undefined);
    });

    it('should refresh context token count from the session after stream completion', async () => {
      processor = new AgentStreamProcessor({
        getContextTokenCount: vi.fn().mockReturnValue(2400),
      });
      const events = toAsyncIterable([
        { type: 'text', content: 'Done!' },
        { type: 'done', usage: { totalTokens: 1500 } },
      ]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount', tokenCount: 2400 }),
      );
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount', tokenCount: 1500 }),
      );
    });

    it('should handle done event without usage', async () => {
      const events = toAsyncIterable([{ type: 'done' }]);

      await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'streamComplete' }),
      );
      // Should not send token count
      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'contextTokenCount' }),
      );
    });

    it('should detect plan mode in tool results', async () => {
      const events = toAsyncIterable([
        {
          type: 'tool_call',
          toolCall: { id: 'tc-plan', name: 'ExitPlanMode', arguments: {} },
        },
        {
          type: 'tool_result',
          toolResult: {
            toolCallId: 'tc-plan',
            success: true,
            data: {
              planMode: { status: 'awaiting_approval' },
              title: 'Refactor Auth',
              plan: '## Step 1\nDo X\n## Step 2\nDo Y',
              filePath: '/tmp/plan.md',
            },
          },
        },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      const planBlocks = result.contentBlocks.filter((b) => b.type === 'plan');
      expect(planBlocks).toHaveLength(1);
      expect(planBlocks[0]!.plan!.title).toBe('Refactor Auth');
      expect(planBlocks[0]!.plan!.steps).toHaveLength(2);
      expect(planBlocks[0]!.plan!.steps[0]!.description).toContain('Step 1');
      expect(planBlocks[0]!.plan!.filePath).toBe('/tmp/plan.md');
    });

    it('should handle full conversation flow', async () => {
      const events = toAsyncIterable([
        { type: 'thinking_content', thinking: 'Analyzing...' },
        { type: 'text', content: 'I will read the file.' },
        { type: 'tool_call', toolCall: { id: 'tc-1', name: 'read', arguments: { p: '/f.ts' } } },
        { type: 'tool_result', toolResult: { toolCallId: 'tc-1', success: true, data: 'content' } },
        { type: 'text', content: ' Here is the result.' },
        { type: 'done', usage: { totalTokens: 500 } },
      ]);

      const result = await processor.processStream(webview as any, 'conv-1', events, callbacks);

      expect(result.accumulatedThinking).toBe('Analyzing...');
      expect(result.accumulatedResponse).toBe('I will read the file. Here is the result.');
      expect(result.collectedToolCalls).toHaveLength(1);
      expect(result.hasError).toBe(false);
      // thinking + text + tool_call + text
      expect(result.contentBlocks).toHaveLength(4);
    });

    it('should send full background task views for task progress updates', async () => {
      let progressCallback: ((task: any) => Promise<void>) | undefined;
      const unsubscribe = vi.fn();
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, callback: (task: any) => Promise<void>) => {
            progressCallback = callback;
            return unsubscribe;
          }),
          saveOutputs: vi.fn(),
        },
      };
      processor = new AgentStreamProcessor({ platform: platform as any });

      await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                taskId: 'task-media',
                type: 'video',
                message: 'Generate a city flythrough',
                routedTo: { provider: 'runway' },
              },
            },
          },
        ]),
        callbacks,
      );

      await progressCallback?.({
        id: 'task-media',
        type: 'text-to-video',
        status: 'processing',
        progress: 45,
        providerId: 'runway',
        modelId: 'gen-3',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        request: { prompt: 'Generate a city flythrough', metadata: { conversationId: 'conv-1' } },
      });

      expect(webview.postMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'taskUpdated',
          conversationId: 'conv-1',
          workItem: expect.objectContaining({
            id: 'task-media',
            kind: 'tool-background-task',
            status: 'processing',
            progress: 45,
            task: expect.objectContaining({
              type: 'video',
              name: 'Generate a city flythrough',
              prompt: 'Generate a city flythrough',
              providerId: 'runway',
              providerName: 'runway',
            }),
          }),
        }),
      );
    });

    it('should backfill completed media assets with stable refs and trigger perception', async () => {
      let progressCallback: ((task: any) => Promise<void>) | undefined;
      const backfillSink = { applyBackfill: vi.fn().mockResolvedValue(undefined) };
      const perceptionPipeline = { perceive: vi.fn().mockResolvedValue({ card: {} }) };
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, callback: (task: any) => Promise<void>) => {
            progressCallback = callback;
            return vi.fn();
          }),
        },
      };
      const mediaDeliveryHost = {
        createProgressViewDelivery: vi.fn(async () => ({
          view: {
            id: 'task-media',
            type: 'image',
            status: 'completed',
            progress: 100,
            result: { urls: ['webview-uri:/workspace/.neko/generated/image/out.png'] },
            updatedAt: '2026-01-01T00:00:01.000Z',
          },
          deliveryPlan: {
            resultUrls: ['/workspace/.neko/generated/image/out.png'],
            thumbnailUrl: '/workspace/.neko/generated/image/out.png',
            localPaths: ['/workspace/.neko/generated/image/out.png'],
            shouldPersistResultUrls: true,
            shouldUnsubscribe: true,
            generatedAssets: [
              {
                id: 'asset-1',
                type: 'generated-image',
                path: '/workspace/.neko/generated/image/out.png',
                mimeType: 'image/png',
                generatedAt: '2026-01-01T00:00:01.000Z',
                width: 1024,
                height: 1024,
                ratio: '1:1',
              },
            ],
          },
        })),
      };
      processor = new AgentStreamProcessor({
        platform: platform as any,
        mediaDeliveryHost: mediaDeliveryHost as any,
        mediaBackfill: {
          backfillSink,
          perceptionPipeline: perceptionPipeline as any,
        },
      });

      await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                taskId: 'task-media',
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]),
        callbacks,
      );

      await progressCallback?.({
        id: 'task-media',
        type: 'text-to-image',
        status: 'completed',
        progress: 100,
        providerId: 'openai',
        modelId: 'gpt-image-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        outputs: [{ type: 'image', url: 'https://example.com/image.png', mimeType: 'image/png' }],
        request: { prompt: 'Generate a cat', metadata: { conversationId: 'conv-1' } },
      });

      expect(backfillSink.applyBackfill).toHaveBeenCalledWith(
        expect.objectContaining({
          toolCallId: 'tc-media',
          dataPatch: expect.objectContaining({
            status: 'completed',
            taskId: 'task-media',
            resultAssetRefs: [
              expect.objectContaining({
                uri: '${WORKSPACE}/.neko/generated/image/out.png',
                mimeType: 'image/png',
              }),
            ],
          }),
          attachments: [
            expect.objectContaining({
              type: 'image',
              path: '${WORKSPACE}/.neko/generated/image/out.png',
            }),
          ],
        }),
      );
      expect(perceptionPipeline.perceive).toHaveBeenCalledWith(
        expect.objectContaining({
          asset: expect.objectContaining({
            ref: expect.objectContaining({
              uri: '${WORKSPACE}/.neko/generated/image/out.png',
            }),
          }),
          sourceToolCallId: 'tc-media',
          policy: expect.objectContaining({ timing: 'on-completion', layers: [0] }),
        }),
      );
    });

    it('should ignore background task progress from another conversation', async () => {
      let progressCallback: ((task: any) => Promise<void>) | undefined;
      const unsubscribe = vi.fn();
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, callback: (task: any) => Promise<void>) => {
            progressCallback = callback;
            return unsubscribe;
          }),
          saveOutputs: vi.fn(),
        },
      };
      processor = new AgentStreamProcessor({ platform: platform as any });

      await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                taskId: 'task-media',
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]),
        callbacks,
      );

      await progressCallback?.({
        id: 'task-media',
        type: 'text-to-image',
        status: 'processing',
        progress: 50,
        providerId: 'openai',
        modelId: 'gpt-image-1',
        createdAt: new Date('2026-01-01T00:00:00.000Z'),
        updatedAt: new Date('2026-01-01T00:00:01.000Z'),
        request: { prompt: 'Generate a cat', metadata: { conversationId: 'conv-other' } },
      });

      expect(webview.postMessage).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'taskUpdated' }),
      );
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should dispose background task progress subscriptions', async () => {
      const unsubscribe = vi.fn();
      const platform = {
        media: {
          onProgress: vi.fn((_taskId: string, _callback: (task: any) => Promise<void>) => {
            return unsubscribe;
          }),
          saveOutputs: vi.fn(),
        },
      };
      processor = new AgentStreamProcessor({ platform: platform as any });

      await processor.processStream(
        webview as any,
        'conv-1',
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: 'tc-media',
              success: true,
              data: {
                backgroundMode: true,
                taskId: 'task-media',
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]),
        callbacks,
      );

      processor.dispose();

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });

    it('should clear background task progress subscriptions by conversation', async () => {
      const unsubscribeA = vi.fn();
      const unsubscribeB = vi.fn();
      const platform = {
        media: {
          onProgress: vi
            .fn()
            .mockImplementationOnce(
              (_taskId: string, _callback: (task: any) => Promise<void>) => unsubscribeA,
            )
            .mockImplementationOnce(
              (_taskId: string, _callback: (task: any) => Promise<void>) => unsubscribeB,
            ),
          saveOutputs: vi.fn(),
        },
      };
      processor = new AgentStreamProcessor({ platform: platform as any });

      const events = (taskId: string) =>
        toAsyncIterable([
          {
            type: 'tool_result',
            toolResult: {
              toolCallId: `tc-${taskId}`,
              success: true,
              data: {
                backgroundMode: true,
                taskId,
                type: 'image',
                message: 'Generate a cat',
                routedTo: { provider: 'openai' },
              },
            },
          },
        ]);

      await processor.processStream(webview as any, 'conv-a', events('task-a'), callbacks);
      await processor.processStream(webview as any, 'conv-b', events('task-b'), callbacks);

      processor.clearConversation('conv-a');

      expect(unsubscribeA).toHaveBeenCalledTimes(1);
      expect(unsubscribeB).not.toHaveBeenCalled();
    });
  });

  describe('updateToolResultWithUrls', () => {
    it('should do nothing without conversations', () => {
      processor = new AgentStreamProcessor({});
      // Should not throw
      processor.updateToolResultWithUrls('conv-1', 'task-1', ['/path/to/file.png']);
    });

    it('should update tool results matching taskId in contentBlocks', () => {
      const messages = [
        {
          contentBlocks: [
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                name: 'generate',
                arguments: {},
                result: {
                  success: true,
                  data: { taskId: 'task-2', backgroundMode: true },
                },
              },
            },
          ],
        },
      ];
      const conversations = {
        get: vi.fn().mockReturnValue({ messages }),
        updateMessagesForConversation: vi.fn(),
      };

      processor = new AgentStreamProcessor({ conversations: conversations as any });
      processor.updateToolResultWithUrls('conv-1', 'task-2', ['/out/video.mp4']);

      expect(conversations.updateMessagesForConversation).toHaveBeenCalled();
    });

    it('should not update when taskId does not match', () => {
      const messages = [
        {
          contentBlocks: [
            {
              type: 'tool_call',
              toolCall: {
                id: 'tc-1',
                name: 'generate',
                arguments: {},
                result: {
                  success: true,
                  data: { taskId: 'task-99', backgroundMode: true },
                },
              },
            },
          ],
        },
      ];
      const conversations = {
        get: vi.fn().mockReturnValue({ messages }),
        updateMessagesForConversation: vi.fn(),
      };

      processor = new AgentStreamProcessor({ conversations: conversations as any });
      processor.updateToolResultWithUrls('conv-1', 'task-1', ['/out/file.png']);

      expect(conversations.updateMessagesForConversation).not.toHaveBeenCalled();
    });

    it('should handle missing conversation gracefully', () => {
      const conversations = {
        get: vi.fn().mockReturnValue(undefined),
        updateMessagesForConversation: vi.fn(),
      };

      processor = new AgentStreamProcessor({ conversations: conversations as any });
      // Should not throw
      processor.updateToolResultWithUrls('conv-missing', 'task-1', ['/file.png']);
      expect(conversations.updateMessagesForConversation).not.toHaveBeenCalled();
    });
  });
});

function makeEntityMemoryContribution(): EntityMemoryContribution {
  return {
    contributionId: 'contribution-page-1',
    sourcePackage: 'neko-agent',
    sourceRef: {
      kind: 'tool-result',
      toolCallId: 'tc-memory',
      assetIndex: 0,
    },
    reviewPolicy: 'requires-user-review',
    characterObservations: [
      {
        observationId: 'obs-page-1-hero',
        sourceRef: {
          kind: 'tool-result',
          toolCallId: 'tc-memory',
          assetIndex: 0,
          range: { panelId: 'P1' },
        },
        provenance: {
          source: 'comic',
          providerId: 'neko-agent',
          toolCallId: 'tc-memory',
        },
        reviewStatus: 'needs-review',
        mention: {
          mentionId: 'mention-page-1-hero',
          kind: 'visual',
          candidateName: '少年英雄',
          confidence: 0.86,
        },
        dimensions: [
          {
            dimension: 'appearance',
            value: 'Short dark hair and hooded jacket',
            confidence: 0.8,
          },
        ],
        confidence: 0.84,
      },
    ],
  };
}
