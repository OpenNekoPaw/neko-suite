import { useMemo } from 'react';
import { useKeyboardDispatcher, type ShortcutBinding } from '@neko/ui/keyboard';

export interface ModelKeyboardState extends Record<string, unknown> {
  readonly hasSelection: boolean;
  readonly isKeyboardFocused: boolean;
}

export interface UseModelKeyboardControllerOptions {
  readonly state: ModelKeyboardState;
  readonly onClearSelection: () => void;
  readonly onResetView: () => void;
  readonly target?: EventTarget | null;
}

const EDITOR_SCOPE = 'editor';
const VIEWPORT_SCOPE = 'viewport';

export function useModelKeyboardController({
  onClearSelection,
  onResetView,
  state,
  target,
}: UseModelKeyboardControllerOptions): void {
  const bindings = useMemo<readonly ShortcutBinding<ModelKeyboardState>[]>(
    () => [
      createEditorBinding('escape-clear-selection', 'Escape', onClearSelection, {
        when: (current) => current.hasSelection,
      }),
      createViewportBinding('reset-view', 'Digit0', onResetView),
    ],
    [onClearSelection, onResetView],
  );

  useKeyboardDispatcher(bindings, state, {
    enabled: state.isKeyboardFocused,
    target,
  });
}

function createEditorBinding(
  id: string,
  key:
    | ShortcutBinding<ModelKeyboardState>['key']['key']
    | ShortcutBinding<ModelKeyboardState>['key'],
  run: () => void,
  options: Pick<ShortcutBinding<ModelKeyboardState>, 'when'> = {},
): ShortcutBinding<ModelKeyboardState> {
  return {
    id,
    key: typeof key === 'string' ? { key } : key,
    scope: EDITOR_SCOPE,
    run,
    when: options.when,
  };
}

function createViewportBinding(
  id: string,
  key:
    | ShortcutBinding<ModelKeyboardState>['key']['key']
    | ShortcutBinding<ModelKeyboardState>['key'],
  run: () => void,
): ShortcutBinding<ModelKeyboardState> {
  return {
    id,
    key: typeof key === 'string' ? { key } : key,
    scope: VIEWPORT_SCOPE,
    run,
  };
}
