/**
 * Standalone LLM Connectivity Test Script
 *
 * Run with: npx tsx src/__tests__/test-llm.ts
 * Must be executed from project root to pick up .neko/config.json
 */

import path from 'node:path';
import { createLLMClient } from '../core/llm-client';
import { loadConfig } from '../core/config';

const PROJECT_ROOT = path.resolve(import.meta.dirname, '../../../../../..');

async function main() {
  console.log('=== LLM Connectivity Test ===\n');

  // Step 1: Load config
  console.log('[1/3] Loading config...');
  const config = loadConfig(PROJECT_ROOT);
  console.log('  Provider:', config.provider);
  console.log('  Provider Type:', config.providerType);
  console.log('  Model:', config.model);
  console.log('  Base URL:', config.baseUrl);
  console.log('  API Key:', config.apiKey ? `***${config.apiKey.slice(-4)}` : 'NOT SET');

  if (!config.apiKey) {
    console.error('\n❌ No API key found. Check .neko/config.json');
    process.exit(1);
  }
  console.log('  ✅ Config loaded\n');

  // Step 2: Test non-streaming chat
  console.log('[2/3] Testing non-streaming chat...');
  const client = createLLMClient(config);

  try {
    const response = await client.chat(
      [{ role: 'user', content: 'Say "hello neko" and nothing else.' }],
      { maxTokens: 50, temperature: 0 },
    );
    console.log('  Response:', JSON.stringify(response.content));
    console.log('  Usage:', response.usage);
    console.log('  ✅ Non-streaming chat works\n');
  } catch (err) {
    console.error('  ❌ Non-streaming chat failed:', (err as Error).message);
    process.exit(1);
  }

  // Step 3: Test streaming chat
  console.log('[3/3] Testing streaming chat...');
  try {
    let fullContent = '';
    let chunkCount = 0;

    process.stdout.write('  Streaming: ');
    for await (const chunk of client.chatStream(
      [{ role: 'user', content: 'Count from 1 to 5, separated by commas.' }],
      { maxTokens: 100, temperature: 0 },
    )) {
      if (chunk.type === 'content' && chunk.content) {
        fullContent += chunk.content;
        process.stdout.write(chunk.content);
        chunkCount++;
      }
      if (chunk.type === 'usage') {
        console.log(`\n  Usage: ${JSON.stringify(chunk.usage)}`);
      }
    }
    console.log(`\n  Chunks: ${chunkCount}`);
    console.log('  ✅ Streaming chat works\n');
  } catch (err) {
    console.error('  ❌ Streaming chat failed:', (err as Error).message);
    process.exit(1);
  }

  console.log('=== All tests passed ===');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
