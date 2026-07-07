import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import React, { useEffect } from 'react';
import { Text } from 'ink';
import { cleanup, render } from 'ink-testing-library';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { AgentCapabilityProvider, IService } from '@neko/shared';
import { DEFAULT_CLI_CONFIG, type CLIConfig } from '../../core/types';
import { createTuiReferenceSuggestions } from '../../components/Input/reference-suggestions';
import { useAgentSession } from '../useAgentSession';

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'neko-tui-session-refs-'));
});

afterEach(async () => {
  cleanup();
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe('useAgentSession reference contributors', () => {
  it('refreshes @ reference suggestions after capability providers load', async () => {
    const snapshots: readonly string[][] = [];

    render(
      <ReferenceContributorProbe
        config={{ ...DEFAULT_CLI_CONFIG, workDir: tempRoot, providerRequiresApiKey: false }}
        capabilityProviders={[createProbeAssetCapabilityProvider()]}
        onSnapshot={(names) => {
          snapshots.push(names);
        }}
      />,
    );

    await waitFor(() => snapshots.some((names) => names.includes('浪客参考')));

    expect(snapshots.at(-1)).toContain('浪客参考');
  });
});

function ReferenceContributorProbe(props: {
  readonly config: CLIConfig;
  readonly capabilityProviders: readonly AgentCapabilityProvider[];
  readonly onSnapshot: (names: readonly string[]) => void;
}): React.JSX.Element {
  const session = useAgentSession({
    config: props.config,
    service: createNoopService(),
    capabilityProviders: props.capabilityProviders,
  });

  useEffect(() => {
    let cancelled = false;
    void createTuiReferenceSuggestions({
      workspaceRoot: props.config.workDir,
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
