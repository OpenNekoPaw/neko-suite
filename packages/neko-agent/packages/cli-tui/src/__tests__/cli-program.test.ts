import { describe, expect, it } from 'vitest';
import { classifyCliCommandRuntime, createCliProgram } from '../cli';

describe('createCliProgram', () => {
  it('advertises Codex-style top-level prompt and command forms', () => {
    const help = createCliProgram().helpInformation();

    expect(help).toContain('Usage: neko [options] [prompt...]');
    expect(help).toContain('neko [options] <command> [args]');
    expect(help).toContain('[prompt...]');
    expect(help).toContain('--cd <dir>');
    expect(help).toContain('resume');
    expect(help).toContain('completion');
    expect(help).toContain('debug');
    expect(help).not.toContain('real-api-suite');
    expect(help).not.toContain('eval');
    expect(help).not.toContain('run');
  });

  it('uses variadic prompt arguments for interactive and experiment commands', () => {
    const program = createCliProgram();
    const interactive = program.commands.find((command) => command.name() === 'interactive');
    const experiment = program.commands.find((command) => command.name() === 'experiment');
    const debug = program.commands.find((command) => command.name() === 'debug');

    expect(interactive?.helpInformation()).toContain(
      'Usage: neko interactive|i [options] [workDir] [prompt...]',
    );
    expect(program.commands.some((command) => command.name() === 'run')).toBe(false);
    expect(experiment?.helpInformation()).toContain('Usage: neko experiment [options] <prompt...>');
    expect(program.commands.some((command) => command.name() === 'real-api-suite')).toBe(false);
    expect(program.commands.some((command) => command.name() === 'eval')).toBe(false);
    expect(debug?.helpInformation()).toContain('Local developer automation');
    const automation = debug?.commands.find((command) => command.name() === 'automation');
    expect(automation?.helpInformation()).toContain('local developer automation protocol');
    expect(automation?.helpInformation()).toContain('--stdio');
  });

  it('documents resume id, prompt, and latest-session options', () => {
    const resume = createCliProgram().commands.find((command) => command.name() === 'resume');
    const help = resume?.helpInformation() ?? '';

    expect(help).toContain('Usage: neko resume [options] [id] [prompt...]');
    expect(help).toContain('--last');
    expect(help).toContain('Optional prompt to submit after resume');
  });

  it('classifies validation and utility commands separately from interactive TUI ownership', () => {
    expect(classifyCliCommandRuntime(undefined)).toBe('interactive-tui');
    expect(classifyCliCommandRuntime('interactive')).toBe('interactive-tui');
    expect(classifyCliCommandRuntime('resume')).toBe('interactive-tui');
    expect(classifyCliCommandRuntime('experiment')).toBe('validation');
    expect(classifyCliCommandRuntime('completion')).toBe('utility');
    expect(classifyCliCommandRuntime('debug')).toBe('utility');
    expect(() => classifyCliCommandRuntime('run')).toThrow('Unknown CLI command runtime class');
    expect(() => classifyCliCommandRuntime('real-api-suite')).toThrow(
      'Unknown CLI command runtime class',
    );
    expect(() => classifyCliCommandRuntime('eval')).toThrow('Unknown CLI command runtime class');
  });
});
