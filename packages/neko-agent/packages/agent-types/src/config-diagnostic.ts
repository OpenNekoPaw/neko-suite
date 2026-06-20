export type AgentConfigDiagnosticCode =
  | 'empty'
  | 'readError'
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingApiKey'
  | 'invalidToml'
  | 'unsupportedVersion'
  | 'duplicateProviderId'
  | 'duplicateModelId'
  | 'unsupportedModelType'
  | 'unsupportedDefaultMediaModelType'
  | 'unsupportedDefaultModelType'
  | 'invalidDefaultModelBinding'
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
