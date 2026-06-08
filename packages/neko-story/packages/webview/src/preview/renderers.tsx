import {
  normalizeNarrativePreviewFeatureToggles,
  type NarrativeAssetRef,
  type NarrativeAssetResolver,
  type StoryGenre,
} from '@neko/shared';
import type { PlayRenderer, PlayRendererProps } from './types';

export function createDefaultPlayRenderers(): readonly PlayRenderer[] {
  return [
    createIllustratedTextRenderer(),
    createVisualNovelRenderer(),
    createInteractiveFilmRenderer(),
  ];
}

export function createIllustratedTextRenderer(): PlayRenderer {
  return {
    genre: 'illustrated-text',
    renderScene: (props) => (
      <article className="flex flex-col gap-3" data-testid="illustrated-text-renderer">
        <SceneTitle props={props} />
        <SceneBody props={props} />
        <AssetState props={props} field="backgroundRef" />
      </article>
    ),
    renderChoice: (props) => <InlineChoices props={props} />,
    renderEnding: (props) => <EndingState props={props} genre="illustrated-text" />,
    renderUnsupported: (props) => <UnsupportedState props={props} genre="illustrated-text" />,
  };
}

export function createVisualNovelRenderer(): PlayRenderer {
  return {
    genre: 'visual-novel',
    renderScene: (props) => (
      <div
        className="relative min-h-[360px] overflow-hidden rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editorWidget-background,var(--vscode-sideBar-background))]"
        data-testid="visual-novel-renderer"
      >
        <BackgroundLayer props={props} />
        <CharacterLayer props={props} />
        <div className="absolute inset-x-4 bottom-4 rounded border border-[var(--vscode-panel-border)] bg-[color-mix(in_srgb,var(--vscode-editor-background)_88%,transparent)] p-3">
          <SceneTitle props={props} />
          <SceneBody props={props} />
        </div>
      </div>
    ),
    renderChoice: (props) => <DialogueBoxChoices props={props} />,
    renderEnding: (props) => <EndingState props={props} genre="visual-novel" />,
    renderUnsupported: (props) => <UnsupportedState props={props} genre="visual-novel" />,
  };
}

export function createInteractiveFilmRenderer(): PlayRenderer {
  return {
    genre: 'interactive-film',
    renderScene: (props) => (
      <div
        className="relative aspect-video overflow-hidden rounded border border-[var(--vscode-panel-border)] bg-black"
        data-testid="interactive-film-renderer"
      >
        <VideoLayer props={props} />
        <div className="absolute inset-x-0 bottom-0 bg-black/70 p-3 text-white">
          <SceneTitle props={props} />
        </div>
      </div>
    ),
    renderChoice: (props) => <OverlayChoices props={props} />,
    renderEnding: (props) => <EndingState props={props} genre="interactive-film" />,
    renderUnsupported: (props) => <UnsupportedState props={props} genre="interactive-film" />,
  };
}

export async function resolveRendererAsset(
  resolver: NarrativeAssetResolver | undefined,
  ref: NarrativeAssetRef | undefined,
  role: string,
) {
  if (!resolver || !ref) return undefined;
  return resolver.resolve(ref, 'interactive-preview', {
    role: role === 'video' ? 'preview' : 'thumbnail',
  });
}

function SceneTitle({ props }: { readonly props: PlayRendererProps }): React.ReactElement {
  const node = props.state.currentNode;
  return <h2 className="m-0 text-base font-semibold">{node?.label ?? node?.nodeId ?? 'Scene'}</h2>;
}

function SceneBody({ props }: { readonly props: PlayRendererProps }): React.ReactElement {
  const node = props.state.currentNode;
  const text = node?.scene?.sceneRef ?? node?.label ?? 'No Fountain scene loaded.';
  const toggles = normalizeNarrativePreviewFeatureToggles(props.context.featureToggles);
  return (
    <p
      className="m-0 text-sm leading-6 text-[var(--vscode-foreground)]"
      data-typewriter={toggles.typewriterEffect ? 'enabled' : 'disabled'}
    >
      {text}
    </p>
  );
}

function AssetState({
  props,
  field,
}: {
  readonly props: PlayRendererProps;
  readonly field: 'backgroundRef' | 'bgm';
}): React.ReactElement | null {
  const ref = props.state.currentNode?.scene?.[field];
  if (!ref) return null;
  const key = assetKey(ref);
  const resolved = props.context.resolvedAssets?.[key];
  return (
    <div
      className="text-xs text-[var(--vscode-descriptionForeground)]"
      data-testid={`${field}-state`}
    >
      {resolved?.status ?? 'unresolved'}: {'path' in ref ? ref.path : key}
    </div>
  );
}

