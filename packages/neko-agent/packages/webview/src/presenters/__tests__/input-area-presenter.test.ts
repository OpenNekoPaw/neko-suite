import { describe, expect, it } from 'vitest';
import { projectInputAreaUi } from '../input-area-presenter';

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
});
