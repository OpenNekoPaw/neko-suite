import { describe, expect, it, vi } from 'vitest';
import type { CreativeEntityRef, NpcProfileSource } from '@neko/shared';
import {
  NpcConversationSession,
  projectNpcTranscriptToChatMessages,
  type NpcConversationResponder,
} from '../npc-conversation-session';

const entityRef: CreativeEntityRef = {
  entityId: 'char-lin',
  entityKind: 'character',
  projectRoot: '/project',
  source: 'neko-entity',
};

const profile: NpcProfileSource = {
  entityRef,
  displayName: 'Lin',
  aliases: ['L'],
  facts: [
    {
      key: 'identity.name',
      value: 'Lin',
      source: 'registry',
      authority: 'confirmed',
    },
  ],
  sparsity: 'thin',
};

describe('NpcConversationSession', () => {
  it('keeps multi-turn NPC transcript in memory with no-tool defaults', async () => {
    let nowIndex = 0;
    const responder: NpcConversationResponder = vi.fn(async (input) => ({
      content: `NPC:${input.userMessage.content}:${input.transcript.length}`,
    }));
    const session = new NpcConversationSession({
      id: 'npc-session-1',
      entityRef,
      profileSnapshot: profile,
      mode: 'roleplay',
      responder,
      now: () => `2026-06-01T00:00:0${++nowIndex}.000Z`,
    });

    const first = await session.sendUserMessage('hello');
    const second = await session.sendUserMessage('again');

    expect(session.config.toolPolicy).toEqual({ kind: 'none' });
    expect(session.config.modelTier).toBe('balanced');
    expect(first.npcMessage.content).toBe('NPC:hello:1');
    expect(second.npcMessage.content).toBe('NPC:again:3');
    expect(session.getTranscript().map((message) => [message.role, message.content])).toEqual([
      ['user', 'hello'],
      ['npc', 'NPC:hello:1'],
      ['user', 'again'],
      ['npc', 'NPC:again:3'],
    ]);
  });

  it('projects transcript to provider chat messages with the NPC system prompt', async () => {
    const responder: NpcConversationResponder = async () => ({ content: 'Stay near the gate.' });
    const session = new NpcConversationSession({
      id: 'npc-session-2',
      entityRef,
      profileSnapshot: profile,
      mode: 'consult',
      responder,
    });

    await session.sendUserMessage('where are you?');

    expect(
      projectNpcTranscriptToChatMessages({
        systemPrompt: session.systemPrompt,
        transcript: session.getTranscript(),
      }),
    ).toEqual([
      { role: 'system', content: expect.stringContaining('You are Lin.') },
      { role: 'user', content: 'where are you?' },
      { role: 'assistant', content: 'Stay near the gate.' },
    ]);
  });

  it('rolls back a failed user turn and rejects sends after dispose', async () => {
    const session = new NpcConversationSession({
      id: 'npc-session-3',
      entityRef,
      profileSnapshot: profile,
      mode: 'roleplay',
      responder: async () => {
        throw new Error('model failed');
      },
    });

    await expect(session.sendUserMessage('hello')).rejects.toThrow('model failed');
    expect(session.getTranscript()).toEqual([]);

    session.dispose();
    await expect(session.sendUserMessage('after')).rejects.toThrow('disposed');
  });

  it('exports transcript artifacts without turning the profile snapshot into source truth', async () => {
    const session = new NpcConversationSession({
      id: 'npc-session-4',
      entityRef,
      profileSnapshot: profile,
      mode: 'roleplay',
      responder: async () => ({ content: 'Hello.' }),
      now: () => '2026-06-01T12:00:00.000Z',
    });

    await session.sendUserMessage('hello');

    expect(session.toArtifact({ profileHash: 'hash-1' })).toEqual(
      expect.objectContaining({
        version: 1,
        createdAt: '2026-06-01T12:00:00.000Z',
        entityRef,
        mode: 'roleplay',
        profileSnapshot: profile,
        sessionId: 'npc-session-4',
        profileHash: 'hash-1',
        transcript: expect.arrayContaining([
          expect.objectContaining({ role: 'user', content: 'hello' }),
          expect.objectContaining({ role: 'npc', content: 'Hello.' }),
        ]),
      }),
    );
  });
});
