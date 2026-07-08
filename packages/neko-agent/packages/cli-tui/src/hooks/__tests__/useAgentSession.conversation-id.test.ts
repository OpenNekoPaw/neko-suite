import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isCanonicalConversationId } from '@neko/agent';
import type { IService } from '@neko/shared';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../../core/types';
import { useAgentStore } from '../../stores/agent-store';
import { useConversationStore } from '../../stores/conversation-store';
import { useAgentSession } from '../useAgentSession';

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-session-id-'));
});

afterEach(async () => {
  cleanup();
  useAgentStore.getState().reset();
  useConversationStore.getState().clearMessages();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('useAgentSession conversation identity', () => {
  it('starts new Ink TUI sessions with canonical workspace conversation ids', async () => {
    const conversationIds: string[] = [];

    render(
      React.createElement(ConversationIdProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
        onConversationId: (conversationId: string) => {
          conversationIds.push(conversationId);
        },
      }),
    );

    await waitFor(() =>
      conversationIds.some((conversationId) => isCanonicalConversationId(conversationId)),
    );

    expect(conversationIds.every((conversationId) => !conversationId.startsWith('cli-'))).toBe(true);
  });

  it('rejects old cli resume ids before loading persisted records', async () => {
    render(
      React.createElement(ConversationIdProbe, {
        config: {
          ...DEFAULT_CLI_CONFIG,
          workDir: tempRoot,
          providerRequiresApiKey: false,
        },
        resumeConversationId: 'cli-kf12oi-4fzzzxjyl',
        onConversationId: () => undefined,
      }),
    );

    await waitFor(() =>
      useAgentStore
        .getState()
        .error?.message.includes('TUI resume conversation id must be canonical') === true,
    );

    expect(useAgentStore.getState().status).toBe('error');
  });
});

function ConversationIdProbe(props: {
  readonly config: CLIConfig;
  readonly resumeConversationId?: string;
  readonly onConversationId: (conversationId: string) => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    service: createNoopService(),
    resumeConversationId: props.resumeConversationId,
  });

  useEffect(() => {
    props.onConversationId(session.getCurrentConversationId());
  }, [props, session.getCurrentConversationId]);

  return React.createElement(Text, null, 'conversation-id-probe');
}

function createNoopService(): IService {
  return {
    async chat() {
      return { content: '' };
    },
    async *chatStream() {
      yield { type: 'done' as const };
    },
    async embed(texts: string[]) {
      return { embeddings: texts.map(() => []) };
    },
  };
}

async function waitFor(predicate: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Timed out waiting for canonical conversation id.');
}
