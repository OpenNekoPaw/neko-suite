import type {
  CanvasStoryboardPayload,
  CreativeEntityRef,
  EntityMemoryContribution,
  ShotCharacter,
  StoryboardValidationDiagnostic,
} from '@neko/shared';
import { isCreativeEntityRef } from '@neko/shared';
import type {
  EntityMemoryContributionAutomationDecision,
  EntityMemoryContributionAutomationPort,
  EntityMemoryContributionAutomationResult,
} from '../chat/message/entityMemoryContributionAutomation';

export interface StoryboardDeliveryProcessInput {
  readonly contribution: EntityMemoryContribution;
  readonly toolCallId?: string;
  readonly sourceArtifactId?: string;
  readonly timeoutMs?: number;
}

export interface StoryboardDeliveryServiceOptions {
  readonly entityAutomation?: EntityMemoryContributionAutomationPort;
  readonly defaultTimeoutMs?: number;
  readonly now?: () => number;
}

export interface StoryboardDeliveryInput {
  readonly payload: CanvasStoryboardPayload;
  readonly entityContribution?: StoryboardDeliveryProcessInput;
}

export interface StoryboardDeliveryResult {
  readonly payload: CanvasStoryboardPayload;
  readonly automationResult?: EntityMemoryContributionAutomationResult;
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
}

interface ShotCharacterLocation {
  readonly sceneIndex: number;
  readonly shotIndex: number;
  readonly characterIndex: number;
  readonly shotNumber: number;
  readonly character: ShotCharacter;
}

interface DecisionMatch {
  readonly decisionIndex: number;
  readonly location: ShotCharacterLocation;
  readonly entityRef?: CreativeEntityRef;
  readonly candidateId?: string;
}

type DecisionRecord = EntityMemoryContributionAutomationDecision & Record<string, unknown>;

const DEFAULT_ENTITY_CONTRIBUTION_TIMEOUT_MS = 5_000;

export class StoryboardDeliveryService {
  constructor(private readonly options: StoryboardDeliveryServiceOptions = {}) {}

  async prepare(input: StoryboardDeliveryInput): Promise<StoryboardDeliveryResult> {
    const diagnostics: StoryboardValidationDiagnostic[] = [];
    const contribution = input.entityContribution;
    if (!contribution || !this.options.entityAutomation) {
      return { payload: input.payload, diagnostics };
    }

    const automationResult = await this.processContribution(contribution, diagnostics);
    if (!automationResult) {
      return { payload: attachDeliveryDiagnostics(input.payload, diagnostics), diagnostics };
    }

    const injection = injectEntityDecisionRefs(input.payload, automationResult.decisions);
    diagnostics.push(...injection.diagnostics);
    return {
      payload: attachDeliveryDiagnostics(injection.payload, diagnostics),
      automationResult,
      diagnostics,
    };
  }

  private async processContribution(
    input: StoryboardDeliveryProcessInput,
    diagnostics: StoryboardValidationDiagnostic[],
  ): Promise<EntityMemoryContributionAutomationResult | undefined> {
    const automation = this.options.entityAutomation;
    if (!automation) return undefined;

    try {
      return await withTimeout(
        automation.processContribution({
          contribution: input.contribution,
          toolCallId: input.toolCallId ?? input.contribution.contributionId,
          ...(input.sourceArtifactId ? { sourceArtifactId: input.sourceArtifactId } : {}),
        }),
        input.timeoutMs ?? this.options.defaultTimeoutMs ?? DEFAULT_ENTITY_CONTRIBUTION_TIMEOUT_MS,
      );
    } catch (error) {
      diagnostics.push(
        diagnostic(
          'warning',
          'missing-capability',
          [],
          'Entity contribution processing did not complete before storyboard import.',
          { reason: error instanceof TimeoutError ? 'timeout' : 'failed' },
        ),
      );
      return undefined;
    }
  }
}

