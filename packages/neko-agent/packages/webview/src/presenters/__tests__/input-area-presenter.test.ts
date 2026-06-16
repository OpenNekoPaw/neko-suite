import { describe, expect, it } from 'vitest';
import { projectAmbientCanvasContext, projectInputAreaUi } from '../input-area-presenter';

describe('input area presenter', () => {
  it('hides creative authoring controls for Character Dialogue conversations', () => {
    expect(
      projectInputAreaUi({
        inputValue: 'hello',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 3,
        isThinking: false,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'character-dialogue',
      }),
    ).toEqual(
      expect.objectContaining({
        canSend: true,
        showSessionModeSelector: false,
        showChatModelSelector: false,
        showSessionMediaModelSelector: false,
        showGenerationParams: false,
        showExecutionModeSelector: false,
        showMediaCallCount: false,
      }),
    );
  });

  it('keeps ordinary chat controls visible in agent mode', () => {
    expect(
      projectInputAreaUi({
        inputValue: '',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 1,
        isThinking: false,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'chat',
      }),
    ).toEqual(
      expect.objectContaining({
        showSessionModeSelector: true,
        showChatModelSelector: true,
        showGenerationParams: true,
        showExecutionModeSelector: true,
        showMediaCallCount: true,
      }),
    );
  });

  it('projects explicit queue controls while a response is running', () => {
    expect(
      projectInputAreaUi({
        inputValue: 'next',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 0,
        isThinking: true,
        queuedMessageCount: 2,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'chat',
      }),
    ).toEqual(
      expect.objectContaining({
        canSend: true,
        canQueue: true,
        canCancel: true,
        queuedMessageCount: 2,
        showQueuedMessages: true,
        inputPlaceholderKey: 'chat.input.queuePlaceholder',
        sendTitleKey: 'chat.input.queue',
      }),
    );
  });

  it('hides creative authoring controls for Embody Character conversations', () => {
    expect(
      projectInputAreaUi({
        inputValue: '',
        attachedFileCount: 0,
        contextChipCount: 0,
        ambientNodeCount: 0,
        mediaModelCallCount: 1,
        isThinking: false,
        disabled: false,
        sessionMode: 'agent',
        conversationKind: 'embody-character',
      }),
    ).toEqual(
      expect.objectContaining({
        showSessionModeSelector: false,
        showChatModelSelector: false,
        showGenerationParams: false,
        showExecutionModeSelector: false,
        showMediaCallCount: false,
      }),
    );
  });

  it('summarizes ambient canvas selection and recommends generation actions', () => {
    expect(
      projectAmbientCanvasContext([
        { nodeId: 'shot-1', type: 'shot', summary: '#1 wide shot' },
        { nodeId: 'shot-2', type: 'shot', summary: '#2 close-up' },
        { nodeId: 'scene-1', type: 'scene', summary: 'Scene 1: Gate' },
      ]),
    ).toMatchObject({
      selectedCount: 3,
      shotCount: 2,
      sceneCount: 1,
      counts: [
        { type: 'shot', count: 2 },
        { type: 'scene', count: 1 },
      ],
      actions: [
        { id: 'batch-generate-images' },
        { id: 'optimize-selection' },
        { id: 'understand-selection' },
      ],
    });
  });

  it('projects a single selected canvas node without inventing batch actions', () => {
    expect(
      projectAmbientCanvasContext([{ nodeId: 'shot-1', type: 'shot', summary: '#1 wide shot' }]),
    ).toMatchObject({
      selectedCount: 1,
      titleNodeSummary: '#1 wide shot',
      actions: [{ id: 'generate-image' }, { id: 'understand-selection' }],
    });
  });
});
