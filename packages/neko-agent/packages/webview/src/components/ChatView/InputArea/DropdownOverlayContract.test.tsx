import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ChatModelOption } from '@neko/shared';
import { ModeSelector } from './ModeSelector';
import { ModelSelector } from './ModelSelector';
import { SessionModeSelector } from './SessionModeSelector';

const translations: Record<string, string> = {
  'chat.autoMode': 'Auto',
  'chat.selectModel': 'Select model',
  'chat.categoryChat': 'Chat',
  'chat.executionMode.title': 'Execution mode',
  'chat.executionMode.plan': 'Plan',
  'chat.executionMode.planDesc': 'Draft commands before running',
  'chat.executionMode.ask': 'Ask',
  'chat.executionMode.askDesc': 'Ask before tool actions',
  'chat.executionMode.auto': 'Auto',
  'chat.executionMode.autoDesc': 'Run approved actions automatically',
  'chat.sessionMode.agent': 'Agent',
  'chat.sessionMode.agentDesc': 'Use agent tools',
  'chat.sessionMode.image': 'Image',
  'chat.sessionMode.imageDesc': 'Generate images',
  'chat.sessionMode.video': 'Video',
  'chat.sessionMode.videoDesc': 'Generate videos',
  'chat.sessionMode.audio': 'Audio',
  'chat.sessionMode.audioDesc': 'Generate audio',
};

const models: ChatModelOption[] = [
  {
    id: 'auto',
    label: 'Auto',
    providerId: 'auto',
    modelId: 'auto',
    category: 'llm',
  },
  {
    id: 'openai:gpt-5',
    label: 'OpenAI / gpt-5',
    providerId: 'openai',
    modelId: 'gpt-5',
    category: 'llm',
  },
];

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

describe('dropdown overlay presentation contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('keeps the chat model menu on the shared model overlay shell', () => {
    render(<ModelSelector selectedModel="auto" models={models} onSelect={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Select model' }));

    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('agent-dropdown-menu');
    expect(menu.className).toContain('agent-dropdown-menu-model');
    expect(menu.className).not.toContain('max-h-[');
    expect(menu.className).not.toContain('overflow-y-auto');
  });

  it('uses the shared mode overlay shell for session and execution menus', () => {
    const { rerender } = render(<SessionModeSelector mode="agent" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));
    expect(screen.getByRole('menu').className).toContain('agent-dropdown-menu-mode');
    expect(screen.getByRole('menu').className).not.toContain('w-[');

    rerender(<ModeSelector mode="ask" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Ask' }));
    expect(screen.getByRole('menu').className).toContain('agent-dropdown-menu-mode');
  });

  it('aligns the execution mode menu inward near the composer right edge', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      if (this.classList.contains('agent-composer-rail')) {
        return createRect({ left: 0, right: 432, top: 0, bottom: 520 });
      }
      return createRect({ left: 342, right: 420, top: 460, bottom: 488 });
    });

    render(
      <div className="agent-composer-rail">
        <ModeSelector mode="auto" onChange={vi.fn()} />
      </div>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Auto' }));

    expect(screen.getByRole('menu').className).toContain('right-0');
  });
});

function createRect({
  left,
  right,
  top,
  bottom,
}: {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}): DOMRect {
  return {
    left,
    right,
    top,
    bottom,
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
    toJSON: () => ({}),
  } as DOMRect;
}
