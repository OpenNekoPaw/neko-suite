export type AgentConfigDiagnosticCode =
  | 'empty'
  | 'readError'
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingApiKey'
  | 'invalidToml'
  | 'unsupportedVersion'
  | 'unsupportedProviderType'
  | 'unsupportedProviderConnectionKind'
  | 'unsupportedProviderProtocolProfile'
  | 'unsupportedProviderSupportLevel'
  | 'unsupportedProtocolAuthType'
  | 'unsupportedProtocolStreamFormat'
  | 'unsupportedModelProtocolProfile'
  | 'unsupportedModelProtocol'
  | 'duplicateProviderId'
  | 'duplicateModelId'
  | 'invalidDefaultMaxTokens'
  | 'invalidModelTokenMetadata'
  | 'unsupportedProfileSchemaSection'
  | 'unsupportedModelType'
  | 'unsupportedDefaultMediaModelType'
  | 'unsupportedDefaultModelType'
  | 'invalidDefaultModelBinding'
  | 'unsupportedWorkspaceProviderDefinition'
  | 'unsupportedWorkspaceModelDefinition'
  | 'unsupportedSkillSource'
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
