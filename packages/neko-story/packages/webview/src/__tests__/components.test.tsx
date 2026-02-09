import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { mockPostMessage } from './setup';
import { ScriptRenderer } from '../components/ScriptRenderer';
import type {
  FountainDocument,
  SceneHeading,
  Action,
  Character,
  Dialogue,
  Parenthetical,
  Transition,
  Centered,
  Section,
  Synopsis,
  Note,
  Lyrics,
  TitlePage,
  PageBreak,
} from '../types';

// Helper to create a range
function range(startLine: number, endLine?: number) {
  return {
    start: { line: startLine, character: 0 },
    end: { line: endLine ?? startLine, character: 0 },
  };
}

beforeEach(() => {
  mockPostMessage.mockClear();
});

describe('ScriptRenderer', () => {
  it('renders empty state when document is null', () => {
    render(<ScriptRenderer document={null} />);
    expect(screen.getByText('No Script Loaded')).toBeInTheDocument();
    expect(
      screen.getByText('Open a .fountain, .nks, or .story file to preview')
    ).toBeInTheDocument();
  });

  it('renders empty screenplay when document has no elements', () => {
    const doc: FountainDocument = { titlePage: null, elements: [] };
    const { container } = render(<ScriptRenderer document={doc} />);
    expect(container.querySelector('.screenplay')).toBeInTheDocument();
  });

  it('renders scene heading', () => {
    const heading: SceneHeading = {
      type: 'scene_heading',
      intExt: 'INT',
      location: 'COFFEE SHOP',
      time: 'DAY',
      sceneNumber: null,
      range: range(0),
      raw: 'INT. COFFEE SHOP - DAY',
    };
    const doc: FountainDocument = { titlePage: null, elements: [heading] };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('INT - COFFEE SHOP - DAY')).toBeInTheDocument();
  });

  it('renders scene heading with scene number', () => {
    const heading: SceneHeading = {
      type: 'scene_heading',
      intExt: 'EXT',
      location: 'PARK',
      time: 'NIGHT',
      sceneNumber: '5',
      range: range(0),
      raw: 'EXT. PARK - NIGHT #5#',
    };
    const doc: FountainDocument = { titlePage: null, elements: [heading] };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('#5')).toBeInTheDocument();
  });

  it('renders action block', () => {
    const action: Action = {
      type: 'action',
      text: 'John walks into the room.',
      centered: false,
      range: range(2),
      raw: 'John walks into the room.',
    };
    const doc: FountainDocument = { titlePage: null, elements: [action] };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('John walks into the room.')).toBeInTheDocument();
  });

  it('renders centered action with correct class', () => {
    const action: Action = {
      type: 'action',
      text: 'THE END',
      centered: true,
      range: range(10),
      raw: '>THE END<',
    };
    const doc: FountainDocument = { titlePage: null, elements: [action] };
    const { container } = render(<ScriptRenderer document={doc} />);
    const el = container.querySelector('.action.centered');
    expect(el).toBeInTheDocument();
    expect(el?.textContent).toBe('THE END');
  });

  it('renders character with dialogue block', () => {
    const character: Character = {
      type: 'character',
      name: 'JOHN',
      extension: null,
      isDualDialogue: false,
      range: range(2),
      raw: 'JOHN',
    };
    const dialogue: Dialogue = {
      type: 'dialogue',
      text: 'Hello, world!',
      range: range(3),
      raw: 'Hello, world!',
    };
    const doc: FountainDocument = {
      titlePage: null,
      elements: [character, dialogue],
    };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('JOHN')).toBeInTheDocument();
    expect(screen.getByText('Hello, world!')).toBeInTheDocument();
  });

  it('renders character with extension (V.O.)', () => {
    const character: Character = {
      type: 'character',
      name: 'MARY',
      extension: 'V.O.',
      isDualDialogue: false,
      range: range(5),
      raw: 'MARY (V.O.)',
    };
    const dialogue: Dialogue = {
      type: 'dialogue',
      text: 'Narration text.',
      range: range(6),
      raw: 'Narration text.',
    };
    const doc: FountainDocument = {
      titlePage: null,
      elements: [character, dialogue],
    };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('(V.O.)')).toBeInTheDocument();
  });

  it('renders parenthetical in dialogue block', () => {
    const character: Character = {
      type: 'character',
      name: 'JOHN',
      extension: null,
      isDualDialogue: false,
      range: range(2),
      raw: 'JOHN',
    };
    const paren: Parenthetical = {
      type: 'parenthetical',
      text: 'whispering',
      range: range(3),
      raw: '(whispering)',
    };
    const dialogue: Dialogue = {
      type: 'dialogue',
      text: 'I have a secret.',
      range: range(4),
      raw: 'I have a secret.',
    };
    const doc: FountainDocument = {
      titlePage: null,
      elements: [character, paren, dialogue],
    };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('(whispering)')).toBeInTheDocument();
    expect(screen.getByText('I have a secret.')).toBeInTheDocument();
  });

  it('renders transition', () => {
    const transition: Transition = {
      type: 'transition',
      text: 'CUT TO:',
      range: range(8),
      raw: 'CUT TO:',
    };
    const doc: FountainDocument = {
      titlePage: null,
      elements: [transition],
    };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('CUT TO:')).toBeInTheDocument();
  });

  it('renders centered text', () => {
    const centered: Centered = {
      type: 'centered',
      text: '>THE END<',
      range: range(20),
      raw: '>THE END<',
    };
    const doc: FountainDocument = {
      titlePage: null,
      elements: [centered],
    };
    const { container } = render(<ScriptRenderer document={doc} />);
    expect(container.querySelector('.centered.element')).toBeInTheDocument();
  });

  it('renders section with correct level class', () => {
    const section: Section = {
      type: 'section',
      level: 2,
      text: 'Act Two',
      range: range(0),
      raw: '## Act Two',
    };
    const doc: FountainDocument = { titlePage: null, elements: [section] };
    const { container } = render(<ScriptRenderer document={doc} />);
    const el = container.querySelector('.section.level-2');
    expect(el).toBeInTheDocument();
    expect(el?.textContent).toBe('Act Two');
  });

  it('renders synopsis', () => {
    const synopsis: Synopsis = {
      type: 'synopsis',
      text: 'John meets Mary at the coffee shop.',
      range: range(1),
      raw: '= John meets Mary at the coffee shop.',
    };
    const doc: FountainDocument = { titlePage: null, elements: [synopsis] };
    render(<ScriptRenderer document={doc} />);
    expect(
      screen.getByText('John meets Mary at the coffee shop.')
    ).toBeInTheDocument();
  });

  it('renders note', () => {
    const note: Note = {
      type: 'note',
      text: 'This needs revision.',
      range: range(5),
      raw: '[[This needs revision.]]',
    };
    const doc: FountainDocument = { titlePage: null, elements: [note] };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('This needs revision.')).toBeInTheDocument();
  });

  it('renders lyrics', () => {
    const lyrics: Lyrics = {
      type: 'lyrics',
      text: 'La la la',
      range: range(7),
      raw: '~La la la',
    };
    const doc: FountainDocument = { titlePage: null, elements: [lyrics] };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('La la la')).toBeInTheDocument();
  });

  it('renders page break', () => {
    const pageBreak: PageBreak = {
      type: 'page_break',
      range: range(10),
      raw: '===',
    };
    const doc: FountainDocument = { titlePage: null, elements: [pageBreak] };
    const { container } = render(<ScriptRenderer document={doc} />);
    expect(container.querySelector('.page-break')).toBeInTheDocument();
  });

  it('renders title page', () => {
    const titlePage: TitlePage = {
      type: 'title_page',
      entries: [
        { key: 'Title', value: 'My Screenplay' },
        { key: 'Author', value: 'John Doe' },
      ],
      range: range(0, 2),
      raw: 'Title: My Screenplay\nAuthor: John Doe',
    };
    const doc: FountainDocument = { titlePage, elements: [] };
    render(<ScriptRenderer document={doc} />);
    expect(screen.getByText('My Screenplay')).toBeInTheDocument();
    expect(screen.getByText('John Doe')).toBeInTheDocument();
  });
});

