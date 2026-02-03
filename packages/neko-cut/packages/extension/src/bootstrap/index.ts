/**
 * Bootstrap Module
 * 服务引导相关模块导出
 */

export { createPlatformInstance } from './platformFactory';
export { registerBuiltinTools } from './toolsBootstrap';
export { connectMCPServers, type MCPConnectResult } from './mcpBootstrap';
export { checkWorkflowEngines, type WorkflowCheckResult } from './workflowBootstrap';
export {
  bootstrapCoreServices,
  logServicesStatus,
  IPlatform,
  IToolRegistry,
  IMCPManager,
  ITaskManager,
  IConnectionStateManager,
  IAgentManager,
  type IServiceBootstrapResult,
  type VSCodeToolContext,
} from './serviceBootstrap';
