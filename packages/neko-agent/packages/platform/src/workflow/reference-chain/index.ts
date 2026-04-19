/**
 * Reference Chain barrel (Phase 5 stub).
 *
 * See docs/architecture/creative-consistency.md §4 and
 * docs/architecture/workflow-orchestration.md Phase 5 for roadmap.
 */

export type {
  BuildReferenceChainOptions,
  ReferenceChainBuilder,
  ReferenceChainEntry,
  ReferenceChainShot,
  ReferenceChainStrategy,
} from './types';

export { buildReferenceChain, createReferenceChainBuilder } from './reference-chain-builder';
