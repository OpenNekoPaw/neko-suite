import type {
  Character,
  Dialogue,
  Parenthetical,
  AnyFountainElement,
} from '../types';
import { navigateToLine } from '../hooks/useVSCodeMessaging';

interface DialogueBlockProps {
  character: Character;
  elements: AnyFountainElement[];
}

export function DialogueBlock({ character, elements }: DialogueBlockProps) {
  const handleCharacterClick = () => {
    navigateToLine(character.range.start.line);
  };

  return (
    <div className="dialogue-block">
      <div className="character element" onClick={handleCharacterClick}>
        {character.name}
        {character.extension && (
          <span className="extension"> ({character.extension})</span>
        )}
      </div>
      {elements.map((el, index) => {
        if (el.type === 'dialogue') {
          const dialogue = el as Dialogue;
          return (
            <div
              key={index}
              className="dialogue element"
              onClick={() => navigateToLine(dialogue.range.start.line)}
            >
              {dialogue.text}
            </div>
          );
        }
        if (el.type === 'parenthetical') {
          const paren = el as Parenthetical;
          return (
            <div
              key={index}
              className="parenthetical element"
              onClick={() => navigateToLine(paren.range.start.line)}
            >
              ({paren.text})
            </div>
          );
        }
        return null;
      })}
    </div>
  );
}
