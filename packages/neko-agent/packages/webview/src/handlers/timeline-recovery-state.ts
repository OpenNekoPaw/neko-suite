import type { AgentHostRuntimeAdapter, AgentTurnTimelineSnapshotRequest } from '@neko-agent/types';
import { buildAgentTurnTimelineSnapshotRequest } from '@neko-agent/types';
import type { ActiveTurnTimelineState } from '@/presenters/active-turn-timeline-presenter';

const RECOVERY_STATE_KEY = 'agentTurnTimelineRecoveries';

export interface AgentTurnTimelineRecoveryDescriptor {
  readonly connectionEpoch: string;
  readonly conversationId: string;
  readonly turnId: string;
  readonly messageId: string;
  readonly lastAppliedDeliveryRevision: number;
}

export function persistAgentTurnTimelineRecovery(
  adapter: Pick<AgentHostRuntimeAdapter, 'getState' | 'setState'>,
  state: ActiveTurnTimelineState,
): void {
  if (state.completed || state.synchronization === 'unavailable') {
    removeAgentTurnTimelineRecovery(adapter, state);
    return;
  }
  const current = readPersistedHostState(adapter);
  const recoveries = readRecoveryDescriptors(current[RECOVERY_STATE_KEY]).filter(
    (descriptor) => !sameTimelineIdentity(descriptor, state),
  );
  recoveries.push({
    connectionEpoch: state.connectionEpoch,
    conversationId: state.conversationId,
    turnId: state.turnId,
    messageId: state.messageId,
    lastAppliedDeliveryRevision: state.deliveryRevision,
  });
  adapter.setState({ ...current, [RECOVERY_STATE_KEY]: recoveries });
}

export function removeAgentTurnTimelineRecovery(
  adapter: Pick<AgentHostRuntimeAdapter, 'getState' | 'setState'>,
  identity: Pick<
    ActiveTurnTimelineState,
    'connectionEpoch' | 'conversationId' | 'turnId' | 'messageId'
  >,
): void {
  const current = readPersistedHostState(adapter);
  if (!(RECOVERY_STATE_KEY in current)) return;
  const recoveries = readRecoveryDescriptors(current[RECOVERY_STATE_KEY]).filter(
    (descriptor) => !sameTimelineIdentity(descriptor, identity),
  );
  adapter.setState({ ...current, [RECOVERY_STATE_KEY]: recoveries });
}

export function readAgentTurnTimelineRecoveryRequests(
  adapter: Pick<AgentHostRuntimeAdapter, 'getState'>,
): readonly AgentTurnTimelineSnapshotRequest[] {
  const current = readPersistedHostState(adapter);
  return readRecoveryDescriptors(current[RECOVERY_STATE_KEY]).map((descriptor) =>
    buildAgentTurnTimelineSnapshotRequest({
      ...descriptor,
      reason: 'webview-initialization',
    }),
  );
}

function readPersistedHostState(
  adapter: Pick<AgentHostRuntimeAdapter, 'getState'>,
): Readonly<Record<string, unknown>> {
  const value: unknown = adapter.getState();
  return isRecord(value) ? value : {};
}

function readRecoveryDescriptors(value: unknown): AgentTurnTimelineRecoveryDescriptor[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => (isRecoveryDescriptor(candidate) ? [candidate] : []));
}

function isRecoveryDescriptor(value: unknown): value is AgentTurnTimelineRecoveryDescriptor {
  if (!isRecord(value)) return false;
  return (
    isNonEmptyString(value.connectionEpoch) &&
    isNonEmptyString(value.conversationId) &&
    isNonEmptyString(value.turnId) &&
    isNonEmptyString(value.messageId) &&
    Number.isInteger(value.lastAppliedDeliveryRevision) &&
    typeof value.lastAppliedDeliveryRevision === 'number' &&
    value.lastAppliedDeliveryRevision > 0
  );
}

function sameTimelineIdentity(
  left: AgentTurnTimelineRecoveryDescriptor,
  right: Pick<
    ActiveTurnTimelineState,
    'connectionEpoch' | 'conversationId' | 'turnId' | 'messageId'
  >,
): boolean {
  return (
    left.connectionEpoch === right.connectionEpoch &&
    left.conversationId === right.conversationId &&
    left.turnId === right.turnId &&
    left.messageId === right.messageId
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}
