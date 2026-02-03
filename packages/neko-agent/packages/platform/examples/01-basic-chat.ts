/**
 * Basic Chat Example
 *
 * Demonstrates simple chat interaction with the platform.
 */

import { createPlatform } from '@uniedit/platform';

async function main() {
  // Create platform instance
  const platform = createPlatform({
    workspacePath: process.cwd(),
  });

  try {
    // Create service
    const service = platform.createService();

    // Simple chat
    console.log('Sending chat request...');
    const response = await service.chat([
      { role: 'system', content: 'You are a helpful video editing assistant.' },
      { role: 'user', content: 'What are the best practices for video transitions?' },
    ]);

    console.log('Response:', response.message.content);
    console.log('Model used:', response.routing.modelId);
    console.log('Duration:', response.timing.duration, 'ms');
  } finally {
    // Cleanup
    platform.dispose();
  }
}

main().catch(console.error);
