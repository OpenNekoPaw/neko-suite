import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
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
  'chat.sessionMode.sections.agent': 'Direct Agent Collaboration',
  'chat.sessionMode.sections.media': 'Media Generation',
  'chat.sessionMode.agent': 'Creative Collaboration',
  'chat.sessionMode.agentDesc':
    'Refine story themes, character settings, worlds, scene atmosphere, and creative direction',
  'chat.sessionMode.short.agent': 'Agent',
  'chat.sessionMode.summary.agent': 'Refine story themes, characters, worlds, and scene mood',
  'chat.sessionMode.image': 'Image Generation',
  'chat.sessionMode.imageDesc': 'Create character images and scene references',
  'chat.sessionMode.short.image': 'Image',
  'chat.sessionMode.summary.image': 'Create character images and scene references',
  'chat.sessionMode.video': 'Video Generation',
  'chat.sessionMode.videoDesc': 'Create video material and motion previews',
  'chat.sessionMode.short.video': 'Video',
  'chat.sessionMode.summary.video': 'Create video material and motion previews',
  'chat.sessionMode.audio': 'Sound Generation',
  'chat.sessionMode.audioDesc': 'Create voice, sound effects, and ambience',
  'chat.sessionMode.short.audio': 'Audio',
  'chat.sessionMode.summary.audio': 'Create voice, sound effects, and ambience',
  'chat.sessionMode.badge.agent': 'Chat',
  'chat.sessionMode.badge.image': 'Image',
  'chat.sessionMode.badge.video': 'Video',
  'chat.sessionMode.badge.audio': 'Sound',
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

    const trigger = screen.getByRole('button', { name: 'Select model' });
    expect(trigger.querySelector('.rounded-full')).toBeNull();

    fireEvent.click(trigger);

    const menu = screen.getByRole('menu');
    expect(menu.className).toContain('agent-dropdown-menu');
    expect(menu.className).toContain('agent-dropdown-menu-model');
    expect(menu.className).not.toContain('max-h-[');
    expect(menu.className).not.toContain('overflow-y-auto');
  });

  it('uses shared overlay shells for session and execution menus', () => {
    const { rerender } = render(<SessionModeSelector mode="agent" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: 'Agent' }));
    expect(screen.getByRole('menu').className).toContain('agent-composer-popover');
    expect(screen.getByRole('menu').className).toContain('agent-composer-session-mode-menu');
    expect(screen.getByRole('menu').className).toContain('is-placement-');
    expect(screen.queryByText('Direct Agent Collaboration')).toBeNull();
    expect(screen.queryByText('Media Generation')).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Image/ })).toBeTruthy();
    expect(screen.getByText('Create video material and motion previews')).toBeTruthy();
    expect(screen.getByRole('menu').textContent).not.toMatch(/storyboard|shot|dialogue|narration/i);
    expect(screen.queryByRole('menuitem', { name: 'Script Generation' })).toBeNull();
    expect(screen.queryByRole('menuitem', { name: 'Music' })).toBeNull();

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

  it('keeps entry prompt menus stretched to the composer width', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    const rule = css.match(/\.agent-composer-entry-prompt-menu\s*\{(?<body>[^}]+)\}/)?.groups?.body;

    expect(rule).toBeTruthy();
    expect(rule).toContain('width: auto');
    expect(rule).toContain('max-width: none');
    expect(rule).not.toContain('420px');
  });

  it('keeps mode-specific model and params on the same composer config line', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    const mediaParamsRule = css.match(
      /\.agent-composer-control-group-config \.agent-generation-params\s*\{(?<body>[^}]+)\}/,
    )?.groups?.body;
    const llmParamsRule = css.match(/\.agent-inline-config-stack\s*\{(?<body>[^}]+)\}/)?.groups
      ?.body;

    expect(mediaParamsRule).toBeTruthy();
    expect(mediaParamsRule).toContain('width: auto');
    expect(mediaParamsRule).not.toContain('width: 100%');
    expect(llmParamsRule).toBeTruthy();
    expect(llmParamsRule).toContain('flex-direction: row');
    expect(llmParamsRule).toContain('flex-wrap: wrap');
  });

  it('keeps preset and parameter menus content-sized with field headers', () => {
    const css = readFileSync(resolve(__dirname, '../../../index.css'), 'utf8');
    const presetRule = css.match(/\.agent-dropdown-menu-preset\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const paramRule = css.match(/\.agent-dropdown-menu-param\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const modelRule = css.match(/\.agent-dropdown-menu-model\s*\{(?<body>[^}]+)\}/)?.groups?.body;
    const inlineRule = css.match(/\.agent-dropdown-item-inline-detail\s*\{(?<body>[^}]+)\}/)?.groups
      ?.body;
    const headerRule = css.match(/\.agent-dropdown-header\s*\{(?<body>[^}]+)\}/)?.groups?.body;

    expect(presetRule).toBeTruthy();
    expect(presetRule).toContain('width: max-content');
    expect(presetRule).toContain('min-width: var(--agent-overlay-compact-min-inline-size)');
    expect(presetRule).toContain('max-width: var(--agent-overlay-compact-max-inline-size)');
    expect(paramRule).toBeTruthy();
    expect(paramRule).toContain('width: max-content');
    expect(paramRule).toContain('min-width: var(--agent-overlay-compact-min-inline-size)');
    expect(paramRule).toContain('max-width: var(--agent-overlay-compact-max-inline-size)');
    expect(modelRule).toBeTruthy();
    expect(modelRule).toContain('width: var(--agent-overlay-wide-inline-size)');
    expect(modelRule).toContain('max-width: var(--agent-overlay-wide-max-inline-size)');
    expect(inlineRule).toBeTruthy();
    expect(inlineRule).toContain('min-height: 28px');
    expect(headerRule).toBeTruthy();
    expect(headerRule).toContain('border-bottom');
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
