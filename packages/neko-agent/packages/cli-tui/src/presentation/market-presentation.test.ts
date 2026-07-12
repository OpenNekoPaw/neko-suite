import { describe, expect, it } from 'vitest';
import { AGENT_COMMAND_MESSAGE_SOURCE } from '@neko/agent/commands/terminal-messages';
import { createStrictTranslator, type SupportedLocale } from '@neko/shared/i18n';
import { createAgentTerminalPresentationContext } from './context';
import { presentMarketCommand } from './market-presentation';
import { CLI_TERMINAL_MESSAGE_SOURCE } from './terminal-messages';

describe('market presentation', () => {
  it('localizes owned search chrome while preserving marketplace content', () => {
    const semantic = {
      kind: 'search-results' as const,
      query: 'query-原文',
      total: 11,
      remainingCount: 1,
      items: [
        {
          id: 'publisher/package-原文',
          name: 'External 包名',
          version: '1.2.3-beta',
          description: 'Provider-authored description 原文',
          installState: 'update-available' as const,
        },
      ],
    };

    const en = presentMarketCommand(semantic, createContext('en'));
    const zh = presentMarketCommand(semantic, createContext('zh-cn'));
    if (en.kind !== 'output' || zh.kind !== 'output') throw new Error('Expected output');

    expect(en.output).toContain('Search results');
    expect(zh.output).toContain('搜索结果');
    expect(en.output).toContain('[update available]');
    expect(zh.output).toContain('[有可用更新]');
    for (const value of [
      'query-原文',
      'publisher/package-原文',
      'External 包名',
      '1.2.3-beta',
      'Provider-authored description 原文',
    ]) {
      expect(en.output).toContain(value);
      expect(zh.output).toContain(value);
    }
  });

  it('uses explicit package count variants', () => {
    const one = presentMarketCommand(
      {
        kind: 'installed',
        packages: [{ packageId: 'pkg', version: '1', type: 'skill', installedPath: '/tmp/pkg' }],
      },
      createContext('en'),
    );
    const many = presentMarketCommand(
      {
        kind: 'installed',
        packages: [
          { packageId: 'pkg-a', version: '1', type: 'skill', installedPath: '/tmp/a' },
          { packageId: 'pkg-b', version: '2', type: 'skill', installedPath: '/tmp/b' },
        ],
      },
      createContext('en'),
    );

    if (one.kind !== 'output' || many.kind !== 'output') throw new Error('Expected output');
    expect(one.output).toContain('Installed packages (1 package):');
    expect(many.output).toContain('Installed packages (2 packages):');
  });

  it('keeps operation diagnostic identity and external detail stable', () => {
    const semantic = {
      kind: 'diagnostic' as const,
      code: 'operation-failed' as const,
      operation: 'install' as const,
      detail: 'checksum mismatch 原文',
    };

    expect(presentMarketCommand(semantic, createContext('en'))).toEqual({
      kind: 'error',
      diagnosticCode: 'market.install-failed',
      error: 'Install failed: checksum mismatch 原文',
    });
    expect(presentMarketCommand(semantic, createContext('zh-cn'))).toEqual({
      kind: 'error',
      diagnosticCode: 'market.install-failed',
      error: '安装失败：checksum mismatch 原文',
    });
  });
});

function createContext(locale: SupportedLocale) {
  return createAgentTerminalPresentationContext({
    translator: createStrictTranslator(locale, [
      AGENT_COMMAND_MESSAGE_SOURCE,
      CLI_TERMINAL_MESSAGE_SOURCE,
    ] as const),
    formatters: { count: String, dateTime: String, duration: String, bytes: String },
  });
}
