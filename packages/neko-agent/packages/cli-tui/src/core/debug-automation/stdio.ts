import type { Readable, Writable } from 'node:stream';
import {
  createTuiDebugAutomationErrorResponse,
  createTuiDebugAutomationSuccessResponse,
  parseTuiDebugAutomationRequest,
} from './protocol';
import type { TuiDebugAutomationRequest } from './types';

export interface TuiDebugAutomationRequestHandler {
  handle(request: TuiDebugAutomationRequest): Promise<unknown>;
}

export interface TuiDebugAutomationStdioOptions {
  readonly input: Readable;
  readonly output: Writable;
  readonly handler: TuiDebugAutomationRequestHandler;
}

export function runTuiDebugAutomationJsonLineServer(
  options: TuiDebugAutomationStdioOptions,
): Promise<void> {
  const { input, output, handler } = options;
  let buffer = '';
  let closed = false;
  let pending = Promise.resolve();

  return new Promise<void>((resolve) => {
    const cleanup = (): void => {
      input.off('data', onData);
      input.off('end', onEnd);
      input.off('close', onEnd);
      input.off('error', onError);
    };

    const close = (): void => {
      if (closed) return;
      closed = true;
      cleanup();
      resolve();
    };

    const writeResponse = (response: unknown): void => {
      output.write(`${JSON.stringify(response)}\n`);
    };

    const handleLine = (rawLine: string): void => {
      const line = rawLine.trim();
      if (!line) return;
      pending = pending.then(async () => {
        let requestId: string | null = null;
        try {
          const request = parseTuiDebugAutomationRequest(line);
          requestId = request.id;
          const result = await handler.handle(request);
          writeResponse(createTuiDebugAutomationSuccessResponse(request.id, result));
        } catch (error) {
          writeResponse(createTuiDebugAutomationErrorResponse(error, requestId));
        }
      });
    };

    const drainBuffer = (): void => {
      for (;;) {
        const newlineIndex = buffer.indexOf('\n');
        if (newlineIndex < 0) return;
        const line = buffer.slice(0, newlineIndex);
        buffer = buffer.slice(newlineIndex + 1);
        handleLine(line);
      }
    };

    function onData(chunk: Buffer | string): void {
      buffer += chunk.toString();
      drainBuffer();
    }

    function onEnd(): void {
      const trailing = buffer.trim();
      buffer = '';
      if (trailing) {
        handleLine(trailing);
      }
      void pending.finally(close);
    }

    function onError(error: Error): void {
      writeResponse(createTuiDebugAutomationErrorResponse(error));
      close();
    }

    input.on('data', onData);
    input.once('end', onEnd);
    input.once('close', onEnd);
    input.once('error', onError);
  });
}
