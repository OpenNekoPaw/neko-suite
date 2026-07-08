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
    expect(help).toContain('real-api-suite');
  });

  it('uses variadic prompt arguments for interactive, run, and experiment commands', () => {
    const program = createCliProgram();
    const interactive = program.commands.find((command) => command.name() === 'interactive');
    const run = program.commands.find((command) => command.name() === 'run');
    const experiment = program.commands.find((command) => command.name() === 'experiment');
    const realApiSuite = program.commands.find((command) => command.name() === 'real-api-suite');

    expect(interactive?.helpInformation()).toContain(
      'Usage: neko interactive|i [options] [workDir] [prompt...]',
    );
    expect(run?.helpInformation()).toContain('Usage: neko run [options] <prompt...>');
    expect(run?.helpInformation()).toContain('--result-file <path>');
    expect(experiment?.helpInformation()).toContain('Usage: neko experiment [options] <prompt...>');
    expect(realApiSuite?.helpInformation()).toContain('Run TUI real API validation cases');
  });

  it('documents resume id, prompt, and latest-session options', () => {
    const resume = createCliProgram().commands.find((command) => command.name() === 'resume');
    const help = resume?.helpInformation() ?? '';

    expect(help).toContain('Usage: neko resume [options] [id] [prompt...]');
    expect(help).toContain('--last');
    expect(help).toContain('Optional prompt to submit after resume');
  });

  it('classifies headless and validation commands separately from interactive TUI ownership', () => {
    expect(classifyCliCommandRuntime(undefined)).toBe('interactive-tui');
    expect(classifyCliCommandRuntime('interactive')).toBe('interactive-tui');
    expect(classifyCliCommandRuntime('resume')).toBe('interactive-tui');
    expect(classifyCliCommandRuntime('run')).toBe('headless');
    expect(classifyCliCommandRuntime('experiment')).toBe('validation');
    expect(classifyCliCommandRuntime('real-api-suite')).toBe('validation');
    expect(classifyCliCommandRuntime('completion')).toBe('utility');
  });
});
