import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';

const REPO_ROOT = path.resolve(__dirname, '../../../../../../..');

const FORBIDDEN_RUNTIME_CONTENT = [
  { label: 'legacy Skill root', pattern: /\.neko\/skills/i },
  { label: 'root Skill manifest', pattern: /manifest\.json/i },
  { label: 'Neko overlay schema tutorial', pattern: /agents\/neko\.yaml|schema_version\s*:/i },
  { label: 'VS Code Webview protocol', pattern: /asWebviewUri|postMessage\s*\(/i },
  {
    label: 'native Agent tool invocation tutorial',
    pattern: /\b(?:CreateSkill|ActivateSkill|DeactivateSkill|GetContext)\s*\([^)]/i,
  },
  { label: 'runtime tool-definition schema', pattern: /\btoolDefinitions\b|\btools-ref\b/i },
] as const;
const FORBIDDEN_TOOL_TUTORIAL_CONTENT = [
  { label: 'document tool name', pattern: /\bReadDocument\b/i },
  { label: 'image inspection tool name', pattern: /\bReadImage\b/i },
  { label: 'image generation tool name', pattern: /\bGenerateImage\b/i },
  { label: 'video generation tool name', pattern: /\bGenerateVideo\b/i },
  { label: 'quality tool name', pattern: /\bQuality(?:Repair)?Check\b/i },
  { label: 'timeline query tool name', pattern: /\bGetTimelineInfo\b/i },
  { label: 'timeline mutation tool name', pattern: /\bAddTimelineElement\b/i },
  { label: 'task protocol tool name', pattern: /\bTaskWrite\b/i },
] as const;
const FORBIDDEN_PARAMETER_HEADINGS = new Set([
  'Parameters',
  'Key Params',
  'Default Parameters',
  '工具参数',
]);

describe('Skill prompt content boundary', () => {
  it('keeps runtime protocols and Host schema details out of repository Skill content', () => {
    const violations: string[] = [];

    for (const file of listSkillFiles(REPO_ROOT)) {
      const content = fs.readFileSync(file, 'utf8');
      const body = stripFrontmatter(content);
      for (const rule of FORBIDDEN_RUNTIME_CONTENT) {
        if (rule.pattern.test(content)) {
          violations.push(`${path.relative(REPO_ROOT, file)}: ${rule.label}`);
        }
      }
      for (const rule of FORBIDDEN_TOOL_TUTORIAL_CONTENT) {
        if (rule.pattern.test(body)) {
          violations.push(`${path.relative(REPO_ROOT, file)}: ${rule.label}`);
        }
      }
      for (const line of body.split(/\r?\n/u)) {
        const heading = line
          .replace(/^#{1,6}\s+/u, '')
          .replace(/:$/u, '')
          .trim();
        if (FORBIDDEN_PARAMETER_HEADINGS.has(heading)) {
          violations.push(`${path.relative(REPO_ROOT, file)}: parameter tutorial heading`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

function stripFrontmatter(content: string): string {
  return content.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n/, '');
}

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
