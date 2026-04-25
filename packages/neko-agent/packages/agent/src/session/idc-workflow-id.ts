/**
 * Legacy compatibility wrappers for the old "workflowId" terminology.
 *
 * New code should use idc-run-kind.ts instead.
 */

export { createSkillRunKind as createSkillWorkflowId } from './idc-run-kind';
export { encodeRunKindSegment as encodeWorkflowIdSegment } from './idc-run-kind';