export function injectEntityDecisionRefs(
  payload: CanvasStoryboardPayload,
  decisions: readonly EntityMemoryContributionAutomationDecision[],
): {
  readonly payload: CanvasStoryboardPayload;
  readonly diagnostics: readonly StoryboardValidationDiagnostic[];
} {
  const locations = collectShotCharacterLocations(payload);
  const diagnostics: StoryboardValidationDiagnostic[] = [];
  const matches: DecisionMatch[] = [];

  decisions.forEach((decision, decisionIndex) => {
    const record = decision as DecisionRecord;
    const entityRef = isCreativeEntityRef(decision.entityRef) ? decision.entityRef : undefined;
    const candidateId = readNonEmptyString(record['candidateId']);
    if (!entityRef && !candidateId) return;

    const matched = matchDecisionToLocation(record, decisionIndex, locations, diagnostics);
    if (matched) {
      matches.push({
        decisionIndex,
        location: matched,
        ...(entityRef ? { entityRef } : {}),
        ...(candidateId ? { candidateId } : {}),
      });
    }
  });

  if (matches.length === 0) {
    return { payload, diagnostics };
  }

  const matchByLocation = new Map<string, DecisionMatch>();
  for (const match of matches) {
    const key = locationKey(match.location);
    if (matchByLocation.has(key)) {
      diagnostics.push(
        diagnostic(
          'warning',
          'backfill-target-not-found',
          pathForLocation(match.location),
          'Multiple entity decisions match the same storyboard character; no automatic reference was written.',
          { reason: 'duplicate-decision-target', decisionIndex: match.decisionIndex },
        ),
      );
      matchByLocation.delete(key);
      continue;
    }
    matchByLocation.set(key, match);
  }

  return {
    payload: {
      ...payload,
      scenes: payload.scenes.map((scene, sceneIndex) => ({
        ...scene,
        shotPlans: scene.shotPlans.map((shot, shotIndex) => ({
          ...shot,
          characters: shot.characters.map((character, characterIndex) => {
            const match = matchByLocation.get(`${sceneIndex}:${shotIndex}:${characterIndex}`);
            if (!match) return character;
            return {
              ...character,
              ...(match.entityRef ? { entityRef: match.entityRef, candidateId: undefined } : {}),
              ...(!match.entityRef && match.candidateId ? { candidateId: match.candidateId } : {}),
            };
          }),
        })),
      })),
    },
    diagnostics,
  };
}

function matchDecisionToLocation(
  decision: DecisionRecord,
  decisionIndex: number,
  locations: readonly ShotCharacterLocation[],
  diagnostics: StoryboardValidationDiagnostic[],
): ShotCharacterLocation | undefined {
  const stableMatches =
    matchByStoryboardCharacterId(decision, locations) ??
    matchByShotNumberAndCharacterIndex(decision, locations) ??
    matchByProvenance(decision, locations);

  if (stableMatches) {
    return selectSingleMatch(stableMatches, decisionIndex, diagnostics, 'stable-key');
  }

  const name = readNonEmptyString(decision['name']);
  if (!name) return undefined;
  const nameMatches = locations.filter(
    (location) => normalizeName(location.character.characterName) === normalizeName(name),
  );
  return selectSingleMatch(nameMatches, decisionIndex, diagnostics, 'name-fallback');
}

function matchByStoryboardCharacterId(
  decision: DecisionRecord,
  locations: readonly ShotCharacterLocation[],
): readonly ShotCharacterLocation[] | undefined {
  const shotId = readNonEmptyString(decision['shotId']);
  const storyboardCharacterId = readNonEmptyString(decision['storyboardCharacterId']);
  if (storyboardCharacterId) {
    return locations.filter((location) => location.character.characterId === storyboardCharacterId);
  }
  const characterId = readNonEmptyString(decision['characterId']);
  if (!characterId) return undefined;
  if (!shotId) {
    return locations.filter((location) => location.character.characterId === characterId);
  }
  return locations.filter(
    (location) => readShotId(location) === shotId && location.character.characterId === characterId,
  );
}

function matchByShotNumberAndCharacterIndex(
  decision: DecisionRecord,
  locations: readonly ShotCharacterLocation[],
): readonly ShotCharacterLocation[] | undefined {
  const shotNumber = readFiniteNumber(decision['shotNumber']);
  const characterIndex = readFiniteNumber(decision['characterIndex']);
  if (shotNumber === undefined || characterIndex === undefined) return undefined;
  return locations.filter(
    (location) => location.shotNumber === shotNumber && location.characterIndex === characterIndex,
  );
}

