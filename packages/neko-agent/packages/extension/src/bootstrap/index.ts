/**
 * Bootstrap Module
 * Service bootstrap exports for NekoAgent
 */

export {
  bootstrapCoreServices,
  logServicesStatus,
  IPlatform,
  IToolRegistry,
  IMCPManager,
  ITaskManager,
  IAgentManager,
  IConnectionStateManager,
  IEditorRegistry,
  type IServiceBootstrapResult,
  type IConnectionStateManager as ConnectionStateManagerType,
} from './serviceBootstrap';
