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
  ITaskLifecycleCoordinator,
  ITaskResultObservationCoordinator,
  IEditorRegistry,
  type IServiceBootstrapResult,
} from './serviceBootstrap';
