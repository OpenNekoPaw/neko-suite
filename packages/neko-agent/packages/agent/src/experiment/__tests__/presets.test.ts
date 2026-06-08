import { describe, expect, it } from 'vitest';
import {
  createGroupAblationSuite,
  createParameterAblationSuite,
  createStandardAblationSuite,
  ALWAYS_ONLY_TOOLS,
  ASK_PERMISSION_MODE,
  HIDE_LOCKED_NARRATIVE_CHOICES,
  NO_AUTO_MEMORY_EXTRACTION,
  NO_COMPACT_LOGGING,
  NO_MEMORY_RECALL,
  NO_NARRATIVE_AUTO_EXPRESSION,
  NO_NARRATIVE_PREVIEW,
  NO_NARRATIVE_PREVIEW_AUTO_SYNC,
  NO_NARRATIVE_PREVIEW_STACK,
  NO_NARRATIVE_TYPEWRITER,
  NARRATIVE_LIVE2D_PERFORMANCE,
  MINIMAL,
} from '../presets';

describe('experiment presets', () => {
  it('standard suite includes memory persistence toggles and keeps session-memory removed', () => {
    const names = createStandardAblationSuite().map((variant) => variant.name);

    expect(names).toContain(NO_AUTO_MEMORY_EXTRACTION.name);
    expect(names).toContain(NO_COMPACT_LOGGING.name);
    expect(names).toContain(NO_MEMORY_RECALL.name);
    expect(names).not.toContain('no-journal-as-ssot');
    expect(names).not.toContain('no-session-memory');
  });

  it('minimal preset disables the full persistence add-on stack', () => {
    expect(MINIMAL.toggles.compactLogging).toBe(false);
    expect(MINIMAL.toggles.autoMemoryExtraction).toBe(false);
    expect(MINIMAL.toggles.memoryRecall).toBe(false);
  });

  it('standard suite registers Canvas narrative Preview toggles', () => {
    const names = createStandardAblationSuite().map((variant) => variant.name);

    expect(names).toContain(NO_NARRATIVE_PREVIEW.name);
    expect(names).toContain(NO_NARRATIVE_TYPEWRITER.name);
    expect(names).toContain(NO_NARRATIVE_AUTO_EXPRESSION.name);
    expect(names).toContain(HIDE_LOCKED_NARRATIVE_CHOICES.name);
    expect(names).toContain(NO_NARRATIVE_PREVIEW_AUTO_SYNC.name);
    expect(names).toContain(NARRATIVE_LIVE2D_PERFORMANCE.name);
  });

  it('group suite retains baseline plus 5 grouped variants', () => {
    expect(createGroupAblationSuite()).toHaveLength(6);
    expect(createGroupAblationSuite().map((variant) => variant.name)).toContain(
      NO_NARRATIVE_PREVIEW_STACK.name,
    );
  });

  it('parameter suite keeps policy and budget overrides separate from standard suite', () => {
    const names = createParameterAblationSuite().map((variant) => variant.name);

    expect(names).toContain(ALWAYS_ONLY_TOOLS.name);
    expect(names).toContain(ASK_PERMISSION_MODE.name);
    expect(names).toContain('single-iteration');
    expect(createStandardAblationSuite().map((variant) => variant.name)).not.toContain(
      ALWAYS_ONLY_TOOLS.name,
    );
  });
});
