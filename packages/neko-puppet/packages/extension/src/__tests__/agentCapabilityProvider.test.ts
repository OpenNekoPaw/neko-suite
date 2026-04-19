import { describe, it, expect, vi } from 'vitest';

vi.mock('vscode', () => ({
  commands: { executeCommand: vi.fn() },
}));

import { validateAndClampParams, parseJsonFromLLMResponse } from '../agentCapabilityProvider';

// =============================================================================
// validateAndClampParams
// =============================================================================

describe('validateAndClampParams', () => {
  it('accepts valid parameter IDs with numeric values', () => {
    const result = validateAndClampParams({ faceWidth: 0.5 });
    expect(result).toHaveProperty('faceWidth');
    expect(result.faceWidth).toBe(0.5);
  });

  it('ignores unknown parameter IDs', () => {
    const result = validateAndClampParams({
      faceWidth: 0.5,
      nonExistentParam: 0.8,
      anotherFake: 1.0,
    });
    expect(result).toHaveProperty('faceWidth');
    expect(result).not.toHaveProperty('nonExistentParam');
    expect(result).not.toHaveProperty('anotherFake');
  });

  it('clamps values above max to max', () => {
    // faceWidth range: [-1, 1]
    const result = validateAndClampParams({ faceWidth: 999 });
    expect(result.faceWidth).toBe(1);
  });

  it('clamps values below min to min', () => {
    // faceWidth range: [-1, 1]
    const result = validateAndClampParams({ faceWidth: -5 });
    expect(result.faceWidth).toBe(-1);
  });

  it('coerces string numbers to numeric values', () => {
    const result = validateAndClampParams({ faceWidth: '0.7' as unknown });
    expect(result.faceWidth).toBeCloseTo(0.7, 5);
  });

  it('skips NaN values', () => {
    const result = validateAndClampParams({
      faceWidth: 'not-a-number' as unknown,
    });
    expect(result).not.toHaveProperty('faceWidth');
  });

  it('rejects Infinity, -Infinity, and overflow values', () => {
    // Note: `Number.MAX_VALUE * 2` (runtime overflow to Infinity) is used
    // instead of a literal like `1e309` because the literal trips
    // eslint's no-loss-of-precision rule — it's folded to Infinity at
    // parse time, losing the literal value.  The runtime multiplication
    // preserves the intent (a value that evaluates to Infinity) without
    // the lint violation.
    const result = validateAndClampParams({
      faceWidth: Infinity as unknown,
      jawWidth: -Infinity as unknown,
      eyeSize: (Number.MAX_VALUE * 2) as unknown, // overflows to Infinity
      eyeSpacing: 'Infinity' as unknown, // string "Infinity"
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('rejects boolean, null, empty string, and object values', () => {
    const result = validateAndClampParams({
      faceWidth: true as unknown,
      jawWidth: false as unknown,
      eyeSize: null as unknown,
      eyeSpacing: '' as unknown,
      noseWidth: {} as unknown,
    });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('returns empty object when all params are unknown', () => {
    const result = validateAndClampParams({ x: 1, y: 2, z: 3 });
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('returns empty object for empty input', () => {
    const result = validateAndClampParams({});
    expect(Object.keys(result)).toHaveLength(0);
  });

  it('handles multiple valid params simultaneously', () => {
    const result = validateAndClampParams({
      faceWidth: 0.5,
      jawWidth: 0.3,
      eyeSize: 0.8,
    });
    expect(Object.keys(result).length).toBeGreaterThanOrEqual(2);
  });
});

// =============================================================================
// parseJsonFromLLMResponse
// =============================================================================

describe('parseJsonFromLLMResponse', () => {
  it('parses raw JSON object', () => {
    const result = parseJsonFromLLMResponse('{"faceWidth": 0.5, "eyeSize": 0.8}');
    expect(result).toEqual({ faceWidth: 0.5, eyeSize: 0.8 });
  });

  it('parses JSON inside markdown code fence', () => {
    const input = '```json\n{"faceWidth": 0.5}\n```';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ faceWidth: 0.5 });
  });

  it('parses JSON inside code fence without language tag', () => {
    const input = '```\n{"faceWidth": 0.5}\n```';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ faceWidth: 0.5 });
  });

  it('extracts JSON object embedded in surrounding text', () => {
    const input = 'Here are the params: {"faceWidth": 0.5, "jawWidth": 0.3} hope this helps!';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ faceWidth: 0.5, jawWidth: 0.3 });
  });

  it('returns null for plain text with no JSON', () => {
    expect(parseJsonFromLLMResponse('This is just text with no JSON')).toBeNull();
  });

  it('returns null for JSON array (not object)', () => {
    expect(parseJsonFromLLMResponse('[1, 2, 3]')).toBeNull();
  });

  it('returns null for JSON primitive', () => {
    expect(parseJsonFromLLMResponse('"just a string"')).toBeNull();
    expect(parseJsonFromLLMResponse('42')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(parseJsonFromLLMResponse('')).toBeNull();
  });

  it('returns null for null JSON literal', () => {
    expect(parseJsonFromLLMResponse('null')).toBeNull();
  });

  it('handles nested objects', () => {
    const input = '{"params": {"faceWidth": 0.5}, "meta": "test"}';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ params: { faceWidth: 0.5 }, meta: 'test' });
  });

  it('handles JSON with trailing/leading whitespace', () => {
    const input = '   \n  {"faceWidth": 0.5}  \n  ';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ faceWidth: 0.5 });
  });

  it('handles code fence with extra whitespace', () => {
    const input = '```json  \n  {"key": "value"}  \n  ```';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ key: 'value' });
  });

  it('falls back to full text when code fence contains invalid JSON', () => {
    // Code fence has broken JSON, but valid object exists after the fence.
    // LLMs often emit a broken attempt then a corrected version.
    const input = '```json\n{invalid json\n```\nActual: {"faceWidth": 0.5}';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ faceWidth: 0.5 });
  });

  it('handles trailing noise brace after valid JSON', () => {
    const input = 'Result: {"faceWidth":0.5} extra }';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ faceWidth: 0.5 });
  });

  it('handles broken fence + trailing noise brace in full text', () => {
    const input = '```json\n{bad\n```\nFixed: {"faceWidth":0.5} extra }';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ faceWidth: 0.5 });
  });

  it('returns the first valid JSON object when multiple exist in text', () => {
    // Design choice: first-match wins. The prompt instructs the LLM to respond
    // with ONLY a JSON object, so multiple objects is an edge case. Taking the
    // first is safer than the last — avoids picking up metadata/echo objects.
    const input = 'Draft: {"draft":true}\nFinal: {"final":true}';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ draft: true });
  });

  it('returns null when both fence and full text contain no valid JSON', () => {
    const input = '```json\n{broken\n```\nAlso broken {nope';
    expect(parseJsonFromLLMResponse(input)).toBeNull();
  });

  it('prefers code fence over surrounding text', () => {
    const input = 'Ignore {"bad": true} ```json\n{"good": true}\n``` also ignore {"bad2": true}';
    const result = parseJsonFromLLMResponse(input);
    expect(result).toEqual({ good: true });
  });
});
