import type {
  FountainDocument,
  AnyFountainElement,
  Character,
  Transition,
  Centered,
  Section,
  Synopsis,
  Note,
  Lyrics,
} from '../types';
import { navigateToLine } from '../hooks/useVSCodeMessaging';
import { TitlePageRenderer } from './TitlePage';
import { SceneHeadingRenderer } from './SceneHeading';
import { ActionBlock } from './ActionBlock';
import { DialogueBlock } from './DialogueBlock';

interface ScriptRendererProps {
  document: FountainDocument | null;
}

export function ScriptRenderer({ document }: ScriptRendererProps) {
  if (!document) {
    return (
      <div className="empty-state">
        <h2>No Script Loaded</h2>
        <p>Open a .fountain file to preview</p>
      </div>
    );
  }

  const elements = document.elements;
  const rendered: JSX.Element[] = [];

  // Render title page if present
  if (document.titlePage) {
    rendered.push(<TitlePageRenderer key="title-page" titlePage={document.titlePage} />);
  }

  // Group dialogue elements with their character
  let i = 0;
  while (i < elements.length) {
    const el = elements[i];
    if (!el) {
      i++;
      continue;
    }

    switch (el.type) {
      case 'scene_heading':
        rendered.push(<SceneHeadingRenderer key={`scene-${i}`} element={el} />);
        break;

      case 'action':
        rendered.push(<ActionBlock key={`action-${i}`} element={el} />);
        break;

      case 'character': {
        // Collect following dialogue and parentheticals
        const character = el as Character;
        const dialogueElements: AnyFountainElement[] = [];
        let j = i + 1;
        while (j < elements.length) {
          const next = elements[j];
          if (next?.type === 'dialogue' || next?.type === 'parenthetical') {
            dialogueElements.push(next);
            j++;
          } else {
            break;
          }
        }
        rendered.push(
          <DialogueBlock key={`dialogue-${i}`} character={character} elements={dialogueElements} />,
        );
        i = j - 1; // Skip processed elements
        break;
      }

      case 'transition':
        rendered.push(<TransitionRenderer key={`transition-${i}`} element={el as Transition} />);
        break;

      case 'centered':
        rendered.push(<CenteredRenderer key={`centered-${i}`} element={el as Centered} />);
        break;

      case 'section':
        rendered.push(<SectionRenderer key={`section-${i}`} element={el as Section} />);
        break;

      case 'synopsis':
        rendered.push(<SynopsisRenderer key={`synopsis-${i}`} element={el as Synopsis} />);
        break;

      case 'note':
        rendered.push(<NoteRenderer key={`note-${i}`} element={el as Note} />);
        break;

      case 'page_break':
        rendered.push(<div key={`page-break-${i}`} className="page-break" />);
        break;

      case 'lyrics':
        rendered.push(<LyricsRenderer key={`lyrics-${i}`} element={el as Lyrics} />);
        break;

      default:
        // Skip unknown elements
        break;
    }

    i++;
  }

  return <div className="screenplay">{rendered}</div>;
}

// Simple inline renderers for less common elements

function TransitionRenderer({ element }: { element: Transition }) {
  return (
    <div className="transition element" onClick={() => navigateToLine(element.range.start.line)}>
      {element.text}
    </div>
  );
}

function CenteredRenderer({ element }: { element: Centered }) {
  return (
    <div className="centered element" onClick={() => navigateToLine(element.range.start.line)}>
      {element.text}
    </div>
  );
}

function SectionRenderer({ element }: { element: Section }) {
  return (
    <div
      className={`section level-${element.level} element`}
      onClick={() => navigateToLine(element.range.start.line)}
    >
      {element.text}
    </div>
  );
}

function SynopsisRenderer({ element }: { element: Synopsis }) {
  return (
    <div className="synopsis element" onClick={() => navigateToLine(element.range.start.line)}>
      {element.text}
    </div>
  );
}

function NoteRenderer({ element }: { element: Note }) {
  const handleClick = () => navigateToLine(element.range.start.line);

  if (element.assetRef) {
    const { assetRef, resolvedUri } = element;
    const fileName = assetRef.path.split('/').pop() ?? assetRef.path;

    if (assetRef.type === 'image') {
      return (
        <div className="asset-note asset-note--image element" onClick={handleClick}>
          {resolvedUri ? (
            <img src={resolvedUri} alt={fileName} className="asset-thumb" />
          ) : (
            <span className="asset-badge asset-badge--image">🖼 {fileName}</span>
          )}
        </div>
      );
    }

    const icon = assetRef.type === 'video' ? '🎬' : '🎵';
    return (
      <div className="asset-note asset-note--media element" onClick={handleClick}>
        <span className={`asset-badge asset-badge--${assetRef.type}`}>
          {icon} {fileName}
        </span>
      </div>
    );
  }

  return (
    <div className="note element" onClick={handleClick}>
      {element.text}
    </div>
  );
}

function LyricsRenderer({ element }: { element: Lyrics }) {
  return (
    <div className="lyrics element" onClick={() => navigateToLine(element.range.start.line)}>
      {element.text}
    </div>
  );
}
