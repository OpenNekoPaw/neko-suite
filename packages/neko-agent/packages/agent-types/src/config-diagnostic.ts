export type AgentConfigDiagnosticCode =
  | 'empty'
  | 'invalidJson'
  | 'readError'
  | 'missingConfig'
  | 'missingProvider'
  | 'missingModel'
  | 'missingApiKey';

export interface AgentConfigDiagnostic {
  code: AgentConfigDiagnosticCode;
  filePath: string;
  message: string;
}
