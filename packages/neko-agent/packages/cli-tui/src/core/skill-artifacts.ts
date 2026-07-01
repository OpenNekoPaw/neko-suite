import * as path from 'node:path';
import {
  createCommandBackedSkill,
  type Skill,
  type SkillLoader,
  type SkillLoadResult,
} from '@neko/agent';

export interface CodexSkillArtifactFs {
  readonly readdir: (
    path: string,
    options: { readonly withFileTypes: true },
  ) => Promise<readonly CodexSkillArtifactDirent[]>;
  readonly readFile: (path: string, encoding: 'utf8') => Promise<string>;
}

export interface CodexSkillArtifactDirent {
  readonly name: string;
  isDirectory(): boolean;
}

export interface CodexSkillArtifactPath {
  readonly join: (...parts: string[]) => string;
}

/**
 * Load workspace skill artifacts from sibling `.neko/skills` + `.neko/commands`
 * directories and project them onto the unified Skill runtime surface.
 */
export async function loadSkillArtifactsAsSkills(
  loader: Pick<SkillLoader, 'loadFromDirectory'>,
  skillsDir: string,
): Promise<Skill[]> {
  const commandsDir = path.join(path.dirname(skillsDir), 'commands');
  const [skillsResult, commandsResult] = await Promise.all([
    loader.loadFromDirectory(skillsDir),
    loader.loadFromDirectory(commandsDir),
  ]);

  return mergeSkillArtifacts(skillsResult, commandsResult);
}

function mergeSkillArtifacts(
  skillsResult: SkillLoadResult,
  commandsResult: SkillLoadResult,
): Skill[] {
  const merged = new Map<string, Skill>();

  for (const skill of skillsResult.skills) {
    merged.set(skill.name, skill);
  }

  for (const command of skillsResult.commands) {
    const skill = createCommandBackedSkill(command);
    merged.set(skill.name, skill);
  }

  for (const command of commandsResult.commands) {
    const skill = createCommandBackedSkill(command);
    merged.set(skill.name, skill);
  }

  return Array.from(merged.values());
}

/**
 * Load Claude/Codex-style `.codex/skills/<name>/SKILL.md` artifacts for TUI discovery.
 *
 * These files intentionally do not carry Neko SDD manifest metadata, so this
 * loader keeps them as lightweight project Skills instead of routing through the
 * stricter Neko SkillLoader that emits SDD warnings.
 */
export async function loadCodexSkillArtifactsAsSkills(
  fs: CodexSkillArtifactFs,
  pathApi: CodexSkillArtifactPath,
  skillsDir: string,
): Promise<Skill[]> {
  let entries: readonly CodexSkillArtifactDirent[];
  try {
    entries = await fs.readdir(skillsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const skills: Skill[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const skillDir = pathApi.join(skillsDir, entry.name);
    const skillFile = pathApi.join(skillDir, 'SKILL.md');
    let content: string;
    try {
      content = await fs.readFile(skillFile, 'utf8');
    } catch {
      continue;
    }

    const skill = parseCodexSkillArtifact(content, skillDir);
    if (skill) {
      skills.push(skill);
    }
  }

  return skills;
}

function parseCodexSkillArtifact(content: string, directoryPath: string): Skill | null {
  const parsed = parseFrontmatterMarkdown(content);
  if (!parsed) {
    return null;
  }

  const name = readFrontmatterString(parsed.frontmatter, 'name');
  const description = readFrontmatterString(parsed.frontmatter, 'description');
  if (!name || !description) {
    return null;
  }

  return {
    name,
    description,
    content: parsed.body,
    source: 'project',
    enabled: true,
    directoryPath,
    entryPointKind: 'skill',
  };
}

function parseFrontmatterMarkdown(
  content: string,
): { readonly frontmatter: ReadonlyMap<string, string>; readonly body: string } | null {
  if (!content.startsWith('---')) {
    return null;
  }
  const endIndex = content.indexOf('---', 3);
  if (endIndex === -1) {
    return null;
  }

  return {
    frontmatter: parseSimpleYamlMap(content.slice(3, endIndex).trim()),
    body: content.slice(endIndex + 3).trim(),
  };
}

function parseSimpleYamlMap(yaml: string): ReadonlyMap<string, string> {
  const result = new Map<string, string>();
  for (const line of yaml.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      continue;
    }
    const key = trimmed.slice(0, colonIndex).trim();
    const value = stripYamlStringQuotes(trimmed.slice(colonIndex + 1).trim());
    result.set(key, value);
  }
  return result;
}

function readFrontmatterString(
  frontmatter: ReadonlyMap<string, string>,
  key: string,
): string | undefined {
  const value = frontmatter.get(key)?.trim();
  return value && value.length > 0 ? value : undefined;
}

function stripYamlStringQuotes(value: string): string {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
