/**
 * Tests for the four content-projection Modules introduced in PR2:
 * MemoryProjectModule, MemoryGlobalModule, MemoryRecallModule, and
 * CreativeVersionLogModule.
 *
 * All four share the same shape — an externally-injected content string that
 * projects into a single prompt section — so their tests are parameterised.
 * Additional module-specific assertions (layer, priority, sectionId, heading
 * prefix) are covered per-instance at the bottom.
 */
import { describe, it, expect } from 'vitest';
import { MemoryProjectModule } from '../modules/memory/memory-project-module';
import { MemoryGlobalModule } from '../modules/memory/memory-global-module';
import { MemoryRecallModule } from '../modules/memory/memory-recall-module';
import { CreativeVersionLogModule } from '../modules/ephemeral/creative-version-log-module';

type ProjectionSetter = (content: string | null) => void;

interface ModuleSpec {
  name: string;
  make: () => {
    mod: {
      manifest: { id: string; layers: readonly string[]; priority: number };
      render: () => Promise<readonly { sectionId: string; content: string }[] | null>;
    };
    setContent: ProjectionSetter;
  };
  expectedManifestId: string;
  expectedLayer: string;
  expectedPriority: number;
  expectedSectionId: string;
  headingPrefix: string | null; // null = verbatim (no heading wrapping)
}

const SPECS: ModuleSpec[] = [
  {
    name: 'MemoryProjectModule',
    make: () => {
      const mod = new MemoryProjectModule();
      return { mod, setContent: (c) => mod.setContent(c) };
    },
    expectedManifestId: 'memory.project',
    expectedLayer: 'environment',
    expectedPriority: 60,
    expectedSectionId: 'memory:project',
    headingPrefix: '## Project Memory\n\n',
  },
  {
    name: 'MemoryGlobalModule',
    make: () => {
      const mod = new MemoryGlobalModule();
      return { mod, setContent: (c) => mod.setContent(c) };
    },
    expectedManifestId: 'memory.global',
    expectedLayer: 'environment',
    expectedPriority: 50,
    expectedSectionId: 'memory:global',
    headingPrefix: '## Global Memory\n\n',
  },
  {
    name: 'MemoryRecallModule',
    make: () => {
      const mod = new MemoryRecallModule();
      return { mod, setContent: (c) => mod.setContent(c) };
    },
    expectedManifestId: 'memory.recall',
    expectedLayer: 'ephemeral',
    expectedPriority: 40,
    expectedSectionId: 'memory:recall',
    headingPrefix: '## Recalled Memories\n\n',
  },
  {
    name: 'CreativeVersionLogModule',
    make: () => {
      const mod = new CreativeVersionLogModule();
      return { mod, setContent: (c) => mod.setSummary(c) };
    },
    expectedManifestId: 'creative.version-log',
    expectedLayer: 'ephemeral',
    expectedPriority: 30,
    expectedSectionId: 'creative-version-log',
    headingPrefix: null,
  },
];

for (const spec of SPECS) {
  describe(spec.name, () => {
    it('returns null when no content has been set', async () => {
      const { mod } = spec.make();
      expect(await mod.render()).toBeNull();
    });

    it('treats whitespace-only content as empty (null)', async () => {
      const { mod, setContent } = spec.make();
      setContent('   \n  \t  ');
      expect(await mod.render()).toBeNull();
    });

    it('projects non-empty content into a single section', async () => {
      const { mod, setContent } = spec.make();
      setContent('CONTENT_BODY');
      const result = await mod.render();
      expect(result).not.toBeNull();
      expect(result).toHaveLength(1);
      const section = result![0]!;
      expect(section.sectionId).toBe(spec.expectedSectionId);
      const expectedContent = spec.headingPrefix
        ? spec.headingPrefix + 'CONTENT_BODY'
        : 'CONTENT_BODY';
      expect(section.content).toBe(expectedContent);
    });

    it('setContent(null) clears prior content', async () => {
      const { mod, setContent } = spec.make();
      setContent('BODY');
      expect(await mod.render()).not.toBeNull();
      setContent(null);
      expect(await mod.render()).toBeNull();
    });

    it('manifest declares expected id, layer, and priority', () => {
      const { mod } = spec.make();
      expect(mod.manifest.id).toBe(spec.expectedManifestId);
      expect(mod.manifest.layers).toEqual([spec.expectedLayer]);
      expect(mod.manifest.priority).toBe(spec.expectedPriority);
    });
  });
}

// Module-specific regression: the content-getter shape differs per module
// (getContent vs getSummary), which some callers depend on.
describe('MemoryProjectModule getContent', () => {
  it('reflects setContent state', () => {
    const mod = new MemoryProjectModule();
    expect(mod.getContent()).toBeNull();
    mod.setContent('X');
    expect(mod.getContent()).toBe('X');
    mod.setContent(null);
    expect(mod.getContent()).toBeNull();
  });
});

describe('CreativeVersionLogModule getSummary', () => {
  it('reflects setSummary state', () => {
    const mod = new CreativeVersionLogModule();
    expect(mod.getSummary()).toBeNull();
    mod.setSummary('v1');
    expect(mod.getSummary()).toBe('v1');
  });
});
