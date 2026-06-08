import type { StoryGenre } from '@neko/shared';
import type { PlayRenderer, PlayRendererProps } from './types';

export class PlayRendererRegistry {
  private readonly renderers = new Map<StoryGenre, PlayRenderer>();

  register(renderer: PlayRenderer): void {
    this.renderers.set(renderer.genre, renderer);
  }

  get(genre: StoryGenre): PlayRenderer {
    return this.renderers.get(genre) ?? createUnsupportedRenderer(genre);
  }
}

export function createPlayRendererRegistry(
  renderers: readonly PlayRenderer[] = [],
): PlayRendererRegistry {
  const registry = new PlayRendererRegistry();
  for (const renderer of renderers) {
    registry.register(renderer);
  }
  return registry;
}

export function renderWithPlayRenderer(
  renderer: PlayRenderer,
  props: PlayRendererProps,
): React.ReactNode {
  switch (props.state.status) {
    case 'ended':
      return renderer.renderEnding(props);
    case 'waiting-choice':
      return (
        <>
          {renderer.renderScene(props)}
          {renderer.renderChoice(props)}
        </>
      );
    case 'playing':
    case 'idle':
    case 'error':
      return renderer.renderScene(props);
  }
}

function createUnsupportedRenderer(genre: StoryGenre): PlayRenderer {
  return {
    genre,
    renderScene: (props) => <UnsupportedRendererState requestedGenre={genre} props={props} />,
    renderChoice: () => null,
    renderEnding: (props) => <UnsupportedRendererState requestedGenre={genre} props={props} />,
    renderUnsupported: (props) => <UnsupportedRendererState requestedGenre={genre} props={props} />,
  };
}

function UnsupportedRendererState({
  requestedGenre,
  props,
}: {
  readonly requestedGenre: StoryGenre;
  readonly props: PlayRendererProps;
}): React.ReactElement {
  return (
    <div
      className="rounded border border-[var(--vscode-inputValidation-warningBorder,var(--vscode-panel-border))] p-3"
      data-testid="unsupported-renderer"
    >
      <div className="font-medium">Unsupported renderer</div>
      <div className="text-xs text-[var(--vscode-descriptionForeground)]">{requestedGenre}</div>
      {props.state.currentNode && (
        <div className="mt-2 text-xs text-[var(--vscode-descriptionForeground)]">
          {props.state.currentNode.nodeId}
        </div>
      )}
    </div>
  );
}