function BackgroundLayer({ props }: { readonly props: PlayRendererProps }): React.ReactElement {
  const ref = props.state.currentNode?.scene?.backgroundRef;
  const resolved = ref ? props.context.resolvedAssets?.[assetKey(ref)] : undefined;
  if (!resolved?.url) {
    return <div className="absolute inset-0 bg-[var(--vscode-sideBar-background)]" />;
  }
  return <img className="absolute inset-0 h-full w-full object-cover" src={resolved.url} alt="" />;
}

function CharacterLayer({ props }: { readonly props: PlayRendererProps }): React.ReactElement {
  const characters = props.state.currentNode?.scene?.characters ?? [];
  const toggles = normalizeNarrativePreviewFeatureToggles(props.context.featureToggles);
  return (
    <div
      className="absolute inset-x-0 bottom-20 flex justify-center gap-4"
      data-expression-match={toggles.autoExpressionMatch ? 'enabled' : 'disabled'}
      data-performance={toggles.live2dPerformance ? 'live2d' : 'static'}
    >
      {characters.map((character) => (
        <div
          key={character}
          className="rounded border border-[var(--vscode-panel-border)] bg-[var(--vscode-editor-background)] px-3 py-2 text-xs"
        >
          {character}
        </div>
      ))}
    </div>
  );
}

function VideoLayer({ props }: { readonly props: PlayRendererProps }): React.ReactElement {
  const node = props.state.currentNode;
  const videoRef = readNarrativeAssetRef(node?.data['videoRef']) ?? node?.scene?.backgroundRef;
  const resolved = videoRef ? props.context.resolvedAssets?.[assetKey(videoRef)] : undefined;
  if (!resolved?.url) {
    return (
      <div
        className="grid h-full place-items-center text-xs text-white"
        data-testid="video-missing"
      >
        Video unavailable
      </div>
    );
  }
  return <video className="h-full w-full object-cover" src={resolved.url} controls />;
}

function InlineChoices({ props }: { readonly props: PlayRendererProps }): React.ReactElement {
  return <ChoiceList props={props} layout="inline" />;
}

function DialogueBoxChoices({ props }: { readonly props: PlayRendererProps }): React.ReactElement {
  return <ChoiceList props={props} layout="dialogue" />;
}

function OverlayChoices({ props }: { readonly props: PlayRendererProps }): React.ReactElement {
  return <ChoiceList props={props} layout="overlay" />;
}

function ChoiceList({
  props,
  layout,
}: {
  readonly props: PlayRendererProps;
  readonly layout: string;
}): React.ReactElement {
  const toggles = normalizeNarrativePreviewFeatureToggles(props.context.featureToggles);
  const visibleChoices = props.choices
    .map((choice, index) => ({ choice, index }))
    .filter(({ choice }) => !choice.disabled || toggles.showLockedChoices);

  return (
    <div className="flex flex-col gap-2" data-testid={`${layout}-choices`}>
      {visibleChoices.map(({ choice, index }) => (
        <button
          key={choice.connection.connectionId}
          type="button"
          disabled={choice.disabled}
          className="rounded border border-[var(--vscode-panel-border)] px-3 py-2 text-left text-sm disabled:opacity-50"
          onClick={() => props.onChoice(index)}
        >
          {choice.label}
        </button>
      ))}
    </div>
  );
}

function EndingState({
  props,
  genre,
}: {
  readonly props: PlayRendererProps;
  readonly genre: StoryGenre;
}): React.ReactElement {
  return (
    <div
      className="rounded border border-[var(--vscode-panel-border)] p-3"
      data-testid={`${genre}-ending`}
    >
      <div className="font-medium">{props.state.endingStats?.endingLabel ?? 'Ending'}</div>
      <div className="text-xs text-[var(--vscode-descriptionForeground)]">
        {props.state.endingStats?.visitedCount ?? 0}/{props.state.endingStats?.totalNodes ?? 0}
      </div>
    </div>
  );
}

function UnsupportedState({
  props,
  genre,
}: {
  readonly props: PlayRendererProps;
  readonly genre: StoryGenre;
}): React.ReactElement {
  return (
    <div data-testid={`${genre}-unsupported`}>
      {props.state.currentNode?.nodeId ?? 'unsupported'}
    </div>
  );
}

function readNarrativeAssetRef(value: unknown): NarrativeAssetRef | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return record['kind'] === 'relative-path' && typeof record['path'] === 'string'
    ? (record as unknown as NarrativeAssetRef)
    : undefined;
}

function assetKey(ref: NarrativeAssetRef): string {
  return JSON.stringify(ref);
}
