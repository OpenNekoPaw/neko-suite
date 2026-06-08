import type {
  CanvasToPreviewMessage,
  NarrativeAssetRef,
  NarrativeAssetResolver,
  NarrativeAssetResolveResult,
  NarrativeChoiceOption,
  NarrativePreviewFeatureToggles,
  NarrativeRuntimeState,
  NarrativeRuntimeVariables,
  PreviewToCanvasMessage,
  StoryGenre,
} from '@neko/shared';

export type {
  ConditionDiagnostic,
  ConditionEvaluationResult,
  ConditionEvaluationStatus,
  ConditionEvaluator,
  NarrativeChoiceOption,
  NarrativeEndingStats,
  NarrativeHistoryEntry,
  NarrativeRuntimeDiagnostic,
  NarrativeRuntimeDiagnosticCode,
  NarrativeRuntimeOptions,
  NarrativeRuntimeState,
  NarrativeRuntimeStatus,
  NarrativeRuntimeVariables,
  NarrativeVariableValue,
} from '@neko/shared';

export interface NarrativePreviewAdapterPort {
  readonly postMessage: (message: PreviewToCanvasMessage) => void;
}

export interface NarrativePreviewControllerState {
  readonly state: NarrativeRuntimeState;
  readonly genre: StoryGenre;
  readonly featureToggles: NarrativePreviewFeatureToggles;
  readonly fullscreen: boolean;
  readonly variablesPanelOpen: boolean;
  readonly historyPanelOpen: boolean;
}

export interface NarrativePreviewController {
  readonly state: NarrativeRuntimeState;
  readonly genre: StoryGenre;
  readonly featureToggles: NarrativePreviewFeatureToggles;
  readonly fullscreen: boolean;
  readonly variablesPanelOpen: boolean;
  readonly historyPanelOpen: boolean;
  handleMessage(message: CanvasToPreviewMessage): boolean;
  start(): void;
  reset(): void;
  advance(choiceIndex?: number): void;
  stepBack(): void;
  jumpTo(nodeId: string): void;
  setGenre(genre: StoryGenre): void;
  setFeatureToggles(toggles: Partial<NarrativePreviewFeatureToggles>): void;
  setVariables(variables: Readonly<Record<string, unknown>>): void;
  toggleFullscreen(): void;
  toggleVariablesPanel(): void;
  toggleHistoryPanel(): void;
}

export interface PlayRendererContext {
  readonly variables: NarrativeRuntimeVariables;
  readonly featureToggles?: NarrativePreviewFeatureToggles;
  readonly assetResolver?: NarrativeAssetResolver;
  readonly resolvedAssets?: Readonly<Record<string, NarrativeAssetResolveResult>>;
  readonly resolveAsset?: (
    ref: NarrativeAssetRef,
    role?: string,
  ) => Promise<NarrativeAssetResolveResult | undefined>;
}

export interface PlayRendererProps {
  readonly state: NarrativeRuntimeState;
  readonly choices: readonly NarrativeChoiceOption[];
  readonly context: PlayRendererContext;
  readonly onChoice: (choiceIndex: number) => void;
}

export interface PlayRenderer {
  readonly genre: StoryGenre;
  renderScene(props: PlayRendererProps): React.ReactNode;
  renderChoice(props: PlayRendererProps): React.ReactNode;
  renderEnding(props: PlayRendererProps): React.ReactNode;
  renderUnsupported(props: PlayRendererProps): React.ReactNode;
}
