import type { Action } from '../types';
import { navigateToLine } from '../hooks/useVSCodeMessaging';

interface ActionBlockProps {
  element: Action;
}

export function ActionBlock({ element }: ActionBlockProps) {
  const handleClick = () => {
    navigateToLine(element.range.start.line);
  };

  return (
    <div
      className={`action element ${element.centered ? 'centered' : ''}`}
      data-line={element.range.start.line}
      onClick={handleClick}
    >
      {element.text}
    </div>
  );
}
