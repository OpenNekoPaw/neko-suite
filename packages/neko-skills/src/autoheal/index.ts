export { createAutohealChain } from './autoheal-chain';
export type {
  AgentAutohealChainFactory,
  AutohealChainConfig,
  AutohealContext,
  AutohealDiagnosticsPort,
  AutohealEventEmitterPort,
  AutohealFailure,
  AutohealHandler,
  AutohealHandlers,
  AutohealOutcome,
  AutohealPolicy,
  AutohealRuntimeEvent,
  IAutohealChain,
} from '@neko/shared';
export {
  createResolutionDegradeHandler,
  createSubstituteHandler,
  createUserEscalationHandler,
  type AutohealContextLike,
  type AutohealFailureLike,
  type AutohealHandlerLike,
  type AutohealOutcomeLike,
  type ResolutionDegradeConfig,
  type SubstituteConfig,
} from './example-handlers';
