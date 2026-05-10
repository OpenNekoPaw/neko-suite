// =============================================================================
// Creative Entity Asset Composition
//
// Shared contracts for composing creative entities with project, market, shared,
// or external asset representations.
// =============================================================================

export type CreativeEntityKind = 'character' | 'scene' | 'object' | 'location' | 'style';

export type CreativeEntityStatus = 'candidate' | 'confirmed' | 'deprecated';

export interface CreativeEntity {
  readonly id: string;
  readonly kind: CreativeEntityKind;
  readonly canonicalName: string;
  readonly displayName?: string;
  readonly aliases: readonly string[];
  readonly status: CreativeEntityStatus;
  readonly metadata?: Record<string, unknown>;
}

export interface CreativeEntityQuery {
  readonly kind?: CreativeEntityKind;
  readonly status?: CreativeEntityStatus;
  readonly text?: string;
}

export interface CreativeEntityRegistry {
  list(query?: CreativeEntityQuery): readonly CreativeEntity[] | Promise<readonly CreativeEntity[]>;
  get(id: string): CreativeEntity | undefined | Promise<CreativeEntity | undefined>;
  resolveByName(
    name: string,
    kind?: CreativeEntityKind,
  ): CreativeEntity | undefined | Promise<CreativeEntity | undefined>;
}

export type EntityAssetBindingRole =
  | 'portrait'
  | 'reference'
  | 'live2d'
  | 'live3d'
  | 'voice'
  | 'motion'
  | 'style';

export type EntityAssetBindingStatus = 'suggested' | 'confirmed' | 'rejected';

export type EntityAssetBindingSource =
  | 'user'
  | 'importer'
  | 'story'
  | 'canvas'
  | 'agent'
  | 'matcher';

export interface EntityAssetBinding {
  readonly id: string;
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
  readonly assetRef: string;
  readonly role: EntityAssetBindingRole;
  readonly isDefault?: boolean;
  readonly status: EntityAssetBindingStatus;
  readonly source: EntityAssetBindingSource;
  readonly confidence?: number;
  readonly updatedAt: string;
}

export interface EntityAssetBindingFile {
  readonly version: 1;
  readonly bindings: readonly EntityAssetBinding[];
}

export type RepresentationKind =
  | 'portrait'
  | 'reference'
  | 'live2d'
  | 'live3d'
  | 'voice'
  | 'motion'
  | 'video';

export type RepresentationTarget = 'story' | 'canvas' | 'agent' | 'live' | 'cut';

export interface RepresentationResolveRequest {
  readonly entityId: string;
  readonly target: RepresentationTarget;
  readonly preferredKind?: RepresentationKind;
  readonly fallbackOrder?: readonly RepresentationKind[];
  readonly allowFallback?: boolean;
}

export interface ResolvedRepresentationFile {
  readonly role: RepresentationFileRole;
  readonly assetRef: string;
  readonly fileId?: string;
  readonly path?: string;
  readonly mediaType?: string;
}

export interface AssetFederationSemantics {
  readonly capabilities?: readonly string[];
  readonly files?: readonly ResolvedRepresentationFile[];
  readonly metadata?: Record<string, unknown>;
}

export interface AssetFederationCapabilityProvider {
  describeAsset(ref: ResolvedAssetRef): Promise<AssetFederationSemantics | undefined>;
}

export type RepresentationResolveResult =
  | {
      readonly status: 'resolved';
      readonly entityId: string;
      readonly assetRef: string;
      readonly assetEntityId?: string;
      readonly resolvedKind: RepresentationKind;
      readonly fallback: boolean;
      readonly role: EntityAssetBindingRole | RepresentationKind;
      readonly files: readonly ResolvedRepresentationFile[];
      readonly capabilities: readonly string[];
    }
  | {
      readonly status: 'missing-representation';
      readonly entityId: string;
      readonly missingKinds: readonly RepresentationKind[];
      readonly suggestedActions: readonly MissingRepresentationAction[];
    };

export type MissingRepresentationAction = 'generate' | 'import' | 'bind-existing' | 'dismiss';

export const DEFAULT_REPRESENTATION_FALLBACKS: Readonly<
  Record<RepresentationTarget, readonly RepresentationKind[]>
> = {
  story: ['reference', 'portrait'],
  canvas: ['portrait', 'reference', 'live2d', 'live3d'],
  agent: ['reference', 'portrait', 'live2d', 'live3d'],
  live: ['live3d', 'live2d'],
  cut: ['video', 'live2d', 'live3d', 'portrait'],
} as const;

