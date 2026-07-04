import { describe, expect, it, vi } from 'vitest';
import type { IProjectMemoryManager, KeyFact } from '@neko/shared';
import { ProjectMemoryRouter } from '../project-memory-router';

function createMockProjectMemory(initialContent: string | null = null): IProjectMemoryManager {
  let content = initialContent;

  return {
    load: vi.fn().mockResolvedValue(undefined),
    getContent: vi.fn(() => content),
    upsertEntry: vi.fn(async (key: string, body: string) => {
      const sections = parseSections(content);
      const next = new Map(sections.map((section) => [section.key, section.body]));
      next.set(key, body);
      content = Array.from(next.entries())
        .map(([sectionKey, sectionBody]) =>
          sectionBody.trim().length > 0
            ? `## ${sectionKey}\n${sectionBody.trimEnd()}`
            : `## ${sectionKey}`,
        )
        .join('\n\n');
      if (content) {
        content += '\n';
      }
    }),
    removeEntry: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
    off: vi.fn(),
  };
}

function parseSections(content: string | null): Array<{ key: string; body: string }> {
  if (!content) return [];

  const lines = content.split('\n');
  const sections: Array<{ key: string; body: string }> = [];
  let currentKey: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentKey !== null) {
        sections.push({ key: currentKey, body: currentLines.join('\n') });
      }
      currentKey = line.slice(3).trim();
      currentLines = [];
    } else if (currentKey !== null) {
      currentLines.push(line);
    }
  }

  if (currentKey !== null) {
    sections.push({ key: currentKey, body: currentLines.join('\n') });
  }

  return sections;
}

describe('ProjectMemoryRouter', () => {
  it('routes facts into fixed project-memory sections', async () => {
    const projectMemory = createMockProjectMemory();
    const router = new ProjectMemoryRouter(projectMemory);

    const facts: KeyFact[] = [
      {
        content: '用户偏好中文说明',
        category: 'preference',
        confidence: 0.8,
        timestamp: 1,
      },
      {
        content: '决定移除 global-memory',
        category: 'decision',
        confidence: 0.7,
        timestamp: 2,
      },
      {
        content: '当前仓库是 monorepo',
        category: 'context',
        confidence: 0.6,
        timestamp: 3,
      },
      {
        content: 'Tool result: docs updated',
        category: 'action',
        confidence: 0.6,
        timestamp: 4,
      },
    ];

    const result = await router.writeFacts(facts);
    const content = projectMemory.getContent();

    expect(result.writtenFacts).toHaveLength(4);
    expect(content).toContain('## User Preferences');
    expect(content).toContain('## Recent Decisions');
    expect(content).toContain('## Project Context');
    expect(content).toContain('## Recent Actions');
    expect(content).toContain('- 用户偏好中文说明');
    expect(content).toContain('- 决定移除 global-memory');
  });

  it('deduplicates against existing bullets and preserves manual text', async () => {
    const projectMemory = createMockProjectMemory(
      '## User Preferences\n团队约定：优先中文。\n- 用户偏好中文说明\n',
    );
    const router = new ProjectMemoryRouter(projectMemory);

    const result = await router.writeFacts([
      {
        content: '用户偏好中文说明',
        category: 'preference',
        confidence: 0.8,
        timestamp: 1,
      },
      {
        content: '避免引入 global-memory',
        category: 'preference',
        confidence: 0.8,
        timestamp: 2,
      },
    ]);

    const content = projectMemory.getContent();

    expect(result.writtenFacts).toHaveLength(1);
    expect(result.dedupedFacts).toHaveLength(1);
    expect(content).toContain('团队约定：优先中文。');
    expect(content).toContain('- 用户偏好中文说明');
    expect(content).toContain('- 避免引入 global-memory');
  });

  it('deduplicates within the same batch', async () => {
    const projectMemory = createMockProjectMemory();
    const router = new ProjectMemoryRouter(projectMemory);

    const result = await router.writeFacts([
      {
        content: '决定统一走 journal projection',
        category: 'decision',
        confidence: 0.7,
        timestamp: 1,
      },
      {
        content: '- 决定统一走 journal projection',
        category: 'decision',
        confidence: 0.7,
        timestamp: 2,
      },
    ]);

    expect(result.writtenFacts).toHaveLength(1);
    expect(result.dedupedFacts).toHaveLength(1);
    expect(projectMemory.getContent()).toContain('- 决定统一走 journal projection');
  });

  it('deduplicates simple English paraphrases with reordered preference wording', async () => {
    const projectMemory = createMockProjectMemory(
      '## User Preferences\n- user prefers Python for automation\n',
    );
    const router = new ProjectMemoryRouter(projectMemory);

    const result = await router.writeFacts([
      {
        content: "Python is user's preference for automation",
        category: 'preference',
        confidence: 0.8,
        timestamp: 1,
      },
    ]);

    expect(result.writtenFacts).toHaveLength(0);
    expect(result.dedupedFacts).toHaveLength(1);
    expect(projectMemory.getContent()).toContain('- user prefers Python for automation');
  });
});
