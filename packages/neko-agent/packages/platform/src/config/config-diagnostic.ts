import type {
  ConfigReadDiagnostic,
  ConfigReadErrorCode,
  ConfigReadResult,
} from '@neko/shared/config/config-reader';

export type AssistantConfigAvailabilityCode =
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingApiKey'
  | 'invalidDefaultProvider'
  | 'invalidDefaultModel'
  | 'missingAccountCatalog'
  | 'accountCatalogUnavailable'
  | 'accountModelNotEntitled';

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
    result.status === 'invalidToml' ||
    result.status === 'unsupportedVersion' ||
    result.status === 'duplicateProviderId' ||
    result.status === 'duplicateModelId' ||
    result.status === 'legacyJsonOnly' ||
    result.status === 'conflictingConfigFiles' ||
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
      return `Legacy JSON configuration contains invalid JSON: ${filePath}. Fix or remove the legacy file, then run the Agent config migration command.`;
    case 'invalidToml':
      return `Configuration file contains invalid TOML: ${filePath}. Fix the file, then open a new Agent session or tab.`;
    case 'unsupportedVersion':
      return `Configuration file uses an unsupported version: ${filePath}. Update Neko Suite or migrate the file, then open a new Agent session or tab.`;
    case 'duplicateProviderId':
      return `Configuration file contains duplicate provider IDs: ${filePath}. Remove duplicate provider entries, then open a new Agent session or tab.`;
    case 'duplicateModelId':
      return `Configuration file contains duplicate model IDs: ${filePath}. Remove duplicate model entries, then open a new Agent session or tab.`;
    case 'legacyJsonOnly':
      return `Legacy JSON configuration must be migrated to TOML: ${filePath}. Run the Agent config migration command, then open a new Agent session or tab.`;
    case 'conflictingConfigFiles':
      return `Both TOML and legacy JSON configuration files exist for ${filePath}. Keep the TOML file and remove or migrate the legacy JSON file, then open a new Agent session or tab.`;
    case 'readError':
      return `Unable to read configuration file: ${filePath}. Check file permissions, then open a new Agent session or tab.`;
    case 'missingConfig':
      return `Agent configuration file is missing: ${filePath}. Create the config file with at least one enabled provider, chat model, and required provider credentials, then open a new Agent session or tab.`;
    case 'missingProvider':
      return `Agent configuration has no enabled providers: ${filePath}. Add at least one enabled provider with its required endpoint and credentials, then open a new Agent session or tab.`;
    case 'missingModel':
      return `Agent configuration has no enabled chat models: ${filePath}. Add at least one enabled chat model, then open a new Agent session or tab.`;
    case 'missingApiKey':
      return `Agent configuration has no configured enabled chat provider: ${filePath}. Add the required provider endpoint and credentials, then open a new Agent session or tab.`;
    case 'invalidDefaultProvider':
      return `Agent configuration selects an unavailable default provider: ${filePath}. Fix default_provider, then open a new Agent session or tab.`;
    case 'invalidDefaultModel':
      return `Agent configuration selects an unavailable default chat model: ${filePath}. Fix default_model, then open a new Agent session or tab.`;
    case 'missingAccountCatalog':
      return 'Neko account AI catalog is unavailable. Log in or configure a local AI provider, then open a new Agent session or tab.';
    case 'accountCatalogUnavailable':
      return 'Neko account AI catalog is temporarily unavailable. Refresh Agent or configure a local AI provider.';
    case 'accountModelNotEntitled':
      return 'Neko account does not have entitlement for the selected AI model. Choose another entitled model or update the account plan.';
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
