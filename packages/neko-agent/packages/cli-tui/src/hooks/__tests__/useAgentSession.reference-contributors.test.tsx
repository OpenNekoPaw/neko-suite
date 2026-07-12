import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentCapabilityProvider, IService } from '@neko/shared';
import { isCanonicalConversationId } from '@neko/agent';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../../core/types';
import { createTuiReferenceSuggestions } from '../../components/Input/reference-suggestions';
import { useAgentSession } from '../useAgentSession';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator } from '@neko/shared/i18n';
import { createAgentTerminalPresentationContext } from '../../presentation/context';
import { createAgentTerminalFormatters } from '../../presentation/formatters';
import { CLI_TERMINAL_MESSAGE_SOURCE } from '../../presentation/terminal-messages';

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-session-refs-'));
});

afterEach(async () => {
  cleanup();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

const TEST_PRESENTATION = createAgentTerminalPresentationContext({
  translator: createStrictTranslator('en', [
    AGENT_COMMAND_MESSAGE_SOURCE,
    CLI_TERMINAL_MESSAGE_SOURCE,
  ] as const),
  formatters: createAgentTerminalFormatters({ locale: 'en', timeZone: 'UTC' }),
});

describe('useAgentSession reference contributors', () => {
  it('refreshes @ reference suggestions after capability providers load', async () => {
    const snapshots: readonly string[][] = [];
    const conversationIds: string[] = [];

    render(
      <ReferenceContributorProbe
        config={{ ...DEFAULT_CLI_CONFIG, workDir: tempRoot, providerRequiresApiKey: false }}
        capabilityProviders={[createProbeAssetCapabilityProvider()]}
        onSnapshot={(names) => {
          snapshots.push(names);
        }}
        onConversationId={(conversationId) => {
          conversationIds.push(conversationId);
        }}
      />,
    );

    await waitFor(() => snapshots.some((names) => names.includes('浪客参考')));

    expect(snapshots.at(-1)).toContain('浪客参考');
    expect(
      conversationIds.some((conversationId) => isCanonicalConversationId(conversationId)),
    ).toBe(true);
    expect(conversationIds.every((conversationId) => !conversationId.startsWith('cli-'))).toBe(
      true,
    );
  });
});

function ReferenceContributorProbe(props: {
  readonly config: CLIConfig;
  readonly capabilityProviders: readonly AgentCapabilityProvider[];
  readonly onSnapshot: (names: readonly string[]) => void;
  readonly onConversationId?: (conversationId: string) => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    presentation: TEST_PRESENTATION,
    promptLocale: 'en',
    service: createNoopService(),
    capabilityProviders: props.capabilityProviders,
  });

  useEffect(() => {
    let cancelled = false;
    void createTuiReferenceSuggestions({
      workspaceRoot: props.config.workDir,
      presentation: TEST_PRESENTATION,
      referenceContributors: session.getReferenceContributors(),
      limit: 10,
    }).then((suggestions) => {
      if (!cancelled) {
        props.onSnapshot(suggestions.map((suggestion) => suggestion.name));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [props, session.getReferenceContributors]);

  useEffect(() => {
    props.onConversationId?.(session.getCurrentConversationId());
  }, [props, session.getCurrentConversationId]);

  return <Text>reference-contributor-probe</Text>;
}

function createProbeAssetCapabilityProvider(): AgentCapabilityProvider {
  return {
    id: 'probe-assets',
    version: '1.0.0',
    hostRequirements: [{ host: 'tui' }],
    requirements: { contentAccess: false },
    getTools: () => [],
    getReferenceContributors: () => [
      {
        id: 'probe-assets',
        displayName: 'Assets',
        search: async () => ({
          diagnostics: [],
          candidates: [
            {
              id: 'asset:wave-reference',
              label: '浪客参考',
              source: 'assets',
              kind: 'asset',
              insertText: '@asset:wave-reference',
            },
          ],
        }),
      },
    ],
  };
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
  throw new Error('Timed out waiting for reference contributor suggestions.');
}
