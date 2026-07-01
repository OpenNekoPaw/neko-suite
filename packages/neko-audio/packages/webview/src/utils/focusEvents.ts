import type { KeyboardEvent } from 'react';

export function stopTextInputShortcutPropagation(event: KeyboardEvent<HTMLElement>): void {
  event.stopPropagation();
}
