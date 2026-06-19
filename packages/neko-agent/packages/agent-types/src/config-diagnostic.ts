export type AgentConfigDiagnosticCode =
  | 'empty'
  | 'invalidJson'
  | 'readError'
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingApiKey'
  | 'missingAccountCatalog'
  | 'accountCatalogUnavailable'
  | 'accountModelNotEntitled';

export interface AgentConfigDiagnostic {
  code: AgentConfigDiagnosticCode;
  filePath: string;
  message: string;
}