describe('Click navigation', () => {
  it('sends navigate message when scene heading is clicked', () => {
    const heading: SceneHeading = {
      type: 'scene_heading',
      intExt: 'INT',
      location: 'OFFICE',
      time: 'DAY',
      sceneNumber: null,
      range: range(5),
      raw: 'INT. OFFICE - DAY',
    };
    const doc: FountainDocument = { titlePage: null, elements: [heading] };
    render(<ScriptRenderer document={doc} />);

    fireEvent.click(screen.getByText('INT - OFFICE - DAY'));
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'navigate',
      line: 5,
      character: 0,
    });
  });

  it('sends navigate message when action is clicked', () => {
    const action: Action = {
      type: 'action',
      text: 'He stands up.',
      centered: false,
      range: range(12),
      raw: 'He stands up.',
    };
    const doc: FountainDocument = { titlePage: null, elements: [action] };
    render(<ScriptRenderer document={doc} />);

    fireEvent.click(screen.getByText('He stands up.'));
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'navigate',
      line: 12,
      character: 0,
    });
  });

  it('sends navigate message when dialogue is clicked', () => {
    const character: Character = {
      type: 'character',
      name: 'ALICE',
      extension: null,
      isDualDialogue: false,
      range: range(3),
      raw: 'ALICE',
    };
    const dialogue: Dialogue = {
      type: 'dialogue',
      text: 'Good morning!',
      range: range(4),
      raw: 'Good morning!',
    };
    const doc: FountainDocument = {
      titlePage: null,
      elements: [character, dialogue],
    };
    render(<ScriptRenderer document={doc} />);

    fireEvent.click(screen.getByText('Good morning!'));
    expect(mockPostMessage).toHaveBeenCalledWith({
      type: 'navigate',
      line: 4,
      character: 0,
    });
  });
});

