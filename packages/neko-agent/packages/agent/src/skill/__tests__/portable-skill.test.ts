import { describe, expect, it } from 'vitest';
import {
  createPortableSkillValidationResult,
  parsePortableSkillMarkdown,
  serializePortableSkillMarkdown,
  validatePortableSkillDefinition,
} from '../portable-skill';
import {
  hasNekoSkillOverlayContent,
  parseNekoSkillOverlay,
  serializeNekoSkillOverlay,
} from '../neko-skill-overlay';
import { validateSkillResources } from '../skill-package-path';

describe('portable SKILL.md', () => {
  it('parses and round-trips the portable optional fields', () => {
    const parsed = parsePortableSkillMarkdown(
      `---
name: character-index
description: Build a character index when recurring-character evidence is required.
license: Apache-2.0
compatibility: Requires an EPUB reader.
metadata:
  neko.domain: story
  neko.tags: 'epub,character'
allowed-tools: ReadDocument Search
---

# Character Index

Use chapter evidence.
`,
      { directoryName: 'character-index' },
    );

    expect(parsed.validation).toEqual({ valid: true, diagnostics: [] });
    expect(parsed.definition).toEqual({
      name: 'character-index',
      description: 'Build a character index when recurring-character evidence is required.',
      body: '# Character Index\n\nUse chapter evidence.',
      license: 'Apache-2.0',
      compatibility: 'Requires an EPUB reader.',
      metadata: {
        'neko.domain': 'story',
        'neko.tags': 'epub,character',
      },
      allowedTools: ['ReadDocument', 'Search'],
    });

    const serialized = serializePortableSkillMarkdown(parsed.definition!);
    expect(
      parsePortableSkillMarkdown(serialized, { directoryName: 'character-index' }).definition,
    ).toEqual(parsed.definition);
  });

  it.each(['-bad', 'bad-', 'bad--name', 'UPPER', 'a'.repeat(65)])(
    'rejects invalid portable name %s',
    (name) => {
      const result = validatePortableSkillDefinition({
        name,
        description: 'Use this Skill for a focused task.',
        body: 'Instructions.',
      });
      expect(result.valid).toBe(false);
      expect(result.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
        'skill-name-invalid',
      );
    },
  );

  it('rejects directory/frontmatter mismatch and non-string metadata', () => {
    const parsed = parsePortableSkillMarkdown(
      `---
name: expected-name
description: Use this Skill for a focused task.
metadata:
  count: 2
---
Body
`,
      { directoryName: 'different-name' },
    );

    expect(parsed.definition).toBeUndefined();
    expect(parsed.validation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['skill-metadata-value-type']),
    );
  });

  it('keeps first-party quality separate from portable validity and compatibility', () => {
    const definition = {
      name: 'minimal-skill',
      description: 'Short description.',
      body: '',
    } as const;
    const userValidation = createPortableSkillValidationResult(definition);
    const firstPartyValidation = createPortableSkillValidationResult(definition, {
      firstParty: true,
    });

    expect(userValidation.portable.valid).toBe(true);
    expect(userValidation.quality.valid).toBe(true);
    expect(userValidation.compatibility.state).toBe('unknown');
    expect(firstPartyValidation.portable.valid).toBe(true);
    expect(firstPartyValidation.quality.valid).toBe(false);
    expect(
      firstPartyValidation.quality.diagnostics.every((diagnostic) => diagnostic.area === 'quality'),
    ).toBe(true);
  });
});

describe('agents/neko.yaml', () => {
  it('parses and round-trips the versioned overlay', () => {
    const parsed = parseNekoSkillOverlay(`schema_version: 1
interface:
  display_name: EPUB Character Index
  short_description: Build structured character indexes
  icon_small: ./assets/character-index.svg
  default_prompt: Use $epub-character-index to build an index.
dependencies:
  capabilities:
    - id: story.character-index
      requirement: required
  profiles:
    - id: studio.character-index
      kind: artifact
      relationship: produces
      version_range: '>=1'
relationships:
  skills:
    - name: story-planning
      relationship: complements
`);

    expect(parsed.validation).toEqual({ valid: true, diagnostics: [] });
    expect(parsed.overlay).toBeDefined();
    const serialized = serializeNekoSkillOverlay(parsed.overlay!);
    expect(serialized).not.toBeNull();
    expect(parseNekoSkillOverlay(serialized!).overlay).toEqual(parsed.overlay);
  });

  it('rejects unknown schema versions and Host-owned fields', () => {
    const parsed = parseNekoSkillOverlay(`schema_version: 2
enabled: true
`);

    expect(parsed.overlay).toBeUndefined();
    expect(parsed.validation.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['neko-overlay-schema-unsupported', 'neko-overlay-unknown-field']),
    );
  });

  it('does not serialize an empty overlay', () => {
    const overlay = { schemaVersion: 1 } as const;
    expect(hasNekoSkillOverlayContent(overlay)).toBe(false);
    expect(serializeNekoSkillOverlay(overlay)).toBeNull();
  });

  it('rejects an icon path outside the Skill directory', () => {
    const parsed = parseNekoSkillOverlay(`schema_version: 1
interface:
  icon_small: ../../outside.svg
`);
    expect(parsed.validation.valid).toBe(false);
    expect(parsed.validation.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      'neko-overlay-icon-path-invalid',
    );
  });
});

describe('Skill resource paths', () => {
  it('rejects traversal, reserved collisions, duplicates, and invalid base64', () => {
    const diagnostics = validateSkillResources([
      { path: '../escape.txt', encoding: 'utf8', content: 'x' },
      { path: 'SKILL.md', encoding: 'utf8', content: 'x' },
      { path: 'assets/icon.svg', encoding: 'utf8', content: 'a' },
      { path: 'ASSETS/icon.svg', encoding: 'utf8', content: 'b' },
      { path: 'references', encoding: 'utf8', content: 'file' },
      { path: 'references/checklist.md', encoding: 'utf8', content: 'child' },
      { path: 'assets/image.png', encoding: 'base64', content: 'not base64' },
    ]);

    expect(diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining([
        'skill-resource-path-traversal',
        'skill-resource-path-reserved',
        'skill-resource-path-duplicate',
        'skill-resource-path-conflict',
        'skill-resource-base64-invalid',
      ]),
    );
  });
});
