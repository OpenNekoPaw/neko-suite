import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import ts from 'typescript';

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
const FORBIDDEN_EVALUATION_TUTORIAL_CONTENT = [
  {
    label: 'Evaluation runner command',
    pattern: /\b(?:protocol-smoke|ci-run|all-suite-dry-run)\.mjs\b|\bpnpm\s+test:agent:eval\b/i,
  },
  {
    label: 'Evaluation CLI option tutorial',
    pattern: /--(?:manifest|suite|case|report-root|run-id)\b/i,
  },
  {
    label: 'debug automation CLI protocol',
    pattern: /\bdebug\s+automation\s+--stdio\b/i,
  },
  {
    label: 'debug automation method sequence',
    pattern:
      /\b(?:session\.(?:create|facts|dispose|waitForIdle|resume)|message\.(?:submit|cancel)|terminal\.resize)\b/i,
  },
  {
    label: 'Evaluation schema literal',
    pattern: /\bneko\.agent-eval\.[a-z0-9.-]+\.v\d+\b/i,
  },
  {
    label: 'Evaluation JSON field tutorial',
    pattern:
      /["'](?:suiteId|caseId|runtimeProfileId|modelProfileIds|fixtureRefs|artifactChecks|evidenceContract)["']\s*:/i,
  },
  {
    label: 'Optimization implementation module tutorial',
    pattern:
      /\b(?:optimization-contracts|candidate-artifacts|isolated-evaluator|candidate-decision)\.mjs\b|scripts\/agent-eval\/optimization\//i,
  },
  {
    label: 'Optimization execution command tutorial',
    pattern: /\bgit\s+(?:worktree|apply)\b|\bNEKO_AGENT_EVAL_JUDGE_[A-Z_]+\b/i,
  },
  {
    label: 'Optimization schema field tutorial',
    pattern:
      /["'](?:candidateFingerprint|patchFingerprint|selectionDigest|mappingRefs|requiredMatrix)["']\s*:/i,
  },
] as const;

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

  it('keeps concrete Evaluation runner, protocol, and schema tutorials out of Skill prompts', () => {
    const violations: string[] = [];

    for (const prompt of listSkillPromptDocuments(REPO_ROOT)) {
      for (const rule of FORBIDDEN_EVALUATION_TUTORIAL_CONTENT) {
        if (rule.pattern.test(prompt.content)) {
          violations.push(`${prompt.label}: ${rule.label}`);
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

function listSkillPromptDocuments(
  root: string,
): ReadonlyArray<{ readonly label: string; readonly content: string }> {
  const markdownPrompts = listSkillFiles(root).map((file) => ({
    label: path.relative(root, file),
    content: stripFrontmatter(fs.readFileSync(file, 'utf8')),
  }));
  return [...markdownPrompts, ...listBuiltinSkillPromptContent(root)];
}

function listBuiltinSkillPromptContent(
  root: string,
): ReadonlyArray<{ readonly label: string; readonly content: string }> {
  const builtinsRoot = path.join(root, 'packages/neko-skills/src/builtins');
  if (!fs.existsSync(builtinsRoot)) return [];

  return walk(builtinsRoot)
    .filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.endsWith('.test.ts') &&
        !file.includes(`${path.sep}__tests__${path.sep}`),
    )
    .flatMap((file) => extractBuiltinPromptContent(root, file));
}

function extractBuiltinPromptContent(
  root: string,
  file: string,
): ReadonlyArray<{ readonly label: string; readonly content: string }> {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const promptLiterals: Array<{ readonly label: string; readonly content: string }> = [];
  const capturedPositions = new Set<number>();

  const collectLiterals = (node: ts.Node): void => {
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
      if (capturedPositions.has(node.pos)) return;
      capturedPositions.add(node.pos);
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      promptLiterals.push({
        label: `${path.relative(root, file)}:${line + 1}`,
        content: node.text,
      });
      return;
    }
    ts.forEachChild(node, collectLiterals);
  };

  const visit = (node: ts.Node): void => {
    if (
      ts.isVariableDeclaration(node) &&
      ts.isIdentifier(node.name) &&
      /content$/iu.test(node.name.text) &&
      node.initializer
    ) {
      collectLiterals(node.initializer);
    }
    if (ts.isPropertyAssignment(node) && getPropertyName(node.name) === 'content') {
      collectLiterals(node.initializer);
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return promptLiterals;
}

function getPropertyName(name: ts.PropertyName): string | undefined {
  if (ts.isIdentifier(name) || ts.isStringLiteral(name)) return name.text;
  return undefined;
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(fullPath) : [fullPath];
  });
}
