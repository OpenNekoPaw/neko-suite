// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';
import {
  confirmCanvasEntityCandidate,
  requestCanvasEntitySummary,
} from './canvasEntityRouteClient';
import { setGlobalVSCodeApi } from '../../utils/vscode';

describe('canvas entity route client', () => {
  it('sends request/response messages with request ids', async () => {
    const postMessage = vi.fn((message: unknown) => {
      const request = message as { readonly _requestId: number };
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: '_response',
            _requestId: request._requestId,
            ok: true,
            summary: { status: 'candidate', displayName: 'Rin' },
          },
        }),
      );
    });
    setGlobalVSCodeApi(createVSCodeApiMock(postMessage));

    const response = await requestCanvasEntitySummary({
      candidateId: 'candidate-rin',
      characterName: 'Rin',
    });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'entity.summary',
        candidateId: 'candidate-rin',
        _requestId: expect.any(Number),
      }),
    );
    expect(response).toEqual(
      expect.objectContaining({
        ok: true,
        summary: { status: 'candidate', displayName: 'Rin' },
      }),
    );
  });

  it('routes candidate confirmation through the host', async () => {
    const postMessage = vi.fn((message: unknown) => {
      const request = message as { readonly _requestId: number };
      window.dispatchEvent(
        new MessageEvent('message', {
          data: {
            type: '_response',
            _requestId: request._requestId,
            ok: true,
          },
        }),
      );
    });
    setGlobalVSCodeApi(createVSCodeApiMock(postMessage));

    await confirmCanvasEntityCandidate({ candidateId: 'candidate-rin' });

    expect(postMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'entity.confirmCandidate',
        candidateId: 'candidate-rin',
        _requestId: expect.any(Number),
      }),
    );
  });
});

function createVSCodeApiMock(postMessage: (message: unknown) => void) {
  return {
    postMessage,
    getState: () => undefined,
    setState: () => undefined,
  };
}
