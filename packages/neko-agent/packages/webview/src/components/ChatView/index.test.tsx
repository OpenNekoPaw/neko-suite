import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { CharacterDialogueSessionProjection } from '@neko-agent/types';
import { ChatView } from './index';

const translations: Record<string, string> = {
  'chat.emptyState.title': 'Neko Suite Creative Assistant',
  'chat.emptyState.description':
    'Shape stories, characters, storyboards, shots, visuals, video, and sound.',
  'chat.emptyState.disclaimer': 'AI responses may be inaccurate.',
  'chat.emptyState.suggestion1': 'Design the protagonist and relationships',
  'chat.emptyState.suggestion2': 'Shape this scene into storyboard rhythm',
  'chat.emptyState.suggestion3': 'Draft dialogue and narration beats',
};

vi.mock('@/i18n/I18nContext', () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key] ?? key,
  }),
}));

vi.mock('@/components/ChatView/DropZone', () => ({
  DropZone: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock('@/components/ChatView/InputArea', () => ({
  InputArea: () => <div data-testid="input-area" />,
}));

vi.mock('@/components/ChatView/MessageList', () => ({
  MessageList: ({ activeSkillNotice }: { activeSkillNotice?: { skillName: string } | null }) => (
    <div data-testid="message-list">
      {activeSkillNotice ? <span>{activeSkillNotice.skillName}</span> : null}
    </div>
  ),
}));

vi.mock('@/components/ChatView/CharacterDialogueHeader', () => ({
  CharacterDialogueHeader: () => <div data-testid="character-dialogue-header" />,
}));

vi.mock('@/components/ChatView/EmbodyCharacterHeader', () => ({
  EmbodyCharacterHeader: () => <div data-testid="embody-character-header" />,
}));

describe('ChatView empty state', () => {
  it('renders ordinary assistant suggestions for empty normal chat', () => {
    renderChatView();

    expect(screen.getByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeTruthy();
    expect(
      screen.getByRole('button', { name: /Design the protagonist and relationships/ }),
    ).toBeTruthy();
  });

  it('does not render ordinary assistant suggestions in empty Character Dialogue sessions', () => {
    renderChatView({
      conversationKind: 'character-dialogue',
      characterDialogueSession: createCharacterDialogueSession(),
    });

    expect(screen.getByTestId('character-dialogue-header')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Neko Suite Creative Assistant' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: /Design the protagonist and relationships/ }),
    ).toBeNull();
    expect(screen.queryByText('AI responses may be inaccurate.')).toBeNull();
  });

  it('does not render a separate agent execution status row inside the chat body', () => {
    renderChatView({
      isThinking: true,
      agentState: { phase: 'acting', toolName: 'ReadDocument', startedAt: Date.now() },
    });

    expect(screen.queryByText('Acting')).toBeNull();
  });

  it('passes active skill context into the conversation message list', () => {
    renderChatView({
      activeSkill: { skillName: 'comic-to-storyboard', allowedTools: ['ReadDocument'] },
      onClearActiveSkill: vi.fn(),
    });

    expect(screen.getByTestId('message-list')).toBeTruthy();
    expect(screen.getByText('comic-to-storyboard')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Neko Suite AI Assistant' })).toBeNull();
  });
});

function renderChatView(overrides: Partial<React.ComponentProps<typeof ChatView>> = {}) {
  render(
    <ChatView
      messages={[]}
      inputValue=""
      isThinking={false}
      streamingMessageId={null}
      activeConversationId="conv-1"
      onInputChange={vi.fn()}
      onSend={vi.fn()}
      {...overrides}
    />,
  );
}

function createCharacterDialogueSession(): CharacterDialogueSessionProjection {
  return {
    sessionId: 'dialogue-session-1',
    entityId: 'char-xiaoju',
    displayName: '小橘',
    mode: 'roleplay',
    profile: {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      displayName: '小橘',
      aliases: [],
      facts: [],
      sparsity: 'partial',
    },
    summary: 'protagonist',
    startedAt: '2026-06-01T00:00:00.000Z',
    status: 'active',
  };
}
