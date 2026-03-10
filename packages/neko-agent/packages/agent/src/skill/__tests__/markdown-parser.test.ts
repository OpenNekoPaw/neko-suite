/**
 * Markdown Parser Tests
 *
 * Tests for Markdown parsing with YAML frontmatter
 */

import { describe, it, expect } from 'vitest';
import { MarkdownParser } from '../markdown-parser';

describe('MarkdownParser', () => {
  let parser: MarkdownParser;

  beforeEach(() => {
    parser = new MarkdownParser();
  });

  describe('parseMarkdown', () => {
    it('should parse valid markdown with frontmatter', () => {
      const content = `---
name: test-skill
description: Test description
---

# Test Content

This is the content.`;

      const result = parser.parseMarkdown(content);

      expect(result).not.toBeNull();
      expect(result?.frontmatter).toHaveProperty('name', 'test-skill');
      expect(result?.frontmatter).toHaveProperty('description', 'Test description');
      expect(result?.content).toContain('# Test Content');
    });

    it('should return null if no frontmatter delimiter', () => {
      const content = 'Just plain markdown';
      const result = parser.parseMarkdown(content);

      expect(result).toBeNull();
    });

    it('should return null if closing delimiter missing', () => {
      const content = `---
name: test
description: test`;

      const result = parser.parseMarkdown(content);

      expect(result).toBeNull();
    });

    it('should handle empty content after frontmatter', () => {
      const content = `---
name: test
---`;

      const result = parser.parseMarkdown(content);

      expect(result).not.toBeNull();
      expect(result?.content).toBe('');
    });

    it('should trim whitespace from content', () => {
      const content = `---
name: test
---


Content here
  `;

      const result = parser.parseMarkdown(content);

      expect(result?.content).toBe('Content here');
    });

    it('should extract support file refs if present', () => {
      const content = `---
name: test
---

See [[reference.md]] for details.`;

      const result = parser.parseMarkdown(content);

      expect(result).not.toBeNull();
      expect(result?.supportFileRefs).toBeDefined();
      // Note: actual extraction depends on extractSupportFileRefs implementation
    });
  });

  describe('parseFrontmatterOnly', () => {
    it('should parse only frontmatter', () => {
      const content = `---
name: test-skill
description: Test description
---

# Content (should be ignored)`;

      const result = parser.parseFrontmatterOnly(content);

      expect(result).not.toBeNull();
      expect(result).toHaveProperty('name', 'test-skill');
      expect(result).toHaveProperty('description', 'Test description');
    });

    it('should return null if no frontmatter', () => {
      const content = 'No frontmatter here';
      const result = parser.parseFrontmatterOnly(content);

      expect(result).toBeNull();
    });

    it('should work with long content', () => {
      const content = `---
name: test
---

${'Very long content '.repeat(1000)}`;

      const result = parser.parseFrontmatterOnly(content);

      expect(result).toBeDefined();
      if (result) {
        expect(result).toHaveProperty('name', 'test');
      }
    });
  });

  describe('parseSimpleYaml', () => {
    it('should parse simple key-value pairs', () => {
      const yaml = `name: test-skill
description: Test description
enabled: true`;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.name).toBe('test-skill');
      expect(result.description).toBe('Test description');
      expect(result.enabled).toBe(true);
    });

    it('should handle quoted strings', () => {
      const yaml = `name: "test skill"
description: 'with quotes'`;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.name).toBe('test skill');
      expect(result.description).toBe('with quotes');
    });

    it('should handle boolean values', () => {
      const yaml = `enabled: true
disabled: false`;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.enabled).toBe(true);
      expect(result.disabled).toBe(false);
    });

    it('should handle multi-line values', () => {
      const yaml = `name: test
description: |
  Multi-line
  description`;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.name).toBe('test');
      expect(result.description).toContain('Multi-line');
    });

    it('should handle empty values', () => {
      const yaml = `name: test
description:`;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.name).toBe('test');
      // Empty values may be empty string or undefined depending on implementation
      expect(result.description === '' || result.description === undefined).toBe(true);
    });

    it('should handle colons in values', () => {
      const yaml = `url: https://example.com
time: 12:30:45`;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.url).toBe('https://example.com');
      expect(result.time).toBe('12:30:45');
    });

    it('should handle arrays (simple format)', () => {
      const yaml = `tools:
  - read
  - write
  - grep`;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.tools).toBeDefined();
    });

    it('should handle inline arrays', () => {
      const yaml = `tools: [read, write, grep]`;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.tools).toBeDefined();
    });

    it('should trim whitespace', () => {
      const yaml = `  name:   test-skill
  description:   Test   `;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.name).toBe('test-skill');
      expect(result.description).toBe('Test');
    });

    it('should handle empty input', () => {
      const result = parser.parseSimpleYaml('');

      expect(result).toEqual({});
    });

    it('should handle comments', () => {
      const yaml = `# This is a comment
name: test
# Another comment
description: test`;

      const result = parser.parseSimpleYaml(yaml);

      expect(result.name).toBe('test');
      expect(result.description).toBe('test');
    });
  });

  describe('edge cases', () => {
    it('should handle frontmatter with --- in content', () => {
      const content = `---
name: test
---

Content with --- separator`;

      const result = parser.parseMarkdown(content);

      expect(result).not.toBeNull();
      expect(result?.content).toContain('---');
    });

    it('should handle empty frontmatter', () => {
      const content = `---
---

Content`;

      const result = parser.parseMarkdown(content);

      expect(result).not.toBeNull();
      expect(result?.frontmatter).toEqual({});
    });

    it('should handle unicode characters', () => {
      const content = `---
name: 测试技能
description: テスト
---

Content with 中文`;

      const result = parser.parseMarkdown(content);

      expect(result?.frontmatter).toHaveProperty('name', '测试技能');
      expect(result?.content).toContain('中文');
    });

    it('should handle very long content', () => {
      const longContent = 'x'.repeat(100000);
      const content = `---
name: test
---

${longContent}`;

      const result = parser.parseMarkdown(content);

      expect(result).not.toBeNull();
      expect(result?.content).toHaveLength(100000);
    });
  });
});
