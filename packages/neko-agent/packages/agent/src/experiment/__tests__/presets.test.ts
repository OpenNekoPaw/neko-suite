import { describe, expect, it } from 'vitest';
import {
  createGroupAblationSuite,
  createStandardAblationSuite,
  NO_AUTO_MEMORY_EXTRACTION,
  NO_COMPACT_LOGGING,
  NO_JOURNAL_AS_SSOT,
  NO_MEMORY_RECALL,
  MINIMAL,
} from '../presets';

describe('experiment presets', () => {
  it('standard suite includes persistence rollback toggles and keeps session-memory removed', () => {
    const names = createStandardAblationSuite().map((variant) => variant.name);

    expect(names).toContain(NO_AUTO_MEMORY_EXTRACTION.name);
    expect(names).toContain(NO_JOURNAL_AS_SSOT.name);
    expect(names).toContain(NO_COMPACT_LOGGING.name);
    expect(names).toContain(NO_MEMORY_RECALL.name);
    expect(names).not.toContain('no-session-memory');
  });

  it('minimal preset disables the full persistence add-on stack', () => {
    expect(MINIMAL.toggles.journalAsSSOT).toBe(false);
    expect(MINIMAL.toggles.compactLogging).toBe(false);
    expect(MINIMAL.toggles.autoMemoryExtraction).toBe(false);
    expect(MINIMAL.toggles.memoryRecall).toBe(false);
  });

  it('group suite retains baseline plus 4 grouped variants', () => {
    expect(createGroupAblationSuite()).toHaveLength(5);
  });
});
