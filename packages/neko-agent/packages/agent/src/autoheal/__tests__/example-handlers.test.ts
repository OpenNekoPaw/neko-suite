/**
 * Example handlers tests (ADR §6.4 B2).
 *
 * These are drop-in handler factories — the real work of retrying is
 * delegated to the ReAct loop runner. These tests therefore only
 * verify the outcome shape / note contract.
 */

import { describe, it, expect } from 'vitest';
import {
  createResolutionDegradeHandler,
  createSubstituteHandler,
  createUserEscalationHandler,
} from '../example-handlers';
import type { AutohealFailure, AutohealContext } from '../autoheal-types';

function failure(overrides: Partial<AutohealFailure> = {}): AutohealFailure {
  return {
    subject: 'tool:video.generate',
    errorCode: 'OOM',
    message: 'out of memory',
    attempt: 1,
    ...overrides,
  };
}

const ctx: AutohealContext = { round: 0 };

describe('createResolutionDegradeHandler', () => {
  it('emits degrade note on trigger + ladder rung', async () => {
    const handler = createResolutionDegradeHandler({ ladder: ['1080p', '720p', '480p'] });
    const out = await handler(failure({ attempt: 1 }), ctx);
    expect(out.resolution).toBe('healed');
    if (out.resolution === 'healed') {
      expect(out.level).toBe(2);
      expect(out.note).toBe('degrade:resolution=1080p');
    }
  });

  it('walks the ladder as attempts increase', async () => {
    const handler = createResolutionDegradeHandler({ ladder: ['1080p', '720p', '480p'] });
    const a = await handler(failure({ attempt: 1 }), ctx);
    const b = await handler(failure({ attempt: 2 }), ctx);
    const c = await handler(failure({ attempt: 3 }), ctx);
    expect(a.resolution === 'healed' && a.note).toBe('degrade:resolution=1080p');
    expect(b.resolution === 'healed' && b.note).toBe('degrade:resolution=720p');
    expect(c.resolution === 'healed' && c.note).toBe('degrade:resolution=480p');
  });

  it('passes when ladder is exhausted', async () => {
    const handler = createResolutionDegradeHandler({ ladder: ['1080p'] });
    const out = await handler(failure({ attempt: 2 }), ctx);
    expect(out.resolution).toBe('pass');
  });

  it('passes when errorCode is not a degrade trigger', async () => {
    const handler = createResolutionDegradeHandler();
    const out = await handler(failure({ errorCode: 'network_timeout' }), ctx);
    expect(out.resolution).toBe('pass');
  });

  it('custom argKey lets callers target non-resolution knobs', async () => {
    const handler = createResolutionDegradeHandler({
      argKey: 'batchSize',
      ladder: ['16', '8', '4'],
      triggers: ['OOM'],
    });
    const out = await handler(failure({ attempt: 1 }), ctx);
    expect(out.resolution === 'healed' && out.note).toBe('degrade:batchSize=16');
  });
});

describe('createSubstituteHandler', () => {
  it('emits substitute note on tool_unavailable', async () => {
    const handler = createSubstituteHandler({
      map: { 'image.dalle': 'image.sdxl' },
    });
    const out = await handler(
      failure({ subject: 'tool:image.dalle', errorCode: 'tool_unavailable' }),
      ctx,
    );
    expect(out.resolution).toBe('healed');
    if (out.resolution === 'healed') {
      expect(out.level).toBe(3);
      expect(out.note).toBe('substitute:image.sdxl');
    }
  });

  it('strips tool: prefix when present', async () => {
    const handler = createSubstituteHandler({
      map: { 'image.dalle': 'image.sdxl' },
    });
    const out = await handler(failure({ subject: 'image.dalle', errorCode: 'deprecated' }), ctx);
    expect(out.resolution === 'healed' && out.note).toBe('substitute:image.sdxl');
  });

  it('accepts ReadonlyMap<string,string>', async () => {
    const handler = createSubstituteHandler({
      map: new Map([['image.dalle', 'image.sdxl']]),
    });
    const out = await handler(
      failure({ subject: 'tool:image.dalle', errorCode: 'tool_unavailable' }),
      ctx,
    );
    expect(out.resolution === 'healed' && out.note).toBe('substitute:image.sdxl');
  });

  it('passes on non-trigger errors', async () => {
    const handler = createSubstituteHandler({ map: { 'image.dalle': 'image.sdxl' } });
    const out = await handler(
      failure({ subject: 'tool:image.dalle', errorCode: 'network_timeout' }),
      ctx,
    );
    expect(out.resolution).toBe('pass');
  });

  it('aborts unsubstitutable when trigger hits but map misses', async () => {
    const handler = createSubstituteHandler({ map: {} });
    const out = await handler(
      failure({ subject: 'tool:unknown', errorCode: 'tool_unavailable' }),
      ctx,
    );
    expect(out.resolution).toBe('aborted');
    if (out.resolution === 'aborted') expect(out.reason).toBe('unsubstitutable');
  });
});

describe('createUserEscalationHandler', () => {
  it('aborts with user-decline when prompt returns true', async () => {
    const handler = createUserEscalationHandler(async () => true);
    const out = await handler(failure(), ctx);
    expect(out.resolution).toBe('aborted');
    if (out.resolution === 'aborted') {
      expect(out.reason).toBe('user-decline');
      expect(out.level).toBe(5);
    }
  });

  it('aborts with retry-exhausted when prompt returns false', async () => {
    const handler = createUserEscalationHandler(async () => false);
    const out = await handler(failure(), ctx);
    if (out.resolution === 'aborted') expect(out.reason).toBe('retry-exhausted');
  });

  it('prompt throw is swallowed → retry-exhausted', async () => {
    const handler = createUserEscalationHandler(async () => {
      throw new Error('user closed dialog');
    });
    const out = await handler(failure(), ctx);
    if (out.resolution === 'aborted') expect(out.reason).toBe('retry-exhausted');
  });
});
