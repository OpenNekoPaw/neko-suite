import {
  createNekoProjectAuthoringDiagnostic,
  createNekoProjectAuthoringResult,
  type NekoProjectAuthoringDiagnostic,
  type NekoProjectAuthoringResult,
} from '@neko/shared';

export class AudioRuntimeDiagnosticError extends Error {
  constructor(
    message: string,
    readonly diagnostics: readonly NekoProjectAuthoringDiagnostic[],
  ) {
    super(message);
    this.name = 'AudioRuntimeDiagnosticError';
  }
}

export function createAudioInteractiveEditorRequiredResult(
  operationId: string,
  message: string,
): NekoProjectAuthoringResult {
  return createNekoProjectAuthoringResult({
    ok: false,
    diagnostics: [createAudioInteractiveEditorRequiredDiagnostic(operationId, message)],
  });
}

export function createAudioInteractiveEditorForwardedResult(
  operationId: string,
): NekoProjectAuthoringResult {
  return createNekoProjectAuthoringResult({
    ok: true,
    diagnostics: [],
    data: {
      domain: 'audio',
      operationId,
      operationKind: 'interactive-editor',
    },
  });
}

export function createAudioInteractiveEditorRequiredDiagnostic(
  operationId: string,
  message: string,
): NekoProjectAuthoringDiagnostic {
  return createNekoProjectAuthoringDiagnostic({
    code: 'interactive-editor-required',
    message,
    context: {
      domain: 'audio',
      operationId,
      operationKind: 'interactive-editor',
    },
  });
}

export function createAudioStreamRequiredError(
  operationId: string,
  message: string,
): AudioRuntimeDiagnosticError {
  return new AudioRuntimeDiagnosticError(message, [
    createNekoProjectAuthoringDiagnostic({
      code: 'stream-required',
      message,
      context: {
        domain: 'audio',
        operationId,
        operationKind: 'interactive-editor',
      },
    }),
  ]);
}

export function diagnosticsFromAudioRuntimeError(
  error: unknown,
): readonly NekoProjectAuthoringDiagnostic[] | undefined {
  if (error instanceof AudioRuntimeDiagnosticError) {
    return error.diagnostics;
  }
  return undefined;
}
