import type { SceneHeading } from '../types';
import { navigateToLine } from '../hooks/useVSCodeMessaging';

interface SceneHeadingRendererProps {
  element: SceneHeading;
}

export function SceneHeadingRenderer({ element }: SceneHeadingRendererProps) {
  const handleClick = () => {
    navigateToLine(element.range.start.line);
  };

  const heading = [element.intExt, element.location, element.time].filter(Boolean).join(' - ');

  return (
    <div className="scene-heading element" onClick={handleClick}>
      {heading}
      {element.sceneNumber && <span className="scene-number">#{element.sceneNumber}</span>}
    </div>
  );
}
