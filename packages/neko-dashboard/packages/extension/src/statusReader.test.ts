import { beforeEach, describe, expect, it } from 'vitest';
import { registerCommandHandler, vscodeCommandState } from './vscode-test-double';
import { StatusReader } from './statusReader';

describe('StatusReader', () => {
  beforeEach(() => {
    vscodeCommandState.reset();
  });

  it('reads available status commands silently', async () => {
    registerCommandHandler('neko.engine.getStatus', () => ({ state: 'ready' }));
    registerCommandHandler('neko.agent.getSessionCount', () => ({ total: 2, running: 1 }));
    registerCommandHandler('neko.assets.getSummary', () => ({ fileCount: 10, totalSize: 20 }));

    const status = await new StatusReader().read();

    expect(status.engine?.available).toBe(true);
    expect(status.engine?.value?.state).toBe('ready');
    expect(status.agent?.value?.running).toBe(1);
    expect(status.assets?.value?.fileCount).toBe(10);
  });

  it('marks missing and throwing commands unavailable', async () => {
    registerCommandHandler('neko.engine.getStatus', () => {
      throw new Error('engine down');
    });

    const status = await new StatusReader().read();

    expect(status.engine?.available).toBe(false);
    expect(status.engine?.error).toContain('engine down');
    expect(status.agent?.available).toBe(false);
    expect(status.assets?.available).toBe(false);
  });
});
