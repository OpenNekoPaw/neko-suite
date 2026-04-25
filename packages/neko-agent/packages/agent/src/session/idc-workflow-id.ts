/**
 * Legacy compatibility wrappers for the old "workflowId" terminology.
 *
 * New code should use idc-run-kind.ts instead.
 */

/** @deprecated Use `createSkillRunKind()` from `idc-run-kind.ts`. */
export { createSkillRunKind as createSkillWorkflowId } from './idc-run-kind';
/** @deprecated Use `encodeRunKindSegment()` from `idc-run-kind.ts`. */
export { encodeRunKindSegment as encodeWorkflowIdSegment } from './idc-run-kind';
