export type AgentConfigDiagnosticCode =
  | 'empty'
  | 'invalidJson'
  | 'readError'
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingApiKey'
  | 'invalidToml'
  | 'unsupportedVersion'
  | 'duplicateProviderId'
  | 'duplicateModelId'
  | 'legacyJsonOnly'
  | 'conflictingConfigFiles'
  | 'invalidDefaultProvider'
  | 'invalidDefaultModel'
  | 'missingAccountCatalog'
  | 'accountCatalogUnavailable'
  | 'accountModelNotEntitled';

export interface AgentConfigDiagnostic {
  code: AgentConfigDiagnosticCode;
  filePath: string;
  message: string;
}
