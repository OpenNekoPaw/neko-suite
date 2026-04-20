/**
 * Autoheal module — 5-level technical recovery chain.
 *
 * See: docs/architecture/dual-flow-architecture.md §7
 *      plan v2 P3
 */

export {
  createAutohealChain,
  type IAutohealChain,
  type AutohealChainConfig,
  type AutohealHandler,
  type AutohealHandlers,
} from './autoheal-chain';

export {
  AUTOHEAL_LEVELS,
  AUTOHEAL_LEVEL_LABEL,
  DEFAULT_AUTOHEAL_POLICY,
  type AutohealLevel,
  type AutohealFailure,
  type AutohealContext,
  type AutohealOutcome,
  type AutohealPolicy,
} from './autoheal-types';
