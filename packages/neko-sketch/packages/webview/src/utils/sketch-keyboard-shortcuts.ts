import { isEditableTarget } from './editable-target';

export type SketchKeyboardAction =
  | 'deleteSelected'
  | 'escape'
  | 'selectAll'
  | 'undo'
  | 'redo'
  | 'selectBrush'
  | 'selectEraser'
  | 'selectMove'
  | 'selectShape'
  | 'selectZoom'
  | 'selectFill'
  | 'pickColor'
  | 'selectSelect'
  | 'selectTransform';

export function getSketchKeyboardAction(event: KeyboardEvent): SketchKeyboardAction | null {
  if (event.isComposing || isEditableTarget(event.target)) {
    return null;
  }

  const key = event.key.toLowerCase();
  const primaryModifier = event.ctrlKey || event.metaKey;

  if (primaryModifier && !event.altKey) {
    if (key === 'z') {
      return event.shiftKey ? 'redo' : 'undo';
    }
    if (key === 'a' && !event.shiftKey) {
      return 'selectAll';
    }
    return null;
  }

  if (event.altKey || event.shiftKey) {
    return null;
  }

  switch (key) {
    case 'delete':
    case 'backspace':
      return 'deleteSelected';
    case 'escape':
      return 'escape';
    case 'b':
      return 'selectBrush';
    case 'e':
      return 'selectEraser';
    case 'm':
      return 'selectMove';
    case 'v':
      return 'selectShape';
    case 'z':
      return 'selectZoom';
    case 'g':
      return 'selectFill';
    case 'i':
      return 'pickColor';
    case 's':
      return 'selectSelect';
    case 't':
      return 'selectTransform';
    default:
      return null;
  }
}
