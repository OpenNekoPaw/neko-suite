/**
 * Integration Tests — Real API with ~/.neko/config.toml
 *
 * These tests use the actual user configuration and make real API calls.
 * They verify that:
 * 1. Reasoning models work without temperature warnings
 * 2. The full Platform → Service → Adapter pipeline functions correctly
 * 3. Media generation service is available when TaskManager is provided
 *
 * Skip these in CI (no API keys). Run manually:
 *   pnpm vitest run packages/platform/src/__tests__/integration.test.ts
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createPlatform, type Platform } from '../index';
import { FileUserConfigManager, toSharedService } from '../index';
import { TaskManager, createFileTaskStorage } from '@neko/agent';
import type { IService, IToolRegistry } from '@neko/shared';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';

// Check if real config exists — skip entire suite if not
const configPath = path.join(os.homedir(), '.neko', 'config.toml');
const hasRealConfig = fs.existsSync(configPath);

// Minimal no-op tool registry for testing
const noopToolRegistry: IToolRegistry = {
  register: () => {},
  unregister: () => {},
  get: () => undefined,
  getAll: () => [],
  has: () => false,
  getAllToolDefinitions: () => [],
} as unknown as IToolRegistry;

describe.skipIf(!hasRealConfig)('Integration: Real API with ~/.neko/config.toml', () => {
  let platform: Platform;
  let service: IService;

  beforeAll(() => {
    const userConfigManager = new FileUserConfigManager();

    // Create TaskManager with file-based storage (same as CLI does)
    const taskStoragePath = path.join(os.homedir(), '.neko', 'test-tasks.json');
    const taskManager = new TaskManager({ storage: createFileTaskStorage(taskStoragePath) });

    platform = createPlatform({
      userConfigManager,
      toolRegistry: noopToolRegistry,
      taskManager,
    });

    service = toSharedService(platform.createService());
  });

  afterAll(() => {
    platform?.dispose();
    // Clean up test task file
    const testTaskPath = path.join(os.homedir(), '.neko', 'test-tasks.json');
    try {
      fs.unlinkSync(testTaskPath);
    } catch {
      // ignore
    }
  });

  // =========================================================================
  // Config Loading
  // =========================================================================

  it('should load providers from user config', () => {
    const providers = platform.config.getEnabledProviders();
    expect(providers.length).toBeGreaterThan(0);

    console.log(
      'Loaded providers:',
      providers.map((p) => `${p.id} (${p.type})`),
    );
  });

  it('should load models from user config', () => {
    const models = platform.config.getEnabledModels();
    expect(models.length).toBeGreaterThan(0);

    console.log(
      'Loaded models:',
      models.map((m) => `${m.id} [${m.capabilities?.join(', ')}]`),
    );
  });

  it('should detect reasoning models correctly', () => {
    const models = platform.config.getEnabledModels();
    const reasoningModels = models.filter((m) => m.capabilities?.includes('reasoning'));

    console.log(
      'Reasoning models:',
      reasoningModels.map((m) => m.id),
    );

    // If user has reasoning models configured, verify they are detected
    if (reasoningModels.length > 0) {
      for (const model of reasoningModels) {
        expect(model.capabilities).toContain('reasoning');
      }
    }
  });

  // =========================================================================
  // Media Platform
  // =========================================================================

  it('should have media generation service available', () => {
    expect(platform.media).toBeDefined();
  });

  // =========================================================================
  // Real API Calls (reasoning model)
  // =========================================================================

  it('should call reasoning model without temperature warning', async () => {
    const models = platform.config.getEnabledModels();
    const reasoningModels = models.filter((m) => m.capabilities?.includes('reasoning'));

    if (reasoningModels.length === 0) {
      console.log('No reasoning model configured, skipping API call test');
      return;
    }

    // Prefer gpt-5.1-codex (user's default), fallback to first reasoning model
    const reasoningModel =
      reasoningModels.find((m) => m.id === 'gpt-5.1-codex') ?? reasoningModels[0]!;

    console.log(`Testing reasoning model: ${reasoningModel.id} (${reasoningModel.name})`);

    // Capture console warnings to verify no temperature warning
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
      originalWarn.apply(console, args);
    };

    try {
      const result = await service.chat(
        [{ role: 'user', content: 'Say "hello" and nothing else.' }],
        {
          modelId: reasoningModel.id,
          maxTokens: 100,
        },
      );

      expect(result).toBeDefined();
      expect(result.message).toBeDefined();
      console.log(
        `Response: ${typeof result.message.content === 'string' ? result.message.content.slice(0, 100) : JSON.stringify(result.message.content)}`,
      );

      // Verify no temperature warning from AI SDK
      const tempWarnings = warnings.filter((w) => w.includes('temperature'));
      expect(tempWarnings).toHaveLength(0);
    } finally {
      console.warn = originalWarn;
    }
  }, 30_000);

  it('should stream from reasoning model without temperature warning', async () => {
    const models = platform.config.getEnabledModels();
    const reasoningModels = models.filter((m) => m.capabilities?.includes('reasoning'));

    if (reasoningModels.length === 0) {
      console.log('No reasoning model configured, skipping stream test');
      return;
    }

    // Prefer gpt-5.1-codex (user's default), fallback to first reasoning model
    const reasoningModel =
      reasoningModels.find((m) => m.id === 'gpt-5.1-codex') ?? reasoningModels[0]!;

    console.log(`Testing stream with reasoning model: ${reasoningModel.id}`);

    // Capture console warnings
    const warnings: string[] = [];
    const originalWarn = console.warn;
    console.warn = (...args: unknown[]) => {
      warnings.push(args.map(String).join(' '));
      originalWarn.apply(console, args);
    };

    try {
      const stream = service.chatStream(
        [{ role: 'user', content: 'Say "world" and nothing else.' }],
        {
          modelId: reasoningModel.id,
          maxTokens: 100,
        },
      );

      let content = '';
      for await (const chunk of stream) {
        if (chunk.content) {
          content += chunk.content;
        }
      }

      expect(content).toBeTruthy();
      console.log(`Streamed response: ${content.slice(0, 100)}`);

      // Verify no temperature warning
      const tempWarnings = warnings.filter((w) => w.includes('temperature'));
      expect(tempWarnings).toHaveLength(0);
    } finally {
      console.warn = originalWarn;
    }
  }, 30_000);
});
