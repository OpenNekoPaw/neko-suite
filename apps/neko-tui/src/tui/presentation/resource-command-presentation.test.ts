import { describe, expect, it } from 'vitest';
import {
  buildAgentTerminalHelpSemantic,
  executeAgentTerminalCommandsSemantic,
  executeAgentTerminalSkillsSemantic,
  executeAgentTerminalToolsSemantic,
  type CommandContext,
} from '@neko/agent';
import { createTestAgentTerminalPresentation } from './testing';
import {
  presentCommandsCommand,
  presentHelpCommand,
  presentSkillsCommand,
  presentToolsCommand,
} from './resource-command-presentation';

function context(): CommandContext {
  const skills = [
    {
      name: 'quality-review',
      description: 'Review changed files',
      enabled: true,
    },
    {
      name: 'commit',
      description: 'Create a commit message',
      enabled: true,
      entryPointKind: 'command-artifact' as const,
      command: 'commit',
      supportsArguments: true,
      argumentHint: '<message>',
    },
  ];
  const tools = [
    { name: 'read_file', description: 'Read a file without translating provider text.' },
    { name: 'write_file' },
  ];
  return {
    skillService: {
      registry: {
        skillCount: skills.length,
        listSkills: () => skills,
        listAllSkills: () => skills,
        getSkill: () => undefined,
        getSkillByCommand: () => undefined,
        searchSkills: () => [],
      },
      skillCount: skills.length,
      getActiveSkill: () => ({ name: 'quality-review' }),
      clearActiveSkill: () => {},
    },
    toolRegistry: {
      size: tools.length,
      list: () => tools,
      get: (name) => tools.find((tool) => tool.name === name),
      search: (query) => tools.filter((tool) => tool.name.includes(query)),
    },
  };
}

describe('resource command presentation', () => {
  it('localizes help while preserving command syntax and external artifact text', () => {
    const semantic = buildAgentTerminalHelpSemantic(context());
    const en = presentHelpCommand(semantic, createTestAgentTerminalPresentation('en'));
    const zh = presentHelpCommand(semantic, createTestAgentTerminalPresentation('zh-cn'));

    expect(en.kind).toBe('output');
    expect(zh.kind).toBe('output');
    if (en.kind !== 'output' || zh.kind !== 'output') return;
    expect(en.output).toContain('Available Commands:');
    expect(zh.output).toContain('可用命令：');
    expect(en.output).toContain('/help, /h, /?');
    expect(zh.output).toContain('/help, /h, /?');
    expect(en.output).toContain('/commit <message>');
    expect(zh.output).toContain('/commit <message>');
    expect(en.output).toContain('Create a commit message');
    expect(zh.output).toContain('Create a commit message');
  });

  it('projects Skill rows and diagnostics through stable semantic identities', () => {
    const semantic = executeAgentTerminalSkillsSemantic([], context());
    const zh = presentSkillsCommand(semantic, createTestAgentTerminalPresentation('zh-cn'));
    const diagnostic = presentSkillsCommand(
      executeAgentTerminalSkillsSemantic(['unknown'], context()),
      createTestAgentTerminalPresentation('en'),
    );

    expect(zh.kind).toBe('output');
    if (zh.kind === 'output') {
      expect(zh.output).toContain('quality-review [$quality-review]');
      expect(zh.output).toContain('commit [$commit] [/commit]');
      expect(zh.output).toContain('Review changed files');
    }
    expect(diagnostic).toEqual(
      expect.objectContaining({ kind: 'error', diagnosticCode: 'skills.unknown-subcommand' }),
    );
  });

  it('uses explicit plural variants for commands and tools', () => {
    const commands = presentCommandsCommand(
      executeAgentTerminalCommandsSemantic([], context()),
      createTestAgentTerminalPresentation('en'),
    );
    const tools = presentToolsCommand(
      executeAgentTerminalToolsSemantic([], context()),
      createTestAgentTerminalPresentation('en'),
    );
    const oneToolContext: CommandContext = {
      toolRegistry: {
        size: 1,
        list: () => [{ name: 'read_file' }],
        get: () => undefined,
        search: () => [],
      },
    };
    const oneTool = presentToolsCommand(
      executeAgentTerminalToolsSemantic([], oneToolContext),
      createTestAgentTerminalPresentation('en'),
    );

    expect(commands.kind === 'output' && commands.output).toContain('Builtin Commands (11):');
    expect(tools.kind === 'output' && tools.output).toContain('Available Tools (2):');
    expect(oneTool.kind === 'output' && oneTool.output).toContain('Available Tool (1):');
  });

  it('keeps tool names, queries, and descriptions unchanged across locales', () => {
    const info = executeAgentTerminalToolsSemantic(['info', 'read_file'], context());
    const search = executeAgentTerminalToolsSemantic(['search', 'read'], context());
    const enInfo = presentToolsCommand(info, createTestAgentTerminalPresentation('en'));
    const zhInfo = presentToolsCommand(info, createTestAgentTerminalPresentation('zh-cn'));
    const zhSearch = presentToolsCommand(search, createTestAgentTerminalPresentation('zh-cn'));

    expect(enInfo.kind === 'output' && enInfo.output).toContain(
      'Read a file without translating provider text.',
    );
    expect(zhInfo.kind === 'output' && zhInfo.output).toContain(
      'Read a file without translating provider text.',
    );
    expect(zhSearch.kind === 'output' && zhSearch.output).toContain('read_file');
    expect(zhSearch.kind === 'output' && zhSearch.output).toContain('“read”');
  });
});
