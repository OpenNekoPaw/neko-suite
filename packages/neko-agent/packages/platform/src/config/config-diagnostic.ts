import type {
  ConfigReadDiagnostic,
  ConfigReadErrorCode,
  ConfigReadResult,
} from '@neko/shared/config/config-reader';

export type AssistantConfigAvailabilityCode =
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingApiKey';

export type AssistantConfigDiagnosticCode = ConfigReadErrorCode | AssistantConfigAvailabilityCode;

export interface AssistantConfigDiagnostic {
  readonly code: AssistantConfigDiagnosticCode;
  readonly filePath: string;
  readonly message: string;
}

export function buildAssistantConfigAvailabilityDiagnostic(
  code: AssistantConfigAvailabilityCode,
  filePath: string,
): AssistantConfigDiagnostic {
  return {
    code,
    filePath,
    message: buildSafeConfigDiagnosticMessage(code, filePath),
  };
}

export function projectAssistantConfigDiagnostic(
  diagnostic: ConfigReadDiagnostic,
): AssistantConfigDiagnostic {
  return {
    code: diagnostic.code,
    filePath: diagnostic.filePath,
    message: buildSafeConfigDiagnosticMessage(diagnostic.code, diagnostic.filePath),
  };
}

export function projectAssistantConfigReadResultDiagnostic(
  result: ConfigReadResult,
): AssistantConfigDiagnostic | undefined {
  if (
    result.status === 'empty' ||
    result.status === 'invalidJson' ||
    result.status === 'readError'
  ) {
    return projectAssistantConfigDiagnostic(result.diagnostic);
  }
  return undefined;
}

export function buildSafeConfigDiagnosticMessage(
  code: AssistantConfigDiagnosticCode,
  filePath: string,
): string {
  switch (code) {
    case 'empty':
      return `Configuration file is empty: ${filePath}. Fix the file, then open a new Agent session or tab.`;
    case 'invalidJson':
      return `Configuration file contains invalid JSON: ${filePath}. Fix the file, then open a new Agent session or tab.`;
    case 'readError':
      return `Unable to read configuration file: ${filePath}. Check file permissions, then open a new Agent session or tab.`;
    case 'missingConfig':
      return `Agent configuration file is missing: ${filePath}. Create the config file with at least one enabled provider, chat model, and API key, then open a new Agent session or tab.`;
    case 'missingProvider':
      return `Agent configuration has no enabled providers: ${filePath}. Add at least one enabled provider with an API key, then open a new Agent session or tab.`;
    case 'missingModel':
      return `Agent configuration has no enabled chat models: ${filePath}. Add at least one enabled chat model, then open a new Agent session or tab.`;
    case 'missingApiKey':
      return `Agent configuration has no API key for any enabled chat provider: ${filePath}. Add an API key, then open a new Agent session or tab.`;
  }
}

export function buildConfigUnavailableMessage(
  diagnostic: AssistantConfigDiagnostic | undefined,
): string {
  if (!diagnostic) {
    return 'Agent configuration is unavailable.';
  }
  return diagnostic.message;
}
