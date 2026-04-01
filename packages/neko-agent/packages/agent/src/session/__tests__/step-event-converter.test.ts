/**
 * Step-Event Converter Unit Tests
 *
 * Tests stepToEvents and recordStepInHistory as pure functions.
 */

import { describe, it, expect } from 'vitest';
import { stepToEvents, recordStepInHistory, type StreamState } from '../step-event-converter';
import type { AgentStep, ChatMessage } from '@neko/shared';
import type { AgentEvent } from '../types';

// =============================================================================
// Helpers
// =============================================================================

function collect(gen: Generator<AgentEvent>): AgentEvent[] {
  return [...gen];
}

function freshStreamState(): StreamState {
  return { hasStreamedDeltas: false };
}

// =============================================================================
// stepToEvents
// =============================================================================

describe('stepToEvents', () => {
  it('should emit text_delta for content_delta step', () => {
    const step: AgentStep = { type: 'content_delta', content: 'hello', timestamp: Date.now() };
    const ss = freshStreamState();

    const events = collect(stepToEvents(step, 1, 10, ss));

    // No iteration event for content_delta
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('text_delta');
    expect(events[0]!.content).toBe('hello');
    expect(ss.hasStreamedDeltas).toBe(true);
  });

  it('should emit iteration + text for think step (no prior deltas)', () => {
    const step: AgentStep = { type: 'think', content: 'Thinking...', timestamp: Date.now() };
    const ss = freshStreamState();

    const events = collect(stepToEvents(step, 1, 10, ss));

    expect(events[0]!.type).toBe('iteration');
    expect(events[1]!.type).toBe('text');
    expect(events[1]!.content).toBe('Thinking...');
  });

  it('should skip text for think step when deltas were streamed', () => {
    const step: AgentStep = { type: 'think', content: 'Final', timestamp: Date.now() };
    const ss: StreamState = { hasStreamedDeltas: true };

    const events = collect(stepToEvents(step, 1, 10, ss));

    // Should have iteration event but NOT text event (deltas already sent)
    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(0);
    // hasStreamedDeltas should be reset
    expect(ss.hasStreamedDeltas).toBe(false);
  });

  it('should emit thinking_content for think step with thinking', () => {
    const step: AgentStep = {
      type: 'think',
      content: 'response',
      thinking: 'Let me think...',
      timestamp: Date.now(),
    };
    const ss = freshStreamState();

    const events = collect(stepToEvents(step, 1, 10, ss));

    const thinkingEvent = events.find((e) => e.type === 'thinking_content');
    expect(thinkingEvent).toBeDefined();
    expect(thinkingEvent!.thinking).toBe('Let me think...');
  });

  it('should emit tool_call events for think step with tool calls', () => {
    const step: AgentStep = {
      type: 'think',
      content: '',
      toolCalls: [
        { id: 'tc_1', name: 'Read', arguments: { path: '/tmp' } },
        { id: 'tc_2', name: 'Write', arguments: { path: '/out' } },
      ],
      timestamp: Date.now(),
    };
    const ss = freshStreamState();

    const events = collect(stepToEvents(step, 1, 10, ss));

    const toolCallEvents = events.filter((e) => e.type === 'tool_call');
    expect(toolCallEvents).toHaveLength(2);
    expect(toolCallEvents[0]!.toolCall!.name).toBe('Read');
    expect(toolCallEvents[1]!.toolCall!.name).toBe('Write');
  });

  it('should emit tool_result events for act step', () => {
    const step: AgentStep = {
      type: 'act',
      content: 'Executed 1 tool(s)',
      toolResults: [{ callId: 'c1', success: true, data: 'ok', name: 'Read' }] as any,
      timestamp: Date.now(),
    };
    const ss = freshStreamState();

    const events = collect(stepToEvents(step, 1, 10, ss));

    const resultEvents = events.filter((e) => e.type === 'tool_result');
    expect(resultEvents).toHaveLength(1);
    expect(resultEvents[0]!.toolResult!.success).toBe(true);
  });

  it('should emit tool_progress events before tool_result for act step', () => {
    const step: AgentStep = {
      type: 'act',
      content: 'Executed 1 tool(s)',
      toolResults: [{ callId: 'c1', success: true, data: 'ok', name: 'GenImg' }] as any,
      toolProgress: [
        { toolCallId: 'c1', toolName: 'GenImg', percent: 50, stage: 'Rendering' },
        { toolCallId: 'c1', toolName: 'GenImg', percent: 100, stage: 'Done' },
      ],
      timestamp: Date.now(),
    };
    const ss = freshStreamState();

    const events = collect(stepToEvents(step, 1, 10, ss));

    const progressEvents = events.filter((e) => e.type === 'tool_progress');
    const resultEvents = events.filter((e) => e.type === 'tool_result');

    expect(progressEvents).toHaveLength(2);
    expect(progressEvents[0]!.toolProgress!.percent).toBe(50);
    expect(progressEvents[0]!.toolProgress!.stage).toBe('Rendering');
    expect(progressEvents[1]!.toolProgress!.percent).toBe(100);
    expect(resultEvents).toHaveLength(1);

    // Progress events should come before result events
    const firstProgress = events.indexOf(progressEvents[0]!);
    const firstResult = events.indexOf(resultEvents[0]!);
    expect(firstProgress).toBeLessThan(firstResult);
  });

  it('should emit text for respond step', () => {
    const step: AgentStep = { type: 'respond', content: 'Done!', timestamp: Date.now() };
    const ss = freshStreamState();

    const events = collect(stepToEvents(step, 1, 10, ss));

    expect(events[0]!.type).toBe('iteration');
    expect(events[1]!.type).toBe('text');
    expect(events[1]!.content).toBe('Done!');
  });

  it('should emit nothing for observe step', () => {
    const step: AgentStep = { type: 'observe', content: 'summary', timestamp: Date.now() };
    const ss = freshStreamState();

    const events = collect(stepToEvents(step, 1, 10, ss));

    // Only iteration event, no content events
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe('iteration');
  });

  it('should propagate hasStreamedDeltas across calls', () => {
    const ss = freshStreamState();

    // First call: content_delta sets flag
    const delta: AgentStep = { type: 'content_delta', content: 'hi', timestamp: Date.now() };
    collect(stepToEvents(delta, 1, 10, ss));
    expect(ss.hasStreamedDeltas).toBe(true);

    // Second call: think step reads flag, then resets it
    const think: AgentStep = { type: 'think', content: 'full', timestamp: Date.now() };
    const events = collect(stepToEvents(think, 1, 10, ss));

    // text should NOT be emitted because hasStreamedDeltas was true
    const textEvents = events.filter((e) => e.type === 'text');
    expect(textEvents).toHaveLength(0);
    // After think, flag is reset
    expect(ss.hasStreamedDeltas).toBe(false);
  });
});

