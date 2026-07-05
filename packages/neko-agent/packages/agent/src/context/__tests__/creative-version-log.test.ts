/**
 * Creative Version Log Tests — version tracking for AI generation iterations
 */

import { describe, it, expect } from 'vitest';
import {
  createCreativeVersionLog,
  isGenerationTool,
  detectEvaluation,
} from '../creative-version-log';

// =============================================================================
// isGenerationTool
// =============================================================================

describe('isGenerationTool', () => {
  it('should match generation tool names', () => {
    expect(isGenerationTool('GenerateImage')).toBe(true);
    expect(isGenerationTool('generateVideo')).toBe(true);
    expect(isGenerationTool('RenderScene')).toBe(true);
    expect(isGenerationTool('create_image_v2')).toBe(true);
    expect(isGenerationTool('SynthesizeSpeech')).toBe(true);
    expect(isGenerationTool('ComposeMusic')).toBe(true);
  });

  it('should not match non-generation tool names', () => {
    expect(isGenerationTool('ReadFile')).toBe(false);
    expect(isGenerationTool('ListElements')).toBe(false);
    expect(isGenerationTool('DeleteTrack')).toBe(false);
    expect(isGenerationTool('GetTimelineInfo')).toBe(false);
  });
});

// =============================================================================
// detectEvaluation
// =============================================================================

describe('detectEvaluation', () => {
  it('should detect approval keywords', () => {
    expect(detectEvaluation('这版不错，就用这个')).toEqual({
      evaluation: 'approved',
      note: '这版不错，就用这个',
    });
    expect(detectEvaluation('looks good!')).toEqual({
      evaluation: 'approved',
      note: 'looks good!',
    });
    expect(detectEvaluation('Perfect, love it')).toEqual({
      evaluation: 'approved',
      note: 'Perfect, love it',
    });
  });

  it('should detect rejection keywords', () => {
    expect(detectEvaluation('不行，重做')).toEqual({
      evaluation: 'rejected',
      note: '不行，重做',
    });
    expect(detectEvaluation('try again please')).toEqual({
      evaluation: 'rejected',
      note: 'try again please',
    });
  });

  it('should return undefined for neutral text', () => {
    expect(detectEvaluation('change the color to blue')).toBeUndefined();
    expect(detectEvaluation('what is this?')).toBeUndefined();
  });

  it('should prioritize rejection over approval when both present', () => {
    // Rejection keywords are checked first
    const result = detectEvaluation('不行，重做一个好的');
    expect(result?.evaluation).toBe('rejected');
  });
});

// =============================================================================
// CreativeVersionLog
// =============================================================================

