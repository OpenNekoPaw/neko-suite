/**
 * ContextBridge Tests
 */

import { describe, it, expect } from 'vitest';
import {
  ContextBridge,
  createContextBridge,
  estimateTokens,
  createContextSummaryForSubAgent,
} from '../context-bridge';

describe('ContextBridge', () => {
  describe('extractSummary', () => {
    it('should extract summary from messages', () => {
      const bridge = new ContextBridge();
      const messages = [
        { role: 'user', content: 'Hello, can you help me?' },
        { role: 'assistant', content: 'Of course! What do you need?' },
        { role: 'user', content: 'I need to find some files' },
      ];

      const summary = bridge.extractSummary(messages);

      expect(summary).toContain('Recent Conversation');
      expect(summary).toContain('[User]');
      expect(summary).toContain('[Assistant]');
    });

    it('should include system prompt when requested', () => {
      const bridge = new ContextBridge();
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ];

      const summary = bridge.extractSummary(messages, { includeSystemPrompt: true });

      expect(summary).toContain('System Context');
      expect(summary).toContain('helpful assistant');
    });

    it('should exclude system prompt by default', () => {
      const bridge = new ContextBridge();
      const messages = [
        { role: 'system', content: 'You are a helpful assistant' },
        { role: 'user', content: 'Hello' },
      ];

      const summary = bridge.extractSummary(messages);

      expect(summary).not.toContain('System Context');
    });

    it('should limit recent messages', () => {
      const bridge = new ContextBridge();
      const messages = Array.from({ length: 10 }, (_, i) => ({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      }));

      const summary = bridge.extractSummary(messages, { includeRecentMessages: 3 });

      // Should only include last 3 messages
      expect(summary).toContain('Message 7');
      expect(summary).toContain('Message 8');
      expect(summary).toContain('Message 9');
      expect(summary).not.toContain('Message 0');
    });

    it('should truncate to max tokens', () => {
      const bridge = new ContextBridge();
      const longContent = 'A'.repeat(10000);
      const messages = [{ role: 'user', content: longContent }];

      const summary = bridge.extractSummary(messages, { maxTokens: 100 });

      // maxTokens * 4 chars per token = 400 chars max
      expect(summary.length).toBeLessThanOrEqual(400);
      expect(summary).toContain('...');
    });

    it('should handle content parts array', () => {
      const bridge = new ContextBridge();
      const messages = [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Part 1' },
            { type: 'text', text: 'Part 2' },
            { type: 'image', url: 'http://example.com/img.png' },
          ],
        },
      ];

      const summary = bridge.extractSummary(messages);

      expect(summary).toContain('Part 1');
      expect(summary).toContain('Part 2');
      expect(summary).not.toContain('example.com');
    });

    it('should handle object content', () => {
      const bridge = new ContextBridge();
      const messages = [
        {
          role: 'tool',
          content: { result: 'success', data: [1, 2, 3] },
        },
      ];

      const summary = bridge.extractSummary(messages);

      expect(summary).toContain('result');
      expect(summary).toContain('success');
    });
  });

  describe('mergeResults', () => {
    it('should merge SubAgent results into messages', () => {
      const bridge = new ContextBridge();
      const parentMessages = [{ role: 'user', content: 'Find all API endpoints' }];
      const results = [
        { id: 'agent-1', response: 'Found 5 endpoints in routes.ts' },
        { id: 'agent-2', response: 'Found 3 endpoints in api.ts', name: 'code-search' },
      ];

      const merged = bridge.mergeResults(parentMessages, results);

      expect(merged).toHaveLength(2);
      expect(merged[1]!.role).toBe('assistant');
      expect(merged[1]!.content).toContain('subtasks');
      expect(merged[1]!.content).toContain('Found 5 endpoints');
      expect(merged[1]!.content).toContain('Found 3 endpoints');
      expect(merged[1]!.content).toContain('code-search');
    });

    it('should return original messages when no results', () => {
      const bridge = new ContextBridge();
      const parentMessages = [{ role: 'user', content: 'Hello' }];

      const merged = bridge.mergeResults(parentMessages, []);

      expect(merged).toEqual(parentMessages);
    });
  });
});

describe('createContextBridge', () => {
  it('should create a ContextBridge instance', () => {
    const bridge = createContextBridge();

    expect(bridge).toBeDefined();
    expect(typeof bridge.extractSummary).toBe('function');
    expect(typeof bridge.mergeResults).toBe('function');
  });
});

describe('estimateTokens', () => {
  it('should estimate token count', () => {
    expect(estimateTokens('hello')).toBe(2); // 5 chars / 4 = 1.25, ceil = 2
    expect(estimateTokens('hello world')).toBe(3); // 11 chars / 4 = 2.75, ceil = 3
    expect(estimateTokens('')).toBe(0);
  });
});

describe('createContextSummaryForSubAgent', () => {
  it('should create summary directly', () => {
    const messages = [
      { role: 'user', content: 'Hello' },
      { role: 'assistant', content: 'Hi there!' },
    ];

    const summary = createContextSummaryForSubAgent(messages);

    expect(summary).toContain('Recent Conversation');
    expect(summary).toContain('Hello');
    expect(summary).toContain('Hi there');
  });
});
