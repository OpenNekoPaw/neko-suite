import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');

describe('external research skill boundary', () => {
  it('keeps provider-specific WebSearch/WebFetch protocol tutorials out of repo skill content', () => {
    const skillFiles = listSkillFiles(REPO_ROOT);
    const violations: string[] = [];

    for (const file of skillFiles) {
      const content = fs.readFileSync(file, 'utf8');
      if (/WebSearch\s*\([^)]*(query|maxResults|allowedDomains|blockedDomains)/i.test(content)) {
        violations.push(file);
      }
      if (/WebFetch\s*\([^)]*(url|maxContentTokens|allowedDomains|blockedDomains)/i.test(content)) {
        violations.push(file);
      }
      if (
        /auto(?:matically)?\s+save[\s\S]{0,80}(external|web|source|research)[\s\S]{0,80}(memory|worldbuilding|character|canonical)/i.test(
          content,
        )
      ) {
        violations.push(file);
      }
    }

    expect(violations).toEqual([]);
  });
});

function listSkillFiles(root: string): string[] {
  return ['.codex/skills', '.agents/skills'].flatMap((relative) => {
    const dir = path.join(root, relative);
    if (!fs.existsSync(dir)) return [];
    return walk(dir).filter((file) => path.basename(file) === 'SKILL.md');
  });
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}
