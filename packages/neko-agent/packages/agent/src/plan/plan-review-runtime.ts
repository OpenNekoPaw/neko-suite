import type { Message } from '@neko-agent/types';
import {
  buildPlanApprovalDispatchPlan,
  buildPlanApprovalExecutionDispatch,
  buildPlanFileReadErrorMessage,
  type PlanApprovalExecutionDispatch,
} from './plan-approval-dispatch';
import {
  buildPlanRejectionFeedbackStreamMessage,
  buildPlanStatusUpdateMessage,
  projectPlanStepActionReview,
  projectPlanStepModificationReview,
  type PlanRejectionFeedbackStreamMessage,
  type PlanStatusUpdateMessage,
  type PlanStepReviewAction,
  type PlanStepStatusUpdateMessage,
} from './plan-review-presenter';
import {
  updatePlanStatusInMessages,
  updatePlanStepInMessages,
  type PlanStepMessageUpdate,
} from './plan-message-updater';

export type PlanReviewRuntimeMessage =
  | PlanStatusUpdateMessage
  | PlanStepStatusUpdateMessage
  | PlanRejectionFeedbackStreamMessage
  | ReturnType<typeof buildPlanFileReadErrorMessage>;

export interface PlanReviewConversationStore {
  getMessages(conversationId: string): readonly Message[] | undefined;
  updateMessages(conversationId: string, messages: Message[]): void;
}

export interface PlanReviewRuntimeEffects {
  postMessage(message: PlanReviewRuntimeMessage): void | Promise<void>;
  readPlanFile?(filePath: string): Promise<string>;
  executePlanApproval?(dispatch: PlanApprovalExecutionDispatch): void | Promise<void>;
  onMissingConversation?(input: { conversationId: string; planId: string }): void;
  onPlanMessageNotUpdated?(input: { conversationId: string; planId: string }): void;
  onError?(error: unknown): void;
}

export interface PlanApprovalRuntimeInput {
  planId: string;
  conversationId: string;
  filePath?: string;
}

export interface PlanRejectionRuntimeInput {
  planId: string;
  conversationId: string;
}

export interface PlanStepActionRuntimeInput {
  planId: string;
  stepId: string;
  conversationId: string;
  action: PlanStepReviewAction;
}

export interface PlanStepModificationRuntimeInput {
  planId: string;
  stepId: string;
  conversationId: string;
  newDescription: string;
}

export interface PlanReviewRuntimeResult {
  persisted: boolean;
}

export interface PlanApprovalRuntimeResult extends PlanReviewRuntimeResult {
  executed: boolean;
  fileReadFailed: boolean;
}

export async function runPlanApprovalRuntime(
  input: PlanApprovalRuntimeInput,
  store: PlanReviewConversationStore,
  effects: PlanReviewRuntimeEffects,
): Promise<PlanApprovalRuntimeResult> {
  const dispatchPlan = buildPlanApprovalDispatchPlan(input);
  const persisted = updatePlanStatusInConversation(
    store,
    effects,
    input.conversationId,
    input.planId,
    dispatchPlan.messageUpdate.status,
  );

  await effects.postMessage(dispatchPlan.statusUpdateMessage);

  if (dispatchPlan.next.kind === 'execute') {
    await effects.executePlanApproval?.(dispatchPlan.next.dispatch);
    return { persisted, executed: true, fileReadFailed: false };
  }

  if (!effects.readPlanFile) {
    const error = new Error('No plan file reader is configured');
    effects.onError?.(error);
    await effects.postMessage(
      buildPlanFileReadErrorMessage({ conversationId: input.conversationId, error }),
    );
    return { persisted, executed: false, fileReadFailed: true };
  }

  try {
    const planContent = await effects.readPlanFile(dispatchPlan.next.filePath);
    await effects.executePlanApproval?.(
      buildPlanApprovalExecutionDispatch({
        conversationId: input.conversationId,
        planContent,
      }),
    );
    return { persisted, executed: true, fileReadFailed: false };
  } catch (error) {
    effects.onError?.(error);
    await effects.postMessage(
      buildPlanFileReadErrorMessage({ conversationId: input.conversationId, error }),
    );
    return { persisted, executed: false, fileReadFailed: true };
  }
}

export async function runPlanRejectionRuntime(
  input: PlanRejectionRuntimeInput,
  store: PlanReviewConversationStore,
  effects: PlanReviewRuntimeEffects,
): Promise<PlanReviewRuntimeResult> {
  const persisted = updatePlanStatusInConversation(
    store,
    effects,
    input.conversationId,
    input.planId,
    'rejected',
  );

  await effects.postMessage(
    buildPlanStatusUpdateMessage({
      planId: input.planId,
      conversationId: input.conversationId,
      status: 'rejected',
    }),
  );
  await effects.postMessage(buildPlanRejectionFeedbackStreamMessage(input.conversationId));

  return { persisted };
}

export async function runPlanStepActionRuntime(
  input: PlanStepActionRuntimeInput,
  store: PlanReviewConversationStore,
  effects: PlanReviewRuntimeEffects,
): Promise<PlanReviewRuntimeResult> {
  const projection = projectPlanStepActionReview(input);
  const persisted = updatePlanStepInConversation(
    store,
    effects,
    input.conversationId,
    input.planId,
    input.stepId,
    projection.messageUpdate,
  );

  await effects.postMessage(projection.webviewMessage);
  return { persisted };
}

export async function runPlanStepModificationRuntime(
  input: PlanStepModificationRuntimeInput,
  store: PlanReviewConversationStore,
  effects: PlanReviewRuntimeEffects,
): Promise<PlanReviewRuntimeResult> {
  const projection = projectPlanStepModificationReview(input);
  const persisted = updatePlanStepInConversation(
    store,
    effects,
    input.conversationId,
    input.planId,
    input.stepId,
    projection.messageUpdate,
  );

  await effects.postMessage(projection.webviewMessage);
  return { persisted };
}

function updatePlanStatusInConversation(
  store: PlanReviewConversationStore,
  effects: PlanReviewRuntimeEffects,
  conversationId: string,
  planId: string,
  status: 'approved' | 'rejected',
): boolean {
  const messages = store.getMessages(conversationId);
  if (!messages) {
    effects.onMissingConversation?.({ conversationId, planId });
    return false;
  }

  const result = updatePlanStatusInMessages(messages, planId, status);
  if (!result.updated) {
    effects.onPlanMessageNotUpdated?.({ conversationId, planId });
    return false;
  }

  store.updateMessages(conversationId, result.messages);
  return true;
}

function updatePlanStepInConversation(
  store: PlanReviewConversationStore,
  effects: PlanReviewRuntimeEffects,
  conversationId: string,
  planId: string,
  stepId: string,
  update: PlanStepMessageUpdate,
): boolean {
  const messages = store.getMessages(conversationId);
  if (!messages) {
    effects.onMissingConversation?.({ conversationId, planId });
    return false;
  }

  const result = updatePlanStepInMessages(messages, planId, stepId, update);
  if (!result.updated) {
    effects.onPlanMessageNotUpdated?.({ conversationId, planId });
    return false;
  }

  store.updateMessages(conversationId, result.messages);
  return true;
}
