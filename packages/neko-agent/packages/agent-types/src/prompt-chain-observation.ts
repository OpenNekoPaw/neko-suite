export type AgentPromptChainObservationKind =
  'started' | 'checkpoint' | 'skipped' | 'reordered' | 'completed';

export interface AgentPromptChainObservationBase {
  readonly kind: AgentPromptChainObservationKind;
  readonly creationId: string;
  readonly iterationId: string;
  readonly promptChainId: string;
  readonly observedAt: number;
  readonly skillName?: string;
  readonly skillRecordId?: string;
  readonly reason?: string;
  readonly metadata?: Record<string, unknown>;
}

export interface AgentPromptChainStartedObservation extends AgentPromptChainObservationBase {
  readonly kind: 'started';
}

export interface AgentPromptChainCheckpointObservation extends AgentPromptChainObservationBase {
  readonly kind: 'checkpoint';
  readonly checkpointId: string;
}

export interface AgentPromptChainSkippedObservation extends AgentPromptChainObservationBase {
  readonly kind: 'skipped';
  readonly checkpointId: string;
}

export interface AgentPromptChainReorderedObservation extends AgentPromptChainObservationBase {
  readonly kind: 'reordered';
  readonly checkpointId: string;
  readonly beforeCheckpointId?: string;
  readonly afterCheckpointId?: string;
}

export interface AgentPromptChainCompletedObservation extends AgentPromptChainObservationBase {
  readonly kind: 'completed';
}

export type AgentPromptChainObservation =
  | AgentPromptChainStartedObservation
  | AgentPromptChainCheckpointObservation
  | AgentPromptChainSkippedObservation
  | AgentPromptChainReorderedObservation
  | AgentPromptChainCompletedObservation;

export function buildAgentPromptChainStartedObservation(
  input: Omit<AgentPromptChainStartedObservation, 'kind'>,
): AgentPromptChainStartedObservation {
  return { ...input, kind: 'started' };
}

export function buildAgentPromptChainCheckpointObservation(
  input: Omit<AgentPromptChainCheckpointObservation, 'kind'>,
): AgentPromptChainCheckpointObservation {
  return { ...input, kind: 'checkpoint' };
}

export function buildAgentPromptChainSkippedObservation(
  input: Omit<AgentPromptChainSkippedObservation, 'kind'>,
): AgentPromptChainSkippedObservation {
  return { ...input, kind: 'skipped' };
}

export function buildAgentPromptChainReorderedObservation(
  input: Omit<AgentPromptChainReorderedObservation, 'kind'>,
): AgentPromptChainReorderedObservation {
  return { ...input, kind: 'reordered' };
}

export function buildAgentPromptChainCompletedObservation(
  input: Omit<AgentPromptChainCompletedObservation, 'kind'>,
): AgentPromptChainCompletedObservation {
  return { ...input, kind: 'completed' };
}

export function isAgentPromptChainObservation(
  value: unknown,
): value is AgentPromptChainObservation {
  if (!isRecord(value)) return false;
  if (!isAgentPromptChainObservationBase(value)) return false;
  switch (value.kind) {
    case 'started':
    case 'completed':
      return true;
    case 'checkpoint':
    case 'skipped':
      return isNonEmptyString(value['checkpointId']);
    case 'reordered':
      return (
        isNonEmptyString(value['checkpointId']) &&
        (value['beforeCheckpointId'] === undefined ||
          isNonEmptyString(value['beforeCheckpointId'])) &&
        (value['afterCheckpointId'] === undefined || isNonEmptyString(value['afterCheckpointId']))
      );
  }
  return false;
}

function isAgentPromptChainObservationBase(value: Record<string, unknown>): boolean {
  return (
    isAgentPromptChainObservationKind(value['kind']) &&
    isNonEmptyString(value['creationId']) &&
    isNonEmptyString(value['iterationId']) &&
    isNonEmptyString(value['promptChainId']) &&
    typeof value['observedAt'] === 'number' &&
    Number.isFinite(value['observedAt']) &&
    (value['skillName'] === undefined || isNonEmptyString(value['skillName'])) &&
    (value['skillRecordId'] === undefined || isNonEmptyString(value['skillRecordId'])) &&
    (value['reason'] === undefined || isNonEmptyString(value['reason'])) &&
    (value['metadata'] === undefined || isRecord(value['metadata']))
  );
}

function isAgentPromptChainObservationKind(
  value: unknown,
): value is AgentPromptChainObservationKind {
  return (
    value === 'started' ||
    value === 'checkpoint' ||
    value === 'skipped' ||
    value === 'reordered' ||
    value === 'completed'
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