describe('Complex document rendering', () => {
  it('renders a full screenplay with mixed elements', () => {
    const doc: FountainDocument = {
      titlePage: null,
      elements: [
        {
          type: 'section',
          level: 1,
          text: 'Act One',
          range: range(0),
          raw: '# Act One',
        } as Section,
        {
          type: 'scene_heading',
          intExt: 'INT',
          location: 'OFFICE',
          time: 'DAY',
          sceneNumber: null,
          range: range(2),
          raw: 'INT. OFFICE - DAY',
        } as SceneHeading,
        {
          type: 'action',
          text: 'JOHN enters the room.',
          centered: false,
          range: range(4),
          raw: 'JOHN enters the room.',
        } as Action,
        {
          type: 'character',
          name: 'JOHN',
          extension: null,
          isDualDialogue: false,
          range: range(6),
          raw: 'JOHN',
        } as Character,
        {
          type: 'dialogue',
          text: 'Hello everyone.',
          range: range(7),
          raw: 'Hello everyone.',
        } as Dialogue,
        {
          type: 'transition',
          text: 'CUT TO:',
          range: range(9),
          raw: 'CUT TO:',
        } as Transition,
      ],
    };

    const { container } = render(<ScriptRenderer document={doc} />);

    expect(screen.getByText('Act One')).toBeInTheDocument();
    expect(screen.getByText('INT - OFFICE - DAY')).toBeInTheDocument();
    expect(screen.getByText('JOHN enters the room.')).toBeInTheDocument();
    expect(screen.getByText('JOHN')).toBeInTheDocument();
    expect(screen.getByText('Hello everyone.')).toBeInTheDocument();
    expect(screen.getByText('CUT TO:')).toBeInTheDocument();

    // Verify structure: 5 children because character+dialogue are grouped into one DialogueBlock
    const screenplay = container.querySelector('.screenplay');
    expect(screenplay?.children.length).toBe(5);
  });
});