// =============================================================================
// recordStepInHistory
// =============================================================================

describe('recordStepInHistory', () => {
  it('should add assistant message for think step with content', () => {
    const history: ChatMessage[] = [];
    const step: AgentStep = { type: 'think', content: 'Hello', timestamp: Date.now() };

    recordStepInHistory(step, 1, history);

    expect(history).toHaveLength(1);
    expect(history[0]!.role).toBe('assistant');
    expect(history[0]!.content).toBe('Hello');
  });

  it('should add assistant message with toolCalls for think step', () => {
    const history: ChatMessage[] = [];
    const step: AgentStep = {
      type: 'think',
      content: '',
      toolCalls: [{ id: 'tc_1', name: 'Read', arguments: { path: '/tmp' } }],
      timestamp: Date.now(),
    };

    recordStepInHistory(step, 1, history);

    expect(history).toHaveLength(1);
    expect(history[0]!.role).toBe('assistant');
    expect(history[0]!.toolCalls).toHaveLength(1);
    expect(history[0]!.toolCalls![0]!.function.name).toBe('Read');
  });

  it('should add tool messages for act step', () => {
    const history: ChatMessage[] = [];
    const step: AgentStep = {
      type: 'act',
      content: '',
      toolResults: [
        { callId: 'c1', success: true, data: 'ok', name: 'Read' },
        { callId: 'c2', success: false, error: 'fail', name: 'Write' },
      ] as any,
      timestamp: Date.now(),
    };

    recordStepInHistory(step, 1, history);

    expect(history).toHaveLength(2);
    expect(history[0]!.role).toBe('tool');
    expect(history[0]!.content).toBe(JSON.stringify('ok'));
    expect(history[1]!.content).toBe(JSON.stringify({ error: 'fail' }));
  });

  it('should add assistant message for respond step', () => {
    const history: ChatMessage[] = [];
    const step: AgentStep = { type: 'respond', content: 'Done!', timestamp: Date.now() };

    recordStepInHistory(step, 1, history);

    expect(history).toHaveLength(1);
    expect(history[0]!.role).toBe('assistant');
    expect(history[0]!.content).toBe('Done!');
  });

  it('should not add anything for content_delta step', () => {
    const history: ChatMessage[] = [];
    const step: AgentStep = { type: 'content_delta', content: 'chunk', timestamp: Date.now() };

    recordStepInHistory(step, 1, history);

    expect(history).toHaveLength(0);
  });

  it('should not add anything for observe step', () => {
    const history: ChatMessage[] = [];
    const step: AgentStep = { type: 'observe', content: 'summary', timestamp: Date.now() };

    recordStepInHistory(step, 1, history);

    expect(history).toHaveLength(0);
  });
});
