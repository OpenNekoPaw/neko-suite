import { Button } from '@neko/ui/primitives';
import { normalizeNarrativePreviewFeatureToggles, type StoryGenre } from '@neko/shared';
import { createDefaultPlayRenderers } from './renderers';
import { createPlayRendererRegistry, renderWithPlayRenderer } from './rendererRegistry';
import type {
  NarrativePreviewController,
  NarrativeRuntimeState,
  PlayRendererContext,
} from './types';

export interface NarrativePlayerProps {
  readonly controller: NarrativePreviewController;
  readonly rendererContext?: PlayRendererContext;
}

const GENRES: readonly StoryGenre[] = [
  'illustrated-text',
  'visual-novel',
  'interactive-film',
  'hybrid',
];

const DEFAULT_RENDERER_REGISTRY = createPlayRendererRegistry(createDefaultPlayRenderers());

export function NarrativePlayer({
  controller,
  rendererContext = { variables: controller.state.variables },
}: NarrativePlayerProps): React.ReactElement {
  const state = controller.state;
  const current = state.currentNode;
  const title =
    current?.label ?? current?.scene?.sceneRef ?? current?.nodeId ?? 'Narrative Preview';
  const renderer = DEFAULT_RENDERER_REGISTRY.get(controller.genre);
  const rendererProps = {
    state,
    choices: state.choices,
    context: {
      ...rendererContext,
      variables: state.variables,
      featureToggles: normalizeNarrativePreviewFeatureToggles({
        ...rendererContext.featureToggles,
        ...controller.featureToggles,
      }),
    },
    onChoice: (choiceIndex: number) => controller.advance(choiceIndex),
  };

  return (
    <section
      className="flex h-full min-h-0 flex-col bg-[var(--vscode-editor-background)] text-[var(--vscode-foreground)]"
      data-testid="narrative-player"
      data-status={state.status}
    >
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--vscode-panel-border)] px-3 py-2">
        <select
          aria-label="Genre"
          className="h-7 rounded border border-[var(--vscode-input-border)] bg-[var(--vscode-dropdown-background)] px-2 text-xs"
          value={controller.genre}
          onChange={(event) => controller.setGenre(event.currentTarget.value as StoryGenre)}
        >
          {GENRES.map((genre) => (
            <option key={genre} value={genre}>
              {genre}
            </option>
          ))}
        </select>
        <div className="ml-auto flex items-center gap-2">
          <Button size="sm" variant="secondary" onClick={() => controller.toggleVariablesPanel()}>
            Variables
          </Button>
          <Button size="sm" variant="secondary" onClick={() => controller.toggleHistoryPanel()}>
            History
          </Button>
          <Button size="sm" variant="secondary" onClick={() => controller.toggleFullscreen()}>
            Fullscreen
          </Button>
        </div>
      </header>

      <main className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-h-0 overflow-auto p-4">
          <div className="mx-auto flex max-w-3xl flex-col gap-4">
            <div className="text-xs uppercase tracking-normal text-[var(--vscode-descriptionForeground)]">
              {state.status}
            </div>
            <h1 className="m-0 text-xl font-semibold">{title}</h1>
            {renderWithPlayRenderer(renderer, rendererProps)}
          </div>
        </div>
        <aside className="min-h-0 overflow-auto border-l border-[var(--vscode-panel-border)] p-3 text-xs">
          {controller.variablesPanelOpen && <VariablesPanel state={state} />}
          {controller.historyPanelOpen && <HistoryPanel state={state} />}
          {!controller.variablesPanelOpen && !controller.historyPanelOpen && (
            <p className="m-0 text-[var(--vscode-descriptionForeground)]">No panel selected.</p>
          )}
        </aside>
      </main>

      <footer className="flex items-center gap-2 border-t border-[var(--vscode-panel-border)] px-3 py-2">
        <Button size="sm" variant="secondary" onClick={() => controller.stepBack()}>
          Back
        </Button>
        <Button size="sm" variant="default" onClick={() => controller.start()}>
          Start
        </Button>
        <Button size="sm" variant="secondary" onClick={() => controller.advance()}>
          Next
        </Button>
        <Button size="sm" variant="secondary" onClick={() => controller.reset()}>
          Reset
        </Button>
        <span className="ml-auto text-xs text-[var(--vscode-descriptionForeground)]">
          {state.path.length}/{state.graph?.nodes.length ?? 0}
        </span>
      </footer>
    </section>
  );
}

function VariablesPanel({ state }: { readonly state: NarrativeRuntimeState }): React.ReactElement {
  return (
    <div>
      <h2 className="m-0 mb-2 text-sm font-semibold">Variables</h2>
      <dl className="m-0 grid grid-cols-[1fr_auto] gap-1">
        {Object.entries(state.variables).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="truncate text-[var(--vscode-descriptionForeground)]">{key}</dt>
            <dd className="m-0">{String(value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function HistoryPanel({ state }: { readonly state: NarrativeRuntimeState }): React.ReactElement {
  return (
    <div>
      <h2 className="m-0 mb-2 text-sm font-semibold">History</h2>
      <ol className="m-0 flex flex-col gap-1 pl-4">
        {state.history.map((entry) => (
          <li key={`${entry.nodeId}:${entry.choiceIndex ?? 'auto'}`}>{entry.nodeId}</li>
        ))}
      </ol>
    </div>
  );
}
