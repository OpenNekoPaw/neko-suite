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

  it('reports engine endpoint when the engine status command is available', async () => {
    installExtension('neko.neko-engine', { isActive: true });
    registerCommandHandler('neko.engine.start', () => {});
    registerCommandHandler('neko.engine.getStatus', () => ({
      state: 'ready',
      endpoint: {
        host: '127.0.0.1',
        port: 4321,
        address: '127.0.0.1:4321',
        url: 'http://127.0.0.1:4321',
      },
      health: 'unknown',
    }));

    const status = await new StatusReader().read();

    expect(status.engine).toEqual({
      available: true,
      value: {
        state: 'ready',
        port: 4321,
        endpoint: {
          host: '127.0.0.1',
          port: 4321,
          address: '127.0.0.1:4321',
          url: 'http://127.0.0.1:4321',
        },
        health: 'unknown',
      },
    });
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

  it('activates installed workflow extensions before reporting command availability', async () => {
    installExtension('neko.neko-model', {
      isActive: false,
      activate: () => {
        registerCommandHandler('neko.model.new', () => {});
        return {};
      },
    });

    const workflows = await new StatusReader().readWorkflows();

    expect(workflows).toContainEqual({
      id: 'nkm',
      available: true,
      state: 'ready',
      extensionId: 'neko.neko-model',
      command: 'neko.model.new',
    });
  });

  it('reports story workflow availability for fountain files', async () => {
    installExtension('neko.neko-story');
    registerCommandHandler('neko.story.newFile', () => {});

    const workflows = await new StatusReader().readWorkflows();

    expect(workflows).toContainEqual({
      id: 'fountain',
      available: true,
      state: 'ready',
      extensionId: 'neko.neko-story',
      command: 'neko.story.newFile',
    });
  });

  it('distinguishes missing workflow extensions from inactive command registration', async () => {
    installExtension('neko.neko-puppet', { isActive: false });

    const workflows = await new StatusReader().readWorkflows();

    expect(workflows).toContainEqual({
      id: 'nkm',
      available: false,
      state: 'missing',
      extensionId: 'neko.neko-model',
      command: 'neko.model.new',
    });
    expect(workflows).toContainEqual({
      id: 'nkp',
      available: false,
      state: 'inactive',
      extensionId: 'neko.neko-puppet',
      command: 'neko.puppet.new',
    });
  });

  it('reports workflow activation failures without treating them as missing installs', async () => {
    installExtension('neko.neko-puppet', {
      isActive: false,
      activate: () => {
        throw new Error('activation boom');
      },
    });

    const workflows = await new StatusReader().readWorkflows();

    expect(workflows).toContainEqual({
      id: 'nkp',
      available: false,
      state: 'error',
      extensionId: 'neko.neko-puppet',
      command: 'neko.puppet.new',
      error: 'activation boom',
    });
  });
});
