/**
 * DOM focus helpers shared by keyboard command dispatchers.
 */

export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }

  const element = target.closest(
    'input, textarea, select, [contenteditable=""], [contenteditable="true"]',
  );
  if (!element) {
    return false;
  }

  if (element instanceof HTMLInputElement) {
    return !isNonTextInput(element);
  }

  return true;
}

function isNonTextInput(input: HTMLInputElement): boolean {
  switch (input.type) {
    case 'button':
    case 'checkbox':
    case 'color':
    case 'file':
    case 'image':
    case 'radio':
    case 'range':
    case 'reset':
    case 'submit':
      return true;
    default:
      return false;
  }
}
