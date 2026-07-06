/*
 * Minimal host-agnostic contracts used by the Story headless provider.
 *
 * Keep these structural shapes aligned with @neko/shared, but do not import the
 * @neko/shared main barrel here. The main barrel pulls broad shared runtime/UI
 * source into this composite package and makes the TUI provider depend on more
 * than its protocol surface.
 */

export interface AgentCapabilityContext {
  readonly extensionContext: unknown;
  readonly locale?: string;
}

export interface AgentCapabilityProvider {
  readonly id: string;
  readonly version: string;
  readonly hostRequirements?: readonly AgentCapabilityHostRequirement[];
  readonly requirements?: AgentCapabilityRuntimeRequirements;
  getTools(context: AgentCapabilityContext): Tool[];
  getPromptFragments?(context: AgentCapabilityContext): PromptFragment[];
  getReferenceContributors?(context: AgentCapabilityContext): readonly AgentReferenceContributor[];
}

export interface AgentCapabilityHostRequirement {
  readonly host: 'vscode' | 'cli' | 'tui';
  readonly optional?: boolean;
  readonly reason?: string;
}

export interface AgentCapabilityRuntimeRequirements {
  readonly vscode?: boolean;
  readonly activeEditor?: boolean;
  readonly mediaService?: boolean;
  readonly engineBridge?: boolean;
  readonly contentAccess?: boolean;
  readonly writableProject?: boolean;
}

export interface PromptFragment {
  readonly id: string;
  readonly content: string;
  readonly priority?: number;
  readonly locales?: Readonly<Record<string, PromptFragmentLocalizedContent>>;
}

export interface PromptFragmentLocalizedContent {
  readonly content: string;
}

export interface ToolParameters {
  type: 'object';
  properties: Record<string, ToolParameterProperty>;
  required?: string[];
  anyOf?: Array<{ required: string[] }>;
}

export interface ToolParameterProperty {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'array' | 'object';
  description?: string;
  enum?: string[];
  items?: Record<string, unknown>;
  properties?: Record<string, ToolParameterProperty>;
  required?: string[];
  [key: string]: unknown;
}

export interface Tool {
  readonly name: string;
  readonly description: string;
  readonly parameters: ToolParameters;
  readonly category: 'document';
  readonly safetyKind?: 'read-only-query';
  readonly isReadOnly?: boolean;
  readonly isConcurrencySafe?: boolean;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}

export interface ToolResult {
  readonly success: boolean;
  readonly data?: unknown;
  readonly error?: string;
}

export type AgentReferenceCandidateKind =
  'file' | 'asset' | 'story-scene' | 'canvas' | 'document' | 'media' | 'artifact';

export type AgentReferenceMetadataPrimitive = string | number | boolean | null;

export type AgentReferenceMetadataValue =
  | AgentReferenceMetadataPrimitive
  | readonly AgentReferenceMetadataValue[]
  | { readonly [key: string]: AgentReferenceMetadataValue };

export interface AgentReferenceCandidate {
  readonly id: string;
  readonly label: string;
  readonly source: string;
  readonly kind: AgentReferenceCandidateKind;
  readonly insertText: string;
  readonly description?: string;
  readonly path?: string;
  readonly metadata?: { readonly [key: string]: AgentReferenceMetadataValue };
}

export interface AgentReferenceSearchRequest {
  readonly query: string;
  readonly limit: number;
  readonly workspaceRoot?: string;
}

export interface AgentReferenceSearchResult {
  readonly candidates: readonly AgentReferenceCandidate[];
  readonly diagnostics: readonly AgentCapabilityAvailabilityDiagnostic[];
}

export interface AgentReferenceContributor {
  readonly id: string;
  readonly displayName: string;
  search(request: AgentReferenceSearchRequest): Promise<AgentReferenceSearchResult>;
}

export interface AgentCapabilityAvailabilityDiagnostic {
  readonly level: 'info' | 'warn' | 'error';
  readonly providerId: string;
  readonly contributionKind:
    | 'provider'
    | 'tool'
    | 'skill'
    | 'toolGroup'
    | 'promptFragment'
    | 'providerCard'
    | 'referenceContributor';
  readonly contributionName?: string;
  readonly code: string;
  readonly reason: string;
  readonly message: string;
  readonly requirement?: string;
  readonly host?: 'vscode' | 'cli' | 'tui';
}