describe('CreativeVersionLog', () => {
  function createLog() {
    return createCreativeVersionLog();
  }

  it('should start empty', () => {
    const log = createLog();
    expect(log.size).toBe(0);
    expect(log.getLatest()).toEqual([]);
    expect(log.toSummary()).toBe('');
  });

  it('should record entries with auto-generated id and index', () => {
    const log = createLog();
    const entry = log.record({
      toolName: 'GenerateImage',
      toolCallId: 'call_1',
      parameters: { prompt: 'sunset' },
      resultPath: '/tmp/sunset.png',
      resultSuccess: true,
      timestamp: 1000,
    });

    expect(entry.id).toBe('v_1000_0');
    expect(entry.iterationIndex).toBe(0);
    expect(entry.toolName).toBe('GenerateImage');
    expect(entry.parameters.prompt).toBe('sunset');
    expect(log.size).toBe(1);
  });

  it('should increment iteration index', () => {
    const log = createLog();

    const e1 = log.record({
      toolName: 'GenerateImage',
      toolCallId: 'call_1',
      parameters: {},
      resultSuccess: true,
      timestamp: 1000,
    });
    const e2 = log.record({
      toolName: 'GenerateVideo',
      toolCallId: 'call_2',
      parameters: {},
      resultSuccess: true,
      timestamp: 2000,
    });

    expect(e1.iterationIndex).toBe(0);
    expect(e2.iterationIndex).toBe(1);
  });

  it('should evaluate entry by id', () => {
    const log = createLog();
    const entry = log.record({
      toolName: 'GenerateImage',
      toolCallId: 'call_1',
      parameters: {},
      resultSuccess: true,
      timestamp: 1000,
    });

    const result = log.evaluate(entry.id, 'approved', '很满意');
    expect(result).toBe(true);

    const found = log.findById(entry.id);
    expect(found?.userEvaluation).toBe('approved');
    expect(found?.evaluationNote).toBe('很满意');
  });

  it('should evaluate latest entry', () => {
    const log = createLog();
    log.record({
      toolName: 'GenerateImage',
      toolCallId: 'call_1',
      parameters: {},
      resultSuccess: true,
      timestamp: 1000,
    });
    log.record({
      toolName: 'GenerateVideo',
      toolCallId: 'call_2',
      parameters: {},
      resultSuccess: true,
      timestamp: 2000,
    });

    log.evaluateLatest('rejected', 'not good');

    const latest = log.getLatest(1);
    expect(latest[0]?.userEvaluation).toBe('rejected');
  });

  it('should return false when evaluating non-existent entry', () => {
    const log = createLog();
    expect(log.evaluate('nonexistent', 'approved')).toBe(false);
  });

  it('should return false when evaluating latest on empty log', () => {
    const log = createLog();
    expect(log.evaluateLatest('approved')).toBe(false);
  });

  it('should filter by tool name', () => {
    const log = createLog();
    log.record({
      toolName: 'GenerateImage',
      toolCallId: '1',
      parameters: {},
      resultSuccess: true,
      timestamp: 1000,
    });
    log.record({
      toolName: 'GenerateVideo',
      toolCallId: '2',
      parameters: {},
      resultSuccess: true,
      timestamp: 2000,
    });
    log.record({
      toolName: 'GenerateImage',
      toolCallId: '3',
      parameters: {},
      resultSuccess: false,
      timestamp: 3000,
    });

    expect(log.getByTool('GenerateImage')).toHaveLength(2);
    expect(log.getByTool('GenerateVideo')).toHaveLength(1);
    expect(log.getByTool('Unknown')).toHaveLength(0);
  });

  it('should get approved entries', () => {
    const log = createLog();
    const e1 = log.record({
      toolName: 'GenerateImage',
      toolCallId: '1',
      parameters: {},
      resultSuccess: true,
      timestamp: 1000,
    });
    log.record({
      toolName: 'GenerateVideo',
      toolCallId: '2',
      parameters: {},
      resultSuccess: true,
      timestamp: 2000,
    });

    log.evaluate(e1.id, 'approved');

    expect(log.getApproved()).toHaveLength(1);
    expect(log.getApproved()[0]?.toolName).toBe('GenerateImage');
  });

  it('should get latest N entries', () => {
    const log = createLog();
    for (let i = 0; i < 10; i++) {
      log.record({
        toolName: 'GenerateImage',
        toolCallId: `call_${i}`,
        parameters: { i },
        resultSuccess: true,
        timestamp: i * 1000,
      });
    }

    expect(log.getLatest(3)).toHaveLength(3);
    expect(log.getLatest(3)[0]?.iterationIndex).toBe(7);
  });

  it('should generate summary', () => {
    const log = createLog();
    log.record({
      toolName: 'GenerateImage',
      toolCallId: 'call_1',
      parameters: { prompt: 'sunset', style: 'watercolor' },
      resultPath: '/tmp/sunset.png',
      resultSuccess: true,
      timestamp: 1000,
    });

    const summary = log.toSummary();
    expect(summary).toContain('Creative Version Log');
    expect(summary).toContain('GenerateImage');
    expect(summary).toContain('prompt=sunset');
    expect(summary).toContain('/tmp/sunset.png');
    expect(summary).toContain('✓');
  });

  it('should show failure marker in summary', () => {
    const log = createLog();
    log.record({
      toolName: 'GenerateVideo',
      toolCallId: 'call_1',
      parameters: {},
      resultSuccess: false,
      timestamp: 1000,
    });

    expect(log.toSummary()).toContain('✗');
  });

  it('should show evaluation in summary', () => {
    const log = createLog();
    const entry = log.record({
      toolName: 'GenerateImage',
      toolCallId: 'call_1',
      parameters: {},
      resultSuccess: true,
      timestamp: 1000,
    });
    log.evaluate(entry.id, 'approved');

    expect(log.toSummary()).toContain('[approved]');
  });

  it('should localize summary chrome for Chinese prompts', () => {
    const log = createLog();
    const entry = log.record({
      toolName: 'GenerateImage',
      toolCallId: 'call_1',
      parameters: { prompt: 'sunset' },
      resultPath: '/tmp/sunset.png',
      resultSuccess: true,
      timestamp: 1000,
    });
    log.evaluate(entry.id, 'approved');

    const summary = log.toSummary(5, 'zh');

    expect(summary).toContain('创作版本日志');
    expect(summary).toContain('[已批准]');
    expect(summary).not.toContain('Creative Version Log');
    expect(summary).not.toContain('[approved]');
  });
});