export type AssetRefScheme = 'project' | 'market' | 'shared' | 'external';

export interface ParsedAssetRef {
  readonly scheme: AssetRefScheme;
  readonly raw: string;
  readonly authority?: string;
  readonly path: string;
  readonly version?: string;
  /** Source-specific qualifiers such as variant, channel, entitlement hint, or rendition. */
  readonly query?: Record<string, string>;
}

export interface AssetRefValidation {
  readonly valid: boolean;
  readonly reason?: string;
}

export interface ResolvedAssetRef {
  readonly ref: string;
  /** Parsed URI scheme from the original reference. */
  readonly scheme: AssetRefScheme;
  /** Resolved backend after aliases, mirrors, local forks, or redirects. */
  readonly source: AssetRefScheme;
  readonly readonly: boolean;
  readonly assetEntityId?: string;
  readonly uri?: string;
  readonly localPath?: string;
  readonly capabilities?: readonly string[];
}

export interface AssetRefResolver {
  parse(ref: string): ParsedAssetRef;
  validate(ref: string): AssetRefValidation;
  resolve(ref: string): Promise<ResolvedAssetRef>;
}

export type WellKnownVisualFactKey =
  | 'hair'
  | 'outfit'
  | 'age'
  | 'style'
  | 'expression'
  | 'body'
  | 'accessory'
  | 'skin_tone'
  | 'eye_color'
  | 'height'
  | 'scar';

export type VisualFactKey = WellKnownVisualFactKey | (string & {});

export interface VisualFactSuggestion {
  readonly key: VisualFactKey;
  readonly value: string;
  readonly confidence?: number;
  readonly accepted?: boolean;
}

export type VisualIdentityDraftSource = 'story' | 'canvas' | 'agent';

export type VisualIdentityDraftStatus = 'drafting' | 'selected' | 'applied' | 'discarded';

export interface VisualIdentityDraft {
  readonly id: string;
  readonly characterId: string;
  readonly source: VisualIdentityDraftSource;
  readonly prompt: string;
  readonly generatedAssetIds: readonly string[];
  readonly selectedAssetId?: string;
  readonly extractedVisualFacts?: readonly VisualFactSuggestion[];
  readonly status: VisualIdentityDraftStatus;
}

export interface VisualIdentityDraftFile {
  readonly version: 1;
  readonly drafts: readonly VisualIdentityDraft[];
}

export type EntityAssetRequirementSource = 'story' | 'canvas' | 'agent' | 'live';

export type EntityAssetRequirementStatus =
  | 'missing'
  | 'suggested'
  | 'generated'
  | 'bound'
  | 'dismissed';

export interface EntityAssetRequirement {
  readonly id: string;
  readonly entityId: string;
  readonly entityKind: CreativeEntityKind;
  readonly source: EntityAssetRequirementSource;
  readonly sourceRef: string;
  readonly requiredKinds: readonly RepresentationKind[];
  readonly status: EntityAssetRequirementStatus;
}

export interface EntityAssetRequirementFile {
  readonly version: 1;
  readonly requirements: readonly EntityAssetRequirement[];
}

export type RepresentationFileRole =
  | 'main'
  | 'model'
  | 'texture'
  | 'rig'
  | 'skeleton'
  | 'physics'
  | 'expression'
  | 'motion'
  | 'material'
  | 'voice'
  | 'lipsync'
  | 'thumbnail'
  | 'calibration'
  | 'tracking-profile'
  | 'source';

export const CREATIVE_ENTITY_KINDS: readonly CreativeEntityKind[] = [
  'character',
  'scene',
  'object',
  'location',
  'style',
] as const;

export const ENTITY_ASSET_BINDING_ROLES: readonly EntityAssetBindingRole[] = [
  'portrait',
  'reference',
  'live2d',
  'live3d',
  'voice',
  'motion',
  'style',
] as const;

export const REPRESENTATION_KINDS: readonly RepresentationKind[] = [
  'portrait',
  'reference',
  'live2d',
  'live3d',
  'voice',
  'motion',
  'video',
] as const;

export const ASSET_REF_SCHEMES: readonly AssetRefScheme[] = [
  'project',
  'market',
  'shared',
  'external',
] as const;

export const WELL_KNOWN_VISUAL_FACT_KEYS: readonly WellKnownVisualFactKey[] = [
  'hair',
  'outfit',
  'age',
  'style',
  'expression',
  'body',
  'accessory',
  'skin_tone',
  'eye_color',
  'height',
  'scar',
] as const;

