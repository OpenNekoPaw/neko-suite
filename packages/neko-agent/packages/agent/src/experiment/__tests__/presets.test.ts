import { describe, expect, it } from 'vitest';
import {
  createGroupAblationSuite,
  createParameterAblationSuite,
  createStandardAblationSuite,
  ALWAYS_ONLY_TOOLS,
  ASK_PERMISSION_MODE,
  NO_AUTO_MEMORY_EXTRACTION,
  NO_COMPACT_LOGGING,
  NO_MEMORY_RECALL,
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

  it('group suite retains baseline plus 4 grouped variants', () => {
    expect(createGroupAblationSuite()).toHaveLength(5);
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
