/**
 * LLM Connectivity Test
 *
 * Minimal test to verify LLM API connectivity using .neko/config.json.
 * Uses BuiltinLLMClient directly to test the HTTP layer.
 */

import { describe, it, expect } from 'vitest';
import { createLLMClient } from '../core/llm-client';
import { loadConfig } from '../core/config';
import path from 'node:path';

// Load config from project root
const PROJECT_ROOT = path.resolve(__dirname, '../../../../../..');
const config = loadConfig(PROJECT_ROOT);

describe('LLM Connectivity', () => {
  it('should load config from .neko/config.json', () => {
    console.log('Loaded config:', {
      provider: config.provider,
      providerType: config.providerType,
      model: config.model,
      baseUrl: config.baseUrl,
      apiKey: config.apiKey ? `***${config.apiKey.slice(-4)}` : 'NOT SET',
    });

    expect(config.apiKey).toBeTruthy();
    expect(config.model).toBeTruthy();
    expect(config.provider).toBeTruthy();
  });

  it('should get a response from the LLM API', async () => {
    const client = createLLMClient(config);

    const response = await client.chat(
      [{ role: 'user', content: 'Say "hello neko" and nothing else.' }],
      {
        maxTokens: 50,
        temperature: 0,
      },
    );

    console.log('LLM Response:', {
      content: response.content,
      usage: response.usage,
      toolCalls: response.toolCalls?.length ?? 0,
    });

    expect(response.content).toBeTruthy();
    expect(response.content.toLowerCase()).toContain('hello');
  }, 30000);

  it('should stream a response from the LLM API', async () => {
    const client = createLLMClient(config);

    let fullContent = '';
    let chunkCount = 0;
    let gotDone = false;

    for await (const chunk of client.chatStream(
      [{ role: 'user', content: 'Count from 1 to 5, one number per line.' }],
      {
        maxTokens: 100,
        temperature: 0,
      },
    )) {
      chunkCount++;
      if (chunk.type === 'content' && chunk.content) {
        fullContent += chunk.content;
      }
      if (chunk.type === 'done') {
        gotDone = true;
      }
    }

    console.log('Stream result:', {
      fullContent: fullContent.trim(),
      chunkCount,
      gotDone,
    });

    expect(fullContent).toBeTruthy();
    expect(chunkCount).toBeGreaterThan(1);
    expect(gotDone).toBe(true);
  }, 30000);
});
