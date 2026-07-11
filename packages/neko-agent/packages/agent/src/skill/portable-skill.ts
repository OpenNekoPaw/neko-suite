import type {
  PortableSkillDefinition,
  PortableSkillValidationResult,
  SkillCompatibilityStatus,
  SkillDiagnostic,
  SkillValidationDimension,
} from '@neko/shared';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';

const PORTABLE_SKILL_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const PORTABLE_FRONTMATTER_KEYS = new Set([
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
]);

export interface PortableSkillParseOptions {
  readonly directoryName?: string;
}

export interface PortableSkillParseResult {
  readonly definition?: PortableSkillDefinition;
  readonly validation: SkillValidationDimension;
}

export function parsePortableSkillMarkdown(
  content: string,
  options: PortableSkillParseOptions = {},
): PortableSkillParseResult {
  const extracted = extractFrontmatter(content);
  if (!extracted) {
    return invalidParse('skill-frontmatter-missing', 'SKILL.md must begin with YAML frontmatter.');
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(extracted.yaml);
  } catch (error) {
    return invalidParse(
      'skill-frontmatter-invalid-yaml',
      `SKILL.md frontmatter is invalid YAML: ${toErrorMessage(error)}`,
    );
  }
  if (!isRecord(parsed)) {
    return invalidParse('skill-frontmatter-invalid', 'SKILL.md frontmatter must be a mapping.');
  }

  const diagnostics: SkillDiagnostic[] = [];
  for (const key of Object.keys(parsed)) {
    if (!PORTABLE_FRONTMATTER_KEYS.has(key)) {
      diagnostics.push(
        errorDiagnostic(
          'portable',
          'skill-frontmatter-unknown-field',
          `Unsupported portable SKILL.md frontmatter field "${key}".`,
          key,
        ),
      );
    }
  }

  const name = readString(parsed, 'name', diagnostics, true);
  const description = readString(parsed, 'description', diagnostics, true);
  const license = readString(parsed, 'license', diagnostics, false);
  const compatibility = readString(parsed, 'compatibility', diagnostics, false);
  const metadata = readStringMap(parsed.metadata, diagnostics);
  const allowedTools = readAllowedTools(parsed['allowed-tools'], diagnostics);

  if (name === undefined || description === undefined || diagnostics.some(isError)) {
    return { validation: dimension(diagnostics) };
  }

  const definition: PortableSkillDefinition = {
    name,
    description,
    body: extracted.body,
    ...(license === undefined ? {} : { license }),
    ...(compatibility === undefined ? {} : { compatibility }),
    ...(metadata === undefined ? {} : { metadata }),
    ...(allowedTools === undefined ? {} : { allowedTools }),
  };
  const validation = validatePortableSkillDefinition(definition, options);
  return {
    ...(validation.valid ? { definition } : {}),
    validation: dimension([...diagnostics, ...validation.diagnostics]),
  };
}

export function serializePortableSkillMarkdown(definition: PortableSkillDefinition): string {
  const validation = validatePortableSkillDefinition(definition);
  if (!validation.valid) {
    throw new Error(formatDiagnostics(validation.diagnostics));
  }

  const frontmatter: Record<string, unknown> = {
    name: definition.name,
    description: definition.description,
  };
  if (definition.license !== undefined) {
    frontmatter.license = definition.license;
  }
  if (definition.compatibility !== undefined) {
    frontmatter.compatibility = definition.compatibility;
  }
  if (definition.metadata !== undefined && Object.keys(definition.metadata).length > 0) {
    frontmatter.metadata = definition.metadata;
  }
  if (definition.allowedTools !== undefined && definition.allowedTools.length > 0) {
    frontmatter['allowed-tools'] = definition.allowedTools.join(' ');
  }

  const yaml = stringifyYaml(frontmatter, { lineWidth: 0 }).trimEnd();
  const body = definition.body.trim();
  return `---\n${yaml}\n---${body.length === 0 ? '\n' : `\n\n${body}\n`}`;
}

export function validatePortableSkillDefinition(
  definition: PortableSkillDefinition,
  options: PortableSkillParseOptions = {},
): SkillValidationDimension {
  const diagnostics: SkillDiagnostic[] = [];
  if (
    definition.name.length === 0 ||
    definition.name.length > 64 ||
    !PORTABLE_SKILL_NAME.test(definition.name)
  ) {
    diagnostics.push(
      errorDiagnostic(
        'portable',
        'skill-name-invalid',
        'Skill name must be 1-64 lowercase letters or digits separated by single hyphens.',
        'name',
      ),
    );
  }
  if (options.directoryName !== undefined && options.directoryName !== definition.name) {
    diagnostics.push(
      errorDiagnostic(
        'portable',
        'skill-directory-name-mismatch',
        `Skill directory "${options.directoryName}" must match frontmatter name "${definition.name}".`,
        'name',
      ),
    );
  }
  if (definition.description.trim().length === 0 || definition.description.length > 1024) {
    diagnostics.push(
      errorDiagnostic(
        'portable',
        'skill-description-invalid',
        'Skill description must be non-empty and no longer than 1024 characters.',
        'description',
      ),
    );
  }
  if (definition.compatibility !== undefined && definition.compatibility.length > 500) {
    diagnostics.push(
      errorDiagnostic(
        'portable',
        'skill-compatibility-too-long',
        'Skill compatibility must be no longer than 500 characters.',
        'compatibility',
      ),
    );
  }
  if (definition.metadata !== undefined) {
    for (const [key, value] of Object.entries(definition.metadata)) {
      if (key.trim().length === 0 || typeof value !== 'string') {
        diagnostics.push(
          errorDiagnostic(
            'portable',
            'skill-metadata-invalid',
            'Skill metadata must be a non-empty string-to-string map.',
            `metadata.${key}`,
          ),
        );
      }
    }
  }
  if (definition.allowedTools !== undefined) {
    definition.allowedTools.forEach((tool, index) => {
      if (typeof tool !== 'string' || tool.trim().length === 0) {
        diagnostics.push(
          errorDiagnostic(
            'portable',
            'skill-allowed-tool-invalid',
            'Each allowed tool hint must be a non-empty string.',
            `allowed-tools.${index}`,
          ),
        );
      }
    });
  }
  return dimension(diagnostics);
}

