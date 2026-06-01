import { act } from 'react';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NpcSessionProjection } from '@/components/types';
import { NpcSessionHeader } from './NpcSessionHeader';

const exitNpcSession = vi.fn();

vi.mock('@/components/hooks/useVSCode', () => ({
  VSCodeMessages: {
    exitNpcSession: (...args: unknown[]) => exitNpcSession(...args),
  },
}));

describe('NpcSessionHeader', () => {
  beforeEach(() => {
    exitNpcSession.mockClear();
  });

  it('renders NPC identity, profile facts, and dispatches exit', async () => {
    render(<NpcSessionHeader session={createSession()} />);

    expect(screen.getByText('小橘')).toBeTruthy();
    expect(screen.getByText('roleplay')).toBeTruthy();
    expect(screen.getByText('partial')).toBeTruthy();
    expect(screen.getByText('protagonist')).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: 'Profile' }).click();
    });
    expect(screen.getByText('identity.name')).toBeTruthy();
    expect(screen.getByText('speech.catchphrase')).toBeTruthy();

    await act(async () => {
      screen.getByRole('button', { name: 'Exit' }).click();
    });
    expect(exitNpcSession).toHaveBeenCalledWith('npc-session-1');
  });
});

function createSession(): NpcSessionProjection {
  return {
    sessionId: 'npc-session-1',
    entityId: 'char-xiaoju',
    displayName: '小橘',
    mode: 'roleplay',
    profile: {
      entityRef: { entityId: 'char-xiaoju', entityKind: 'character' },
      displayName: '小橘',
      aliases: ['Xiaoju'],
      facts: [
        {
          key: 'identity.name',
          value: '小橘',
          source: 'registry',
          authority: 'confirmed',
        },
        {
          key: 'speech.catchphrase',
          value: '我先看看',
          source: 'agent-inferred',
          authority: 'suggested',
        },
      ],
      dialogueSamples: ['小橘：我会自己确认。'],
      sparsity: 'partial',
    },
    summary: 'protagonist',
    startedAt: '2026-06-01T00:00:00.000Z',
    status: 'active',
  };
}
