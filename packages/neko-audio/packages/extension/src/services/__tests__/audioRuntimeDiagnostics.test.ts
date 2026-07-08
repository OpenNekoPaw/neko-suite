import { describe, expect, it } from 'vitest';
import {
  createAudioInteractiveEditorRequiredResult,
  createAudioStreamRequiredError,
  diagnosticsFromAudioRuntimeError,
} from '../audioRuntimeDiagnostics';

describe('audioRuntimeDiagnostics', () => {
  it('returns typed interactive-editor diagnostics for command adapters', () => {
    const result = createAudioInteractiveEditorRequiredResult(
      'audio.record',
      'Audio recording requires an open editor.',
    );

    expect(result.ok).toBe(false);
    expect(result.diagnostics[0]).toMatchObject({
      code: 'interactive-editor-required',
      context: {
        domain: 'audio',
        operationId: 'audio.record',
        operationKind: 'interactive-editor',
      },
    });
  });

  it('returns typed stream diagnostics for runtime controls', () => {
    const error = createAudioStreamRequiredError(
      'audio.playback.seek',
      'Cannot seek because no audio stream is active.',
    );

    expect(diagnosticsFromAudioRuntimeError(error)?.[0]).toMatchObject({
      code: 'stream-required',
      context: {
        domain: 'audio',
        operationId: 'audio.playback.seek',
        operationKind: 'interactive-editor',
      },
    });
    expect(diagnosticsFromAudioRuntimeError(new Error('plain'))).toBeUndefined();
  });
});