export function validateNekoFirstPartySkillQuality(
  definition: PortableSkillDefinition,
): SkillValidationDimension {
  const diagnostics: SkillDiagnostic[] = [];
  if (definition.body.trim().length === 0) {
    diagnostics.push({
      area: 'quality',
      code: 'skill-body-empty',
      severity: 'warning',
      message: 'First-party Skills should contain actionable instruction content.',
      path: 'body',
    });
  }
  if (!/\b(use|when|not|avoid|适用|使用|不要|避免)\b/i.test(definition.description)) {
    diagnostics.push({
      area: 'quality',
      code: 'skill-description-trigger-guidance-missing',
      severity: 'warning',
      message:
        'First-party Skill descriptions should explain when the Skill should or should not be used.',
      path: 'description',
    });
  }
  return { valid: diagnostics.length === 0, diagnostics };
}

export function createPortableSkillValidationResult(
  definition: PortableSkillDefinition,
  options: PortableSkillParseOptions & {
    readonly overlay?: SkillValidationDimension;
    readonly compatibility?: SkillCompatibilityStatus;
    readonly firstParty?: boolean;
  } = {},
): PortableSkillValidationResult {
  return {
    portable: validatePortableSkillDefinition(definition, options),
    overlay: options.overlay ?? { valid: true, diagnostics: [] },
    compatibility: options.compatibility ?? { state: 'unknown', diagnostics: [] },
    quality: options.firstParty
      ? validateNekoFirstPartySkillQuality(definition)
      : { valid: true, diagnostics: [] },
  };
}

function extractFrontmatter(
  content: string,
): { readonly yaml: string; readonly body: string } | undefined {
  const normalized = content.startsWith('\uFEFF') ? content.slice(1) : content;
  const match = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(normalized);
  if (!match || match[1] === undefined) {
    return undefined;
  }
  return {
    yaml: match[1],
    body: normalized.slice(match[0].length).trim(),
  };
}

function readString(
  record: Readonly<Record<string, unknown>>,
  key: string,
  diagnostics: SkillDiagnostic[],
  required: boolean,
): string | undefined {
  const value = record[key];
  if (value === undefined) {
    if (required) {
      diagnostics.push(
        errorDiagnostic('portable', `skill-${key}-missing`, `SKILL.md requires "${key}".`, key),
      );
    }
    return undefined;
  }
  if (typeof value !== 'string') {
    diagnostics.push(
      errorDiagnostic('portable', `skill-${key}-type`, `SKILL.md "${key}" must be a string.`, key),
    );
    return undefined;
  }
  return value;
}

function readStringMap(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): Readonly<Record<string, string>> | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!isRecord(value)) {
    diagnostics.push(
      errorDiagnostic(
        'portable',
        'skill-metadata-type',
        'SKILL.md metadata must be a mapping.',
        'metadata',
      ),
    );
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry !== 'string') {
      diagnostics.push(
        errorDiagnostic(
          'portable',
          'skill-metadata-value-type',
          `SKILL.md metadata value "${key}" must be a string.`,
          `metadata.${key}`,
        ),
      );
      continue;
    }
    result[key] = entry;
  }
  return result;
}

function readAllowedTools(
  value: unknown,
  diagnostics: SkillDiagnostic[],
): readonly string[] | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value === 'string') {
    const tools = value.split(/[\s,]+/).filter(Boolean);
    if (tools.length === 0) {
      diagnostics.push(
        errorDiagnostic(
          'portable',
          'skill-allowed-tools-empty',
          'allowed-tools must not be empty.',
          'allowed-tools',
        ),
      );
      return undefined;
    }
    return tools;
  }
  if (
    Array.isArray(value) &&
    value.every((entry) => typeof entry === 'string' && entry.trim().length > 0)
  ) {
    return value;
  }
  diagnostics.push(
    errorDiagnostic(
      'portable',
      'skill-allowed-tools-type',
      'allowed-tools must be a non-empty string or string array.',
      'allowed-tools',
    ),
  );
  return undefined;
}

function invalidParse(code: string, message: string): PortableSkillParseResult {
  return { validation: dimension([errorDiagnostic('portable', code, message, 'SKILL.md')]) };
}

function dimension(diagnostics: readonly SkillDiagnostic[]): SkillValidationDimension {
  return { valid: !diagnostics.some(isError), diagnostics };
}

function isError(diagnostic: SkillDiagnostic): boolean {
  return diagnostic.severity === 'error';
}

function errorDiagnostic(
  area: SkillDiagnostic['area'],
  code: string,
  message: string,
  path?: string,
): SkillDiagnostic {
  return { area, code, severity: 'error', message, ...(path === undefined ? {} : { path }) };
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function formatDiagnostics(diagnostics: readonly SkillDiagnostic[]): string {
  return diagnostics.map((diagnostic) => `${diagnostic.code}: ${diagnostic.message}`).join('\n');
}
