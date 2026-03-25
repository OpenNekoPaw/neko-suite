/**
 * Tests for ModelInstallTarget onPostInstall / onPreUninstall hooks.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AssetManifest, ModelMetadata } from '@neko/shared/types/asset/manifest';

// =============================================================================
// Mocks (vi.hoisted to avoid TDZ issues with vi.mock hoisting)
// =============================================================================

const {
  mockExecFileAsync,
  mockSpawn,
  mockFetch,
  mockWriteFileSync,
  mockReaddirSync,
  mockExistsSync,
  mockExecuteCommand,
  mockEngineDispatch,
} = vi.hoisted(() => ({
  mockExecFileAsync: vi.fn(),
  mockSpawn: vi.fn(),
  mockFetch: vi.fn(),
  mockWriteFileSync: vi.fn(),
  mockReaddirSync: vi.fn(),
  mockExistsSync: vi.fn(),
  mockExecuteCommand: vi.fn(),
  mockEngineDispatch: vi.fn().mockResolvedValue({ status: 'ok' }),
}));

vi.mock('util', () => ({
  promisify: () => mockExecFileAsync,
}));

vi.mock('child_process', () => ({
  execFile: vi.fn(),
  spawn: mockSpawn,
}));

vi.mock('fs', () => ({
  writeFileSync: mockWriteFileSync,
  readdirSync: mockReaddirSync,
  existsSync: mockExistsSync,
}));

vi.mock('vscode', () => ({
  commands: {
    executeCommand: mockExecuteCommand,
  },
}));

vi.mock('@neko/neko-client', () => {
  return {
    EngineClient: function EngineClient() {
      return { dispatch: mockEngineDispatch };
    },
  };
});

vi.stubGlobal('fetch', mockFetch);

import { ModelInstallTarget } from '../ModelInstallTarget';

// =============================================================================
// Helpers
// =============================================================================

function createManifest(
  name: string,
  framework: ModelMetadata['framework'],
  task: string,
): AssetManifest {
  return {
    id: `@test/${name}`,
    name,
    version: '1.0.0',
    type: 'ai-model',
    source: { kind: 'registry', registry: 'test', package: `@test/${name}`, version: '1.0.0' },
    typeMetadata: {
      type: 'model',
      data: { framework, task, size: 1000 },
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
  } as AssetManifest;
}

// =============================================================================
// Tests
// =============================================================================

describe('ModelInstallTarget', () => {
  let target: ModelInstallTarget;

  beforeEach(() => {
    vi.clearAllMocks();
    target = new ModelInstallTarget('ai-model');
    mockSpawn.mockReturnValue({ unref: vi.fn() });
  });

  // ---------------------------------------------------------------------------
  // getInstallPath
  // ---------------------------------------------------------------------------

  describe('getInstallPath', () => {
    it('should use framework from typeMetadata', () => {
      const manifest = createManifest('test-model', 'gguf', 'chat');
      const result = target.getInstallPath(manifest);
      expect(result).toContain('/gguf/test-model');
    });

    it('should default to generic when no typeMetadata', () => {
      const manifest = createManifest('test-model', 'gguf', 'chat');
      manifest.typeMetadata = undefined;
      const result = target.getInstallPath(manifest);
      expect(result).toContain('/generic/test-model');
    });
  });

  // ---------------------------------------------------------------------------
  // onPostInstall — GGUF → Ollama
  // ---------------------------------------------------------------------------

  describe('onPostInstall — GGUF', () => {
    const ggufManifest = createManifest('llama3-8b', 'gguf', 'chat');
    const installPath = '/home/user/.neko/models/gguf/llama3-8b';

    it('should call ollama create when Ollama is running', async () => {
      // Ollama is running
      mockFetch.mockResolvedValueOnce({ ok: true });
      // Find .gguf file
      mockReaddirSync.mockReturnValueOnce(['llama3-8b-q4.gguf', 'README.md']);
      // ollama create succeeds
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // refreshModels
      mockExecuteCommand.mockResolvedValueOnce(undefined);

      await target.onPostInstall(ggufManifest, installPath);

      // Verify Modelfile was written
      expect(mockWriteFileSync).toHaveBeenCalledWith(
        expect.stringContaining('Modelfile'),
        expect.stringContaining('FROM'),
        'utf-8',
      );

      // Verify ollama create was called
      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'ollama',
        ['create', 'llama3-8b', '-f', expect.stringContaining('Modelfile')],
        expect.objectContaining({ timeout: 60_000 }),
      );

      // Verify refreshModels was called
      expect(mockExecuteCommand).toHaveBeenCalledWith('neko.agent.refreshModels');
    });

    it('should start Ollama if not running', async () => {
      // First check: not running
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      // which ollama: found
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '/usr/local/bin/ollama\n', stderr: '' });
      // Poll: succeeds on 2nd attempt
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      mockFetch.mockResolvedValueOnce({ ok: true });
      // Find .gguf file
      mockReaddirSync.mockReturnValueOnce(['model.gguf']);
      // ollama create
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });
      // refreshModels
      mockExecuteCommand.mockResolvedValueOnce(undefined);

      await target.onPostInstall(ggufManifest, installPath);

      // Verify spawn was called with ollama serve
      expect(mockSpawn).toHaveBeenCalledWith(
        '/usr/local/bin/ollama',
        ['serve'],
        expect.objectContaining({ detached: true, stdio: 'ignore' }),
      );
    });

    it('should throw if Ollama is not installed', async () => {
      // Not running
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));
      // which ollama: not found
      mockExecFileAsync.mockRejectedValueOnce(new Error('not found'));
      // Common paths: not found
      mockExistsSync.mockReturnValue(false);

      await expect(target.onPostInstall(ggufManifest, installPath)).rejects.toThrow(
        'Ollama is not installed',
      );
    });

    it('should throw if no .gguf file found', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true });
      mockReaddirSync.mockReturnValueOnce(['README.md', 'config.json']);

      await expect(target.onPostInstall(ggufManifest, installPath)).rejects.toThrow(
        'No .gguf file found',
      );
    });
  });

  // ---------------------------------------------------------------------------
  // onPostInstall — ONNX → Engine
  // ---------------------------------------------------------------------------

  describe('onPostInstall — ONNX', () => {
    const onnxManifest = createManifest('realesrgan-4x', 'onnx', 'upscale');
    const installPath = '/home/user/.neko/models/onnx/realesrgan-4x';

    it('should register model with Engine', async () => {
      mockExecuteCommand.mockResolvedValueOnce({ port: 9090 });

      await target.onPostInstall(onnxManifest, installPath);

      expect(mockExecuteCommand).toHaveBeenCalledWith('neko.engine.ensureFrameServer');
    });

    it('should no-op if engine port unavailable', async () => {
      mockExecuteCommand.mockResolvedValueOnce(undefined);

      // Should not throw
      await target.onPostInstall(onnxManifest, installPath);
    });
  });

  // ---------------------------------------------------------------------------
  // onPostInstall — other frameworks
  // ---------------------------------------------------------------------------

  describe('onPostInstall — safetensors', () => {
    it('should no-op for safetensors framework', async () => {
      const manifest = createManifest('sdxl-turbo', 'safetensors', 'image-gen');
      await target.onPostInstall(manifest, '/path/to/model');

      expect(mockFetch).not.toHaveBeenCalled();
      expect(mockExecFileAsync).not.toHaveBeenCalled();
      expect(mockExecuteCommand).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // onPreUninstall
  // ---------------------------------------------------------------------------

  describe('onPreUninstall', () => {
    it('should call ollama rm for GGUF models', async () => {
      const manifest = createManifest('llama3-8b', 'gguf', 'chat');
      mockExecFileAsync.mockResolvedValueOnce({ stdout: '', stderr: '' });

      await target.onPreUninstall(manifest, '/path');

      expect(mockExecFileAsync).toHaveBeenCalledWith(
        'ollama',
        ['rm', 'llama3-8b'],
        expect.objectContaining({ timeout: 30_000 }),
      );
    });

    it('should not throw if ollama rm fails', async () => {
      const manifest = createManifest('llama3-8b', 'gguf', 'chat');
      mockExecFileAsync.mockRejectedValueOnce(new Error('not found'));

      // Should not throw
      await target.onPreUninstall(manifest, '/path');
    });

    it('should unregister ONNX from Engine', async () => {
      const manifest = createManifest('realesrgan', 'onnx', 'upscale');
      mockExecuteCommand.mockResolvedValueOnce({ port: 9090 });

      await target.onPreUninstall(manifest, '/path');

      expect(mockExecuteCommand).toHaveBeenCalledWith('neko.engine.ensureFrameServer');
    });
  });
});
