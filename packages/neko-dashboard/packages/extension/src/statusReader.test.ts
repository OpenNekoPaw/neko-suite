import { beforeEach, describe, expect, it } from 'vitest';
import {
  installExtension,
  registerCommandHandler,
  vscodeCommandState,
  vscodeExtensionState,
} from './vscode-test-double';
import { StatusReader } from './statusReader';

describe('StatusReader', () => {
  beforeEach(() => {
    vscodeCommandState.reset();
    vscodeExtensionState.reset();
  });

  it('reports ready when engine extension is active', async () => {
    installExtension('neko.neko-engine', { isActive: true });
    registerCommandHandler('neko.engine.start', () => {});

    const status = await new StatusReader().read();

    expect(status.engine?.available).toBe(true);
    expect(status.engine?.value?.state).toBe('ready');
  });

  it('reports idle when engine extension is installed but not active', async () => {
    installExtension('neko.neko-engine', { isActive: false });

    const status = await new StatusReader().read();

    expect(status.engine?.available).toBe(true);
    expect(status.engine?.value?.state).toBe('idle');
  });

  it('marks agent and assets available when extensions are installed', async () => {
    installExtension('neko.neko-agent');
    installExtension('neko.neko-assets');

    const status = await new StatusReader().read();

    expect(status.agent?.available).toBe(true);
    expect(status.assets?.available).toBe(true);
  });

  it('marks all unavailable when extensions are not installed', async () => {
    const status = await new StatusReader().read();

    expect(status.engine?.available).toBe(false);
    expect(status.agent?.available).toBe(false);
    expect(status.assets?.available).toBe(false);
  });
});
