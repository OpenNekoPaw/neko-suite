import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { AgentStateSnapshotMessage } from '@neko-agent/types';
import type { SkillSource, SkillSummary } from '@neko/shared';
import type { HomeAgentSkillsSnapshot, HomeAgentSnapshotRuntime } from './home-agent-webview-host';

export interface HomeSkillFileSnapshotRuntimeOptions {
  readonly workspaceRoot: string;
  readonly homeDir?: string;
  readonly fs?: HomeSkillCatalogFs;
  readonly path?: HomeSkillCatalogPath;
}

export interface HomeSkillCatalogFs {
  readdir(
    dirPath: string,
    options: { readonly withFileTypes: true },
  ): Promise<readonly HomeSkillCatalogDirent[]>;
  readFile(filePath: string, encoding: 'utf-8'): Promise<string>;
}

export interface HomeSkillCatalogDirent {
  readonly name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

export interface HomeSkillCatalogPath {
  join(...parts: string[]): string;
  basename(filePath: string, suffix?: string): string;
}

interface SkillCatalogScanEntry {
  readonly source: Extract<SkillSource, 'personal' | 'project'>;
  readonly kind: 'skills' | 'commands';
  readonly dirPath: string;
}

type FrontmatterRecord = ReadonlyMap<string, string | boolean>;

export function createHomeSkillFileSnapshotRuntime(
  options: HomeSkillFileSnapshotRuntimeOptions,
): HomeAgentSnapshotRuntime {
  return new HomeSkillFileSnapshotRuntime({
    workspaceRoot: options.workspaceRoot,
    homeDir: options.homeDir ?? os.homedir(),
    fs: options.fs ?? fs,
    path: options.path ?? path,
  });
}

export class HomeSkillFileSnapshotRuntime implements HomeAgentSnapshotRuntime {
  constructor(private readonly options: Required<HomeSkillFileSnapshotRuntimeOptions>) {}

  listAgentStates(): AgentStateSnapshotMessage['agentStates'] {
    return [];
  }

  async getSkillsSnapshot(): Promise<HomeAgentSkillsSnapshot> {
    const skills: SkillSummary[] = [];
    const diagnostics: string[] = [];

    for (const entry of this.getScanEntries()) {
      const result =
        entry.kind === 'skills'
          ? await this.scanSkillDirectory(entry)
          : await this.scanCommandDirectory(entry);
      skills.push(...result.skills);
      diagnostics.push(...result.diagnostics);
    }

    return { skills, diagnostics };
  }

  private getScanEntries(): readonly SkillCatalogScanEntry[] {
    return [
      {
        source: 'personal',
        kind: 'skills',
        dirPath: this.options.path.join(this.options.homeDir, '.agents', 'skills'),
      },
      {
        source: 'personal',
        kind: 'commands',
        dirPath: this.options.path.join(this.options.homeDir, '.neko', 'commands'),
      },
      {
        source: 'project',
        kind: 'skills',
        dirPath: this.options.path.join(this.options.workspaceRoot, '.agents', 'skills'),
      },
      {
        source: 'project',
        kind: 'commands',
        dirPath: this.options.path.join(this.options.workspaceRoot, '.neko', 'commands'),
      },
    ];
  }

  private async scanSkillDirectory(
    entry: SkillCatalogScanEntry,
  ): Promise<HomeAgentSkillsSnapshot> {
    const directory = await this.readDirectory(entry.dirPath);
    if (directory.ok === false) {
      return { skills: [], diagnostics: directory.missing ? [] : [directory.message] };
    }

    const skills: SkillSummary[] = [];
    const diagnostics: string[] = [];
    for (const dirent of directory.entries) {
      if (!dirent.isDirectory()) continue;
      const skillFilePath = this.options.path.join(entry.dirPath, dirent.name, 'SKILL.md');
      const loaded = await this.readSkillSummary(skillFilePath, entry.source, dirent.name);
      if (loaded.ok) {
        skills.push(loaded.skill);
      } else {
        diagnostics.push(loaded.message);
      }
    }
    return { skills, diagnostics };
  }

  private async scanCommandDirectory(
    entry: SkillCatalogScanEntry,
  ): Promise<HomeAgentSkillsSnapshot> {
    const directory = await this.readDirectory(entry.dirPath);
    if (directory.ok === false) {
      return { skills: [], diagnostics: directory.missing ? [] : [directory.message] };
    }

    const skills: SkillSummary[] = [];
    const diagnostics: string[] = [];
    for (const dirent of directory.entries) {
      if (!dirent.isFile() || !dirent.name.endsWith('.md')) continue;
      const commandFilePath = this.options.path.join(entry.dirPath, dirent.name);
      const loaded = await this.readCommandSummary(commandFilePath, entry.source, dirent.name);
      if (loaded.ok) {
        skills.push(loaded.skill);
      } else {
        diagnostics.push(loaded.message);
      }
    }
    return { skills, diagnostics };
  }

