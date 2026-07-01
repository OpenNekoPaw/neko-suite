import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from 'ink-testing-library';
import { InputEditor } from './InputEditor';

afterEach(() => {
  cleanup();
});

describe('InputEditor prefix suggestions', () => {
  it('opens Skill suggestions for a bare dollar trigger when skills are available', async () => {
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        skills: [
          {
            trigger: '$',
            name: 'media-to-video',
            description: 'Create video from media',
            kind: 'skill',
          },
        ],
      }),
    );

    await writeInput(instance, '$');

    expect(instance.lastFrame()).toContain('$media-to-video');
    expect(instance.lastFrame()).toContain('[skill]');
  });

  it('filters slash commands and selects through the slash command path', async () => {
    const onSlashCommand = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        onSlashCommand,
        commands: [
          { name: 'model', description: 'Select model' },
          { name: 'status', description: 'Show status' },
        ],
        skills: [{ trigger: '$', name: 'model-skill', kind: 'skill' }],
      }),
    );

    await writeInput(instance, '/mo');
    expect(instance.lastFrame()).toContain('/model');
    expect(instance.lastFrame()).not.toContain('$model-skill');

    await writeInput(instance, '\r');
    await writeInput(instance, '\r');
    expect(onSlashCommand).toHaveBeenCalledWith('/model');
  });

  it('filters Skill suggestions and submits selected Skill invocation', async () => {
    const onSkillInvocation = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit: vi.fn(),
        onSkillInvocation,
        commands: [{ name: 'review', description: 'Slash review' }],
        skills: [
          { trigger: '$', name: 'review', description: 'Review Skill', kind: 'skill' },
          { trigger: '$', name: 'storyboard', description: 'Storyboard Skill', kind: 'skill' },
        ],
      }),
    );

    await writeInput(instance, '$re');
    expect(instance.lastFrame()).toContain('$review');
    expect(instance.lastFrame()).not.toContain('/review');

    await writeInput(instance, '\r');
    await writeInput(instance, '\r');
    expect(onSkillInvocation).toHaveBeenCalledWith('$review');
  });

  it('filters reference suggestions and inserts text-only mentions', async () => {
    const onSubmit = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit,
        references: [
          {
            trigger: '@',
            name: 'docs/story.md',
            insertText: '@docs/story.md ',
            kind: 'file',
          },
          {
            trigger: '@',
            name: 'asset:image:hero',
            insertText: '@asset:image:hero ',
            kind: 'asset',
          },
        ],
      }),
    );

    await writeInput(instance, '@doc');
    expect(instance.lastFrame()).toContain('@docs/story.md');
    expect(instance.lastFrame()).not.toContain('@asset:image:hero');

    await writeInput(instance, '\r');
    await writeInput(instance, 'summarize');
    await writeInput(instance, '\r');
    expect(onSubmit).toHaveBeenCalledWith('@docs/story.md summarize');
  });

  it('closes the active namespace menu on Escape without submitting', async () => {
    const onSubmit = vi.fn();
    const instance = render(
      React.createElement(InputEditor, {
        onSubmit,
        skills: [{ trigger: '$', name: 'review', kind: 'skill' }],
      }),
    );

    await writeInput(instance, '$r');
    expect(instance.lastFrame()).toContain('$review');

    await writeInput(instance, '\u001B');
    expect(instance.lastFrame()).not.toContain('$review');

    await writeInput(instance, '\r');
    expect(onSubmit).toHaveBeenCalledWith('$r');
  });
});

async function writeInput(instance: ReturnType<typeof render>, value: string): Promise<void> {
  await waitForInkUpdate();
  for (const char of value) {
    instance.stdin.write(char);
    await waitForInkUpdate();
  }
}

function waitForInkUpdate(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}