export interface NekoStoryScriptIndex {
  readonly uri: string;
  readonly total_lines: number;
  readonly scenes: readonly NekoStorySceneEntry[];
  readonly characters: readonly NekoStoryCharacterEntry[];
}

export interface NekoStorySceneEntry {
  readonly id: string;
  readonly heading: string;
  readonly sceneId: string;
  readonly sceneTitle: string;
  readonly intExt: string | null;
  readonly timeOfDay: string | null;
  readonly location: string;
  readonly time: string | null;
  readonly sceneNumber: string | null;
  readonly sceneCharacters: readonly string[];
  readonly actionSummary: string;
  readonly estimatedDuration: number;
  readonly directives: readonly NekoStoryDirectiveEntry[];
  readonly line_start: number;
  readonly line_end: number;
}

export interface NekoStoryDirectiveEntry {
  readonly category: string;
  readonly key: string;
  readonly value: string;
}

export interface NekoStoryCharacterEntry {
  readonly name: string;
  readonly first_line: number;
  readonly scene_ids: readonly string[];
}

export interface NekoStoryAPI {
  parseScript(content: string): unknown;
  convertToTimeline(fountainContent: string, projectName?: string): unknown;
  getScriptIndex(uriOrPath: string): NekoStoryScriptIndex | undefined;
  getAllScriptIndices?(): readonly NekoStoryScriptIndex[];
  getCharacterRegistry(uriOrPath?: string): unknown;
  resolveCharacter(name: string, uriOrPath?: string): unknown;
  generateScenePlans(
    uriOrPath: string,
    sceneIds?: readonly string[],
  ): readonly StoryScenePlan[] | undefined;
  generateShotPlan(
    uriOrPath: string,
    sceneId: string,
    recommendedShotCount?: number,
  ): readonly StoryShotPlan[] | undefined;
}

export interface StoryScenePlan {
  readonly sceneId: string;
  readonly sceneTitle?: string;
  readonly summary?: string;
  readonly recommendedShotCount?: number;
  readonly shotPlans?: readonly StoryShotPlan[];
}

export type ShotScale = 'ECU' | 'CU' | 'MCU' | 'MS' | 'MLS' | 'LS' | 'VLS' | 'ELS' | 'OTS' | 'POV';

export type CameraMovement =
  | 'static'
  | 'pan'
  | 'tilt'
  | 'zoom-in'
  | 'zoom-out'
  | 'dolly'
  | 'dolly-in'
  | 'dolly-out'
  | 'handheld'
  | 'crane';

export type CameraAngle = 'eye-level' | 'high-angle' | 'low-angle' | 'bird-eye' | 'dutch';

export interface StoryShotPlan {
  readonly shotId?: string;
  readonly shotNumber?: number;
  readonly duration?: number;
  readonly visualDescription?: string;
  readonly characters?: readonly ShotCharacter[];
  readonly shotScale?: ShotScale;
  readonly cameraMovement?: CameraMovement;
  readonly cameraAngle?: CameraAngle;
  readonly characterAction?: string;
  readonly emotion?: readonly string[];
  readonly sceneTags?: readonly string[];
  readonly dialogue?: string;
  readonly voiceOver?: string;
  readonly soundCue?: string;
  readonly generationPrompt?: string;
  readonly visualStyle?: string;
  readonly referenceImagePath?: string;
}

export interface ShotCharacter {
  readonly characterId?: string;
  readonly characterName: string;
  readonly candidateId?: string;
  readonly role?: string;
  readonly action?: string;
  readonly referenceNodeId?: string;
  readonly referenceChain?: readonly string[];
  readonly emotion?: string;
  readonly continuityNotes?: string;
  readonly appearanceNotes?: string;
}

export const TOOL_NAMES_STORY = {
  GET_SCRIPT_INDEX: 'GetScriptIndex',
  SEARCH_SCRIPT_INDEX: 'SearchScriptIndex',
  GENERATE_SCENE_PLAN: 'GenerateScenePlan',
  GENERATE_SHOT_PLAN: 'GenerateShotPlan',
  STORY_APPLY_SUGGESTION: 'story_apply_suggestion',
} as const;
