import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '../../../..');

const agentCriticalFiles = [
  'packages/neko-agent/packages/webview/package.json',
  'packages/neko-agent/packages/webview/src/components/ChatView/index.tsx',
  'packages/neko-agent/packages/webview/src/components/ChatView/InputArea/InputArea.tsx',
  'packages/neko-agent/packages/webview/src/components/ChatView/InputArea/ModelSelector.tsx',
  'packages/neko-agent/packages/webview/src/components/ChatView/InputArea/ModeSelector.tsx',
  'packages/neko-agent/packages/webview/src/components/ChatView/InputArea/SessionModeSelector.tsx',
  'packages/neko-agent/packages/webview/src/components/ChatView/InputArea/GenerationParamsBar.tsx',
  'packages/neko-agent/packages/webview/src/components/ChatView/InputArea/MentionMenu.tsx',
  'packages/neko-agent/packages/webview/src/components/ChatView/InputArea/SlashCommandMenu.tsx',
  'packages/neko-agent/packages/webview/src/components/ChatView/InputArea/AgentMediaBar.tsx',
];

describe('Agent UI isolation guardrail', () => {
  it('keeps Agent Header/Input and selector architecture out of the shared UI migration', () => {
    const importsSharedUi = agentCriticalFiles.filter((relativePath) => {
      const source = readFileSync(join(repoRoot, relativePath), 'utf-8');
      return source.includes('@neko/ui');
    });

    expect(importsSharedUi).toEqual([]);
  });
});