  private async readDirectory(
    dirPath: string,
  ): Promise<
    | { readonly ok: true; readonly entries: readonly HomeSkillCatalogDirent[] }
    | { readonly ok: false; readonly missing: boolean; readonly message: string }
  > {
    try {
      return {
        ok: true,
        entries: await this.options.fs.readdir(dirPath, { withFileTypes: true }),
      };
    } catch (error: unknown) {
      return {
        ok: false,
        missing: getErrorCode(error) === 'ENOENT',
        message: `Home Agent skill catalog scan failed for ${dirPath}: ${describeUnknownError(error)}`,
      };
    }
  }

  private async readSkillSummary(
    filePath: string,
    source: Extract<SkillSource, 'personal' | 'project'>,
    fallbackName: string,
  ): Promise<
    | { readonly ok: true; readonly skill: SkillSummary }
    | { readonly ok: false; readonly message: string }
  > {
    const frontmatter = await this.readFrontmatter(filePath);
    if (frontmatter.ok === false) return frontmatter;

    const name = readString(frontmatter.frontmatter, 'name') ?? fallbackName;
    const description = readString(frontmatter.frontmatter, 'description');
    const icon = readString(frontmatter.frontmatter, 'icon');
    if (!description) {
      return {
        ok: false,
        message: `Home Agent skill catalog entry is missing description: ${filePath}`,
      };
    }

    return {
      ok: true,
      skill: {
        name,
        description,
        ...(icon ? { icon } : {}),
        source,
        enabled: readBoolean(frontmatter.frontmatter, 'enabled') ?? true,
        type: 'skill',
      },
    };
  }

  private async readCommandSummary(
    filePath: string,
    source: Extract<SkillSource, 'personal' | 'project'>,
    fallbackFileName: string,
  ): Promise<
    | { readonly ok: true; readonly skill: SkillSummary }
    | { readonly ok: false; readonly message: string }
  > {
    const frontmatter = await this.readFrontmatter(filePath);
    if (frontmatter.ok === false) return frontmatter;

    const command =
      readString(frontmatter.frontmatter, 'command') ??
      this.options.path.basename(fallbackFileName, '.md');
    const description = readString(frontmatter.frontmatter, 'description');
    const icon = readString(frontmatter.frontmatter, 'icon');
    const argumentHint = readString(frontmatter.frontmatter, 'argument-hint');
    if (!description) {
      return {
        ok: false,
        message: `Home Agent command catalog entry is missing description: ${filePath}`,
      };
    }

    return {
      ok: true,
      skill: {
        name: command,
        description,
        ...(icon ? { icon } : {}),
        source,
        enabled: readBoolean(frontmatter.frontmatter, 'enabled') ?? true,
        type: 'slash-command',
        command,
        ...(argumentHint ? { argumentHint } : {}),
      },
    };
  }

  private async readFrontmatter(
    filePath: string,
  ): Promise<
    | { readonly ok: true; readonly frontmatter: FrontmatterRecord }
    | { readonly ok: false; readonly message: string }
  > {
    try {
      const content = await this.options.fs.readFile(filePath, 'utf-8');
      const frontmatter = parseFrontmatter(content);
      if (!frontmatter) {
        return {
          ok: false,
          message: `Home Agent skill catalog entry is missing YAML frontmatter: ${filePath}`,
        };
      }
      return { ok: true, frontmatter };
    } catch (error: unknown) {
      return {
        ok: false,
        message: `Home Agent skill catalog entry failed to load ${filePath}: ${describeUnknownError(error)}`,
      };
    }
  }
}

function parseFrontmatter(content: string): FrontmatterRecord | undefined {
  if (!content.startsWith('---')) return undefined;
  const endIndex = content.indexOf('\n---', 3);
  if (endIndex < 0) return undefined;

  const record = new Map<string, string | boolean>();
  const frontmatter = content.slice(3, endIndex).split(/\r?\n/u);
  for (const rawLine of frontmatter) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex <= 0) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = normalizeFrontmatterValue(line.slice(separatorIndex + 1).trim());
    record.set(key, value);
  }
  return record;
}

function normalizeFrontmatterValue(value: string): string | boolean {
  if (value === 'true') return true;
  if (value === 'false') return false;
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}

function readString(frontmatter: FrontmatterRecord, key: string): string | undefined {
  const value = frontmatter.get(key);
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readBoolean(frontmatter: FrontmatterRecord, key: string): boolean | undefined {
  const value = frontmatter.get(key);
  return typeof value === 'boolean' ? value : undefined;
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('code' in error)) {
    return undefined;
  }
  const code = error.code;
  return typeof code === 'string' ? code : undefined;
}

function describeUnknownError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
