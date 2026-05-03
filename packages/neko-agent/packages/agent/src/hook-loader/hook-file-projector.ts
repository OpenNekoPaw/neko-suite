import type {
  ConfiguredHook,
  Hook,
  HookFrontmatter,
  HookLoadError,
  SkillSource,
} from '@neko/shared';
import { createHook, parseHookEvent } from '@neko/shared';

export interface HookFileParseResult {
  hook?: Hook;
  error?: HookLoadError;
}

export interface HookFileScanResult {
  personal: Hook[];
  project: Hook[];
  errors: HookLoadError[];
}

export const HOOK_MARKDOWN_FILE_EXTENSION = '.md';

export function shouldScanHookFile(fileName: string): boolean {
  return fileName.endsWith(HOOK_MARKDOWN_FILE_EXTENSION);
}

export function parseHookMarkdownFile(
  content: string,
  source: SkillSource,
  filePath: string,
): HookFileParseResult {
  const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!frontmatterMatch) {
    return {
      error: {
        file: filePath,
        message: 'Invalid format: missing YAML frontmatter',
      },
    };
  }

  const yamlContent = frontmatterMatch[1] ?? '';
  const bodyContent = (frontmatterMatch[2] ?? '').trim();

  try {
    const frontmatter = parseSimpleHookYaml(yamlContent);
    const validationError = validateHookFrontmatter(frontmatter, filePath);
    if (validationError) {
      return { error: validationError };
    }

    const event = parseHookEvent(frontmatter.event as string);
    if (!event) {
      return {
        error: { file: filePath, message: `Invalid event type: ${frontmatter.event}` },
      };
    }

    const hookFrontmatter: HookFrontmatter = {
      name: frontmatter.name as string,
      description: frontmatter.description as string,
      event,
      condition: frontmatter.condition as string | undefined,
      priority: frontmatter.priority as number | undefined,
      enabled: frontmatter.enabled as boolean | undefined,
    };

    return { hook: createHook(hookFrontmatter, bodyContent, source, filePath) };
  } catch (error) {
    return {
      error: {
        file: filePath,
        message: `Parse error: ${error instanceof Error ? error.message : String(error)}`,
      },
    };
  }
}

export function parseSimpleHookYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) continue;

    const key = trimmed.slice(0, colonIndex).trim();
    let value: string | boolean | number = trimmed.slice(colonIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (value === 'true') value = true;
    else if (value === 'false') value = false;
    else if (!Number.isNaN(Number(value))) value = Number(value);

    result[key] = value;
  }

  return result;
}

export function toConfiguredHookCatalog(result: HookFileScanResult): ConfiguredHook[] {
  return [
    ...result.personal.map((hook) => ({ ...hook, enabled: hook.enabled ?? true })),
    ...result.project.map((hook) => ({ ...hook, enabled: hook.enabled ?? true })),
  ];
}

export function buildHookFileReadError(filePath: string, error: unknown): HookLoadError {
  return {
    file: filePath,
    message: `Failed to read: ${formatHookFileError(error)}`,
  };
}

export function buildHookDirectoryScanError(dirPath: string, error: unknown): HookLoadError {
  return {
    file: dirPath,
    message: `Failed to scan directory: ${formatHookFileError(error)}`,
  };
}

function validateHookFrontmatter(
  frontmatter: Record<string, unknown>,
  filePath: string,
): HookLoadError | null {
  if (!frontmatter.name) {
    return { file: filePath, message: 'Missing required field: name' };
  }
  if (!frontmatter.description) {
    return { file: filePath, message: 'Missing required field: description' };
  }
  if (!frontmatter.event) {
    return { file: filePath, message: 'Missing required field: event' };
  }
  return null;
}

function formatHookFileError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message;
  }

  return String(error);
}
