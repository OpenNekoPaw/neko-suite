import { describe, expect, it } from 'vitest';
import {
  createStandardAblationSuite,
  NO_AUTO_MEMORY_EXTRACTION,
  NO_COMPACT_LOGGING,
  NO_MEMORY_RECALL,
} from '../index';

describe('experiment public exports', () => {
  it('re-exports persistence presets from the experiment entrypoint', () => {
    const names = createStandardAblationSuite().map((variant) => variant.name);

    expect(names).toContain(NO_COMPACT_LOGGING.name);
    expect(names).toContain(NO_AUTO_MEMORY_EXTRACTION.name);
    expect(names).toContain(NO_MEMORY_RECALL.name);
  });
});
