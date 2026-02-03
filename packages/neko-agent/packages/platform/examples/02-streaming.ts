/**
 * Streaming Chat Example
 *
 * Demonstrates streaming responses for real-time output.
 */

import { createPlatform } from '@neko/platform';

async function main() {
  const platform = createPlatform();

  try {
    const service = platform.createService();

    console.log('Starting streaming chat...\n');

    // Start streaming
    const { stream, response } = service.chatStream([
      { role: 'user', content: 'Write a short script for a 30-second product video.' },
    ]);

    // Process stream chunks
    for await (const chunk of stream) {
      if (chunk.content) {
        process.stdout.write(chunk.content);
      }
    }

    // Get final response with metadata
    const finalResponse = await response;
    console.log('\n\n--- Stream Complete ---');
    console.log('Total tokens:', finalResponse.usage?.totalTokens);
    console.log('Duration:', finalResponse.timing.duration, 'ms');
  } finally {
    platform.dispose();
  }
}

main().catch(console.error);