function matchByProvenance(
  decision: DecisionRecord,
  locations: readonly ShotCharacterLocation[],
): readonly ShotCharacterLocation[] | undefined {
  const sourceRef = readNonEmptyString(decision['sourceRef']) ?? readNestedSourceRef(decision);
  if (!sourceRef) return undefined;
  return locations.filter((location) => readCharacterSourceRef(location.character) === sourceRef);
}

function selectSingleMatch(
  matches: readonly ShotCharacterLocation[],
  decisionIndex: number,
  diagnostics: StoryboardValidationDiagnostic[],
  strategy: 'stable-key' | 'name-fallback',
): ShotCharacterLocation | undefined {
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    diagnostics.push(
      diagnostic(
        'warning',
        'backfill-target-not-found',
        [],
        'Entity decision did not match any storyboard character.',
        { reason: 'unlinked', decisionIndex, strategy },
      ),
    );
    return undefined;
  }
  diagnostics.push(
    diagnostic(
      'warning',
      'backfill-target-not-found',
      [],
      'Entity decision matched multiple storyboard characters; no automatic reference was written.',
      {
        reason: strategy === 'name-fallback' ? 'candidate-ambiguous' : 'ambiguous-stable-key',
        decisionIndex,
      },
    ),
  );
  return undefined;
}

function collectShotCharacterLocations(
  payload: CanvasStoryboardPayload,
): readonly ShotCharacterLocation[] {
  return payload.scenes.flatMap((scene, sceneIndex) =>
    scene.shotPlans.flatMap((shot, shotIndex) =>
      shot.characters.map((character, characterIndex) => ({
        sceneIndex,
        shotIndex,
        characterIndex,
        shotNumber: shot.shotNumber,
        character,
      })),
    ),
  );
}

function attachDeliveryDiagnostics(
  payload: CanvasStoryboardPayload,
  diagnostics: readonly StoryboardValidationDiagnostic[],
): CanvasStoryboardPayload {
  if (diagnostics.length === 0) return payload;
  return {
    ...payload,
    diagnostics: [...(payload.diagnostics ?? []), ...diagnostics],
  };
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), timeoutMs);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

class TimeoutError extends Error {
  constructor() {
    super('Storyboard entity contribution processing timed out.');
  }
}

function diagnostic(
  severity: StoryboardValidationDiagnostic['severity'],
  code: StoryboardValidationDiagnostic['code'],
  path: StoryboardValidationDiagnostic['path'],
  message: string,
  details?: Record<string, string | number | boolean | null>,
): StoryboardValidationDiagnostic {
  return {
    severity,
    code,
    path,
    message,
    ...(details ? { details } : {}),
  };
}

function pathForLocation(location: ShotCharacterLocation): readonly (string | number)[] {
  return [
    'scenes',
    location.sceneIndex,
    'shotPlans',
    location.shotIndex,
    'characters',
    location.characterIndex,
  ];
}

function locationKey(location: ShotCharacterLocation): string {
  return `${location.sceneIndex}:${location.shotIndex}:${location.characterIndex}`;
}

function readShotId(location: ShotCharacterLocation): string | undefined {
  return readNonEmptyString(readRecord(location.character)['shotId']);
}

function readCharacterSourceRef(character: ShotCharacter): string | undefined {
  const record = readRecord(character);
  return (
    readNonEmptyString(record['sourceRef']) ??
    readNonEmptyString(record['sourceRefId']) ??
    readNonEmptyString(record['referenceNodeId']) ??
    readNonEmptyString(readRecord(record['provenance'])['sourceRef'])
  );
}

function readNestedSourceRef(decision: DecisionRecord): string | undefined {
  return (
    readNonEmptyString(readRecord(decision['provenance'])['sourceRef']) ??
    readNonEmptyString(readRecord(decision['source'])['sourceRef'])
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function normalizeName(value: string): string {
  return value.trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}