export const REPRESENTATION_FILE_ROLES: readonly RepresentationFileRole[] = [
  'main',
  'model',
  'texture',
  'rig',
  'skeleton',
  'physics',
  'expression',
  'motion',
  'material',
  'voice',
  'lipsync',
  'thumbnail',
  'calibration',
  'tracking-profile',
  'source',
] as const;

export function isCreativeEntityKind(value: unknown): value is CreativeEntityKind {
  return includesString(CREATIVE_ENTITY_KINDS, value);
}

export function isRepresentationKind(value: unknown): value is RepresentationKind {
  return includesString(REPRESENTATION_KINDS, value);
}

export function isAssetRefScheme(value: unknown): value is AssetRefScheme {
  return includesString(ASSET_REF_SCHEMES, value);
}

export function isEntityAssetBindingRole(value: unknown): value is EntityAssetBindingRole {
  return includesString(ENTITY_ASSET_BINDING_ROLES, value);
}

export function isRepresentationFileRole(value: unknown): value is RepresentationFileRole {
  return includesString(REPRESENTATION_FILE_ROLES, value);
}

export function isEntityAssetBinding(value: unknown): value is EntityAssetBinding {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['entityId'] === 'string' &&
    isCreativeEntityKind(value['entityKind']) &&
    typeof value['assetRef'] === 'string' &&
    isEntityAssetBindingRole(value['role']) &&
    isEntityAssetBindingStatus(value['status']) &&
    isEntityAssetBindingSource(value['source']) &&
    typeof value['updatedAt'] === 'string'
  );
}

export function isEntityAssetBindingFile(value: unknown): value is EntityAssetBindingFile {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    Array.isArray(value['bindings']) &&
    value['bindings'].every((binding) => isEntityAssetBinding(binding))
  );
}

export function isVisualIdentityDraftFile(value: unknown): value is VisualIdentityDraftFile {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    Array.isArray(value['drafts']) &&
    value['drafts'].every((draft) => isVisualIdentityDraft(draft))
  );
}

export function isEntityAssetRequirementFile(value: unknown): value is EntityAssetRequirementFile {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    Array.isArray(value['requirements']) &&
    value['requirements'].every((requirement) => isEntityAssetRequirement(requirement))
  );
}

function isEntityAssetBindingStatus(value: unknown): value is EntityAssetBindingStatus {
  return value === 'suggested' || value === 'confirmed' || value === 'rejected';
}

function isEntityAssetBindingSource(value: unknown): value is EntityAssetBindingSource {
  return (
    value === 'user' ||
    value === 'importer' ||
    value === 'story' ||
    value === 'canvas' ||
    value === 'agent' ||
    value === 'matcher'
  );
}

function isVisualIdentityDraft(value: unknown): value is VisualIdentityDraft {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['characterId'] === 'string' &&
    isVisualIdentityDraftSource(value['source']) &&
    typeof value['prompt'] === 'string' &&
    Array.isArray(value['generatedAssetIds']) &&
    value['generatedAssetIds'].every((item) => typeof item === 'string') &&
    isVisualIdentityDraftStatus(value['status'])
  );
}

function isEntityAssetRequirement(value: unknown): value is EntityAssetRequirement {
  if (!isRecord(value)) return false;
  return (
    typeof value['id'] === 'string' &&
    typeof value['entityId'] === 'string' &&
    isCreativeEntityKind(value['entityKind']) &&
    isEntityAssetRequirementSource(value['source']) &&
    typeof value['sourceRef'] === 'string' &&
    Array.isArray(value['requiredKinds']) &&
    value['requiredKinds'].every((kind) => isRepresentationKind(kind)) &&
    isEntityAssetRequirementStatus(value['status'])
  );
}

function isVisualIdentityDraftSource(value: unknown): value is VisualIdentityDraftSource {
  return value === 'story' || value === 'canvas' || value === 'agent';
}

function isVisualIdentityDraftStatus(value: unknown): value is VisualIdentityDraftStatus {
  return (
    value === 'drafting' || value === 'selected' || value === 'applied' || value === 'discarded'
  );
}

function isEntityAssetRequirementSource(value: unknown): value is EntityAssetRequirementSource {
  return value === 'story' || value === 'canvas' || value === 'agent' || value === 'live';
}

function isEntityAssetRequirementStatus(value: unknown): value is EntityAssetRequirementStatus {
  return (
    value === 'missing' ||
    value === 'suggested' ||
    value === 'generated' ||
    value === 'bound' ||
    value === 'dismissed'
  );
}

function includesString<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.includes(value as T);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
