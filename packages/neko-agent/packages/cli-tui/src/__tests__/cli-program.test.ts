import { describe, expect, it } from 'vitest';
import { createCliProgram } from '../cli';

describe('createCliProgram', () => {
  it('advertises Codex-style top-level prompt and command forms', () => {
    const help = createCliProgram().helpInformation();

    expect(help).toContain('Usage: neko [options] [prompt...]');
    expect(help).toContain('neko [options] <command> [args]');
    expect(help).toContain('[prompt...]');
    expect(help).toContain('--cd <dir>');
    expect(help).toContain('resume');
    expect(help).toContain('completion');
  });

  it('uses variadic prompt arguments for interactive, run, and experiment commands', () => {
    const program = createCliProgram();
    const interactive = program.commands.find((command) => command.name() === 'interactive');
    const run = program.commands.find((command) => command.name() === 'run');
    const experiment = program.commands.find((command) => command.name() === 'experiment');

    expect(interactive?.helpInformation()).toContain(
      'Usage: neko interactive|i [options] [workDir] [prompt...]',
    );
    expect(run?.helpInformation()).toContain('Usage: neko run [options] <prompt...>');
    expect(experiment?.helpInformation()).toContain('Usage: neko experiment [options] <prompt...>');
  });

  it('documents resume id, prompt, and latest-session options', () => {
    const resume = createCliProgram().commands.find((command) => command.name() === 'resume');
    const help = resume?.helpInformation() ?? '';

    expect(help).toContain('Usage: neko resume [options] [id] [prompt...]');
    expect(help).toContain('--last');
    expect(help).toContain('Optional prompt to submit after resume');
  });
});
