import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyScenarioSetup,
  deepPartialMatch,
  evaluateScenario,
  evaluateScenarioAssertions,
  validateAndNormalizeScenarioRuntime,
} from './scenario-runtime.mjs';

const temporaryDirectories = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => fs.rm(directory, { recursive: true, force: true })),
  );
});

describe('scenario runtime validation', () => {
  it('rejects unsupported assertions, setup steps, and post-checks before execution', () => {
    expect(() =>
      validateAndNormalizeScenarioRuntime({
        id: 'unsupported-assertion',
        assertions: [{ kind: 'metadata-only-check' }],
      }),
    ).toThrow('assertion[0] kind metadata-only-check is not supported');

    expect(() =>
      validateAndNormalizeScenarioRuntime({
        id: 'unsupported-setup',
        setup: [{ kind: 'shell-command', path: 'fixture.txt' }],
      }),
    ).toThrow('setup[0] kind shell-command is not supported');

    expect(() =>
      validateAndNormalizeScenarioRuntime({
        id: 'unsupported-post-check',
        postChecks: [{ kind: 'manual-inspection' }],
      }),
    ).toThrow('post-check[0] kind manual-inspection is not supported');
  });

  it('rejects traversal and absolute fixture paths', () => {
    for (const path of ['../escape.txt', '/tmp/escape.txt', 'nested/../../escape.txt']) {
      expect(() =>
        validateAndNormalizeScenarioRuntime({
          id: 'unsafe-path',
          setup: [{ kind: 'write-file', path, content: 'nope' }],
        }),
      ).toThrow(/contained relative path|traversal segments/);
    }
  });

  it('validates Markdown path assertions and generic terminal resize sequences', () => {
    const runtime = validateAndNormalizeScenarioRuntime({
      id: 'markdown-resize',
      terminalResizes: [
        { columns: 80, rows: 24 },
        { columns: 24, rows: 20 },
      ],
      assertions: [
        {
          kind: 'markdown-path-events',
          required: ['session-created', 'document-projected', 'layout-created'],
          viewportWidths: [80, 24],
          sameRevisionForViewportWidths: true,
        },
      ],
    });

    expect(runtime.terminalResizes).toEqual([
      { columns: 80, rows: 24 },
      { columns: 24, rows: 20 },
    ]);
    expect(() =>
      validateAndNormalizeScenarioRuntime({
        id: 'invalid-resize',
        terminalResizes: [{ columns: 0, rows: 24 }],
      }),
    ).toThrow('terminalResizes[0].columns must be a positive integer');
  });

  it('normalizes supported Canvas roots without changing prompt-owned variables', () => {
    const runtime = validateAndNormalizeScenarioRuntime(
      {
        id: 'canvas',
        postChecks: [
          {
            kind: 'canvas-json',
            root: '${EVAL_ROOT}/artifacts',
            glob: '**/*.canvas.json',
          },
        ],
      },
      { env: { EVAL_ROOT: '/tmp/eval' } },
    );

    expect(runtime.postChecks).toEqual([
      {
        kind: 'canvas-json',
        root: '/tmp/eval/artifacts',
        glob: '**/*.canvas.json',
      },
    ]);
  });
});

describe('scenario fixture setup and post-checks', () => {
  it('creates the scenario workspace even when setup is empty', async () => {
    const parent = await createTemporaryDirectory();
    const cwd = join(parent, 'empty-setup-workspace');

    await expect(applyScenarioSetup({ cwd, setup: [] })).resolves.toEqual([]);
    await expect(fs.stat(cwd)).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    expect((await fs.stat(cwd)).isDirectory()).toBe(true);
  });

  it('writes and removes only contained workspace paths and reports file evidence', async () => {
    const cwd = await createTemporaryDirectory();
    await fs.mkdir(join(cwd, '.agents/skills/eval-skill'), { recursive: true });
    await fs.writeFile(join(cwd, '.agents/skills/eval-skill/stale.txt'), 'stale');

    const setup = await applyScenarioSetup({
      cwd,
      setup: [
        { kind: 'remove-path', path: '.agents/skills/eval-skill' },
        {
          kind: 'write-file',
          path: '.neko/skills/eval-skill/SKILL.md',
          content: 'legacy poison',
        },
      ],
    });

    expect(setup).toEqual([
      { kind: 'remove-path', path: '.agents/skills/eval-skill', ok: true },
      {
        kind: 'write-file',
        path: '.neko/skills/eval-skill/SKILL.md',
        encoding: 'utf8',
        ok: true,
      },
    ]);

    const evaluation = await evaluateScenario(
      {
        cwd,
        assertions: [],
        postChecks: [
          {
            kind: 'file-exists',
            path: '.neko/skills/eval-skill/SKILL.md',
            equals: 'legacy poison',
          },
          { kind: 'file-absent', path: '.agents/skills/eval-skill' },
        ],
      },
      {},
    );

    expect(evaluation.postChecks).toEqual([
      expect.objectContaining({
        kind: 'file-exists',
        path: '.neko/skills/eval-skill/SKILL.md',
        ok: true,
      }),
      { kind: 'file-absent', path: '.agents/skills/eval-skill', ok: true },
    ]);
  });

  it('rejects workspace paths that cross symlinks', async () => {
    const cwd = await createTemporaryDirectory();
    const outside = await createTemporaryDirectory();
    await fs.symlink(outside, join(cwd, 'linked'));

    await expect(
      applyScenarioSetup({
        cwd,
        setup: [{ kind: 'write-file', path: 'linked/escape.txt', content: 'nope' }],
      }),
    ).rejects.toThrow('scenario path crosses a symlink');
    await expect(fs.stat(join(outside, 'escape.txt'))).rejects.toMatchObject({ code: 'ENOENT' });
  });
});

describe('scenario assertion evaluation', () => {
  const facts = {
    runtimeErrors: [],
    turns: [
      { role: 'user', content: 'create it' },
      {
        id: 'assistant-1',
        role: 'assistant',
        content: 'Created the portable skill and reported the expected conflict.',
        toolCalls: [
          {
            id: 'call-success',
            name: 'CreateSkill',
            status: 'success',
            arguments: {
              target: 'project',
              skill: { name: 'eval-portable-skill', description: 'Evaluate portable skills.' },
            },
            result: {
              created: true,
              source: 'project',
              relativePath: 'eval-portable-skill',
              absolutePath: '/workspace/.agents/skills/eval-portable-skill',
            },
          },
          {
            id: 'call-failure',
            name: 'CreateSkill',
            status: 'error',
            arguments: {
              target: 'project',
              skill: { name: 'eval-conflict-skill' },
            },
            result: { code: 'skill-already-exists' },
            error: 'Skill directory already exists',
          },
        ],
      },
    ],
  };

  it('asserts required and forbidden final-answer text deterministically', () => {
    expect(
      evaluateScenarioAssertions(
        [
          { kind: 'final-answer-contains', text: ['portable skill'] },
          { kind: 'final-answer-not-contains', text: ['generic generation prompt'] },
        ],
        facts,
      ),
    ).toEqual([
      expect.objectContaining({ kind: 'final-answer-contains', ok: true }),
      expect.objectContaining({ kind: 'final-answer-not-contains', ok: true }),
    ]);

    expect(() =>
      evaluateScenarioAssertions(
        [{ kind: 'final-answer-not-contains', text: ['expected conflict'] }],
        facts,
      ),
    ).toThrow('final assistant answer contains forbidden text: expected conflict');
  });

  it('matches structured successful and failed tool-call evidence', () => {
    expect(
      evaluateScenarioAssertions(
        [
          {
            kind: 'tool-call-succeeded',
            name: 'CreateSkill',
            arguments: { target: 'project', skill: { name: 'eval-portable-skill' } },
            result: { source: 'project', relativePath: 'eval-portable-skill' },
            resultContains: ['.agents/skills/eval-portable-skill'],
          },
          {
            kind: 'tool-call-failed',
            name: 'CreateSkill',
            arguments: { skill: { name: 'eval-conflict-skill' } },
            result: { code: 'skill-already-exists' },
            errorContains: ['already exists'],
          },
        ],
        facts,
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'tool-call-succeeded',
        ok: true,
        toolCallId: 'call-success',
      }),
      expect.objectContaining({
        kind: 'tool-call-failed',
        ok: true,
        toolCallId: 'call-failure',
      }),
    ]);
  });

  it('rejects retired Skill activation attempts even when a canonical activation follows', () => {
    const skillFacts = {
      turns: [
        {
          role: 'assistant',
          toolCalls: [
            {
              id: 'call-retired',
              name: 'ActivateSkill',
              status: 'error',
              arguments: { skillName: 'comic-to-storyboard' },
            },
            {
              id: 'call-canonical',
              name: 'ActivateSkill',
              status: 'success',
              arguments: { skillName: 'storyboard' },
            },
          ],
        },
      ],
    };

    expect(() =>
      evaluateScenarioAssertions(
        [{ kind: 'skill-activation-attempts-only', names: ['storyboard'] }],
        skillFacts,
      ),
    ).toThrow('observed forbidden Skill activation attempt(s): comic-to-storyboard');

    expect(
      evaluateScenarioAssertions(
        [{ kind: 'skill-activation-attempts-only', names: ['storyboard'] }],
        {
          turns: [
            {
              role: 'assistant',
              toolCalls: [skillFacts.turns[0].toolCalls[1]],
            },
          ],
        },
      ),
    ).toEqual([
      expect.objectContaining({
        kind: 'skill-activation-attempts-only',
        ok: true,
        observedNames: ['storyboard'],
      }),
    ]);
  });

  it('fails when tool status or structured evidence does not match', () => {
    expect(() =>
      evaluateScenarioAssertions(
        [
          {
            kind: 'tool-call-succeeded',
            name: 'CreateSkill',
            result: { code: 'skill-already-exists' },
          },
        ],
        facts,
      ),
    ).toThrow('expected CreateSkill tool call with status success');
  });

  it('proves assistant text/tool/text chronology and accepted cancellation from generic facts', () => {
    const facts = {
      idle: { fullyIdle: true },
      automation: { messageCancellation: { accepted: true } },
      turns: [
        {
          id: 'assistant-1',
          role: 'assistant',
          timeline: [
            { sequence: 1, kind: 'assistant_text', status: 'complete', content: 'OPENING' },
            { sequence: 2, kind: 'tool', status: 'success', toolName: 'Read' },
            { sequence: 3, kind: 'assistant_text', status: 'complete', content: 'FINAL' },
          ],
        },
      ],
    };
    expect(
      evaluateScenarioAssertions(
        [
          {
            kind: 'timeline-order',
            sequence: [
              { kind: 'assistant_text', contentContains: 'OPENING' },
              { kind: 'tool', toolName: 'Read', status: 'success' },
              { kind: 'assistant_text', contentContains: 'FINAL' },
            ],
          },
          { kind: 'active-message-cancelled' },
        ],
        facts,
      ),
    ).toEqual([
      expect.objectContaining({ kind: 'timeline-order', ok: true, turnId: 'assistant-1' }),
      expect.objectContaining({ kind: 'active-message-cancelled', ok: true }),
    ]);
  });

  it('requires one Markdown session key to prove the canonical path and resize reflow', () => {
    const assertion = {
      kind: 'markdown-path-events',
      required: [
        'session-created',
        'source-updated',
        'document-projected',
        'layout-created',
        'session-finalized',
      ],
      viewportWidths: [80, 24],
      sameRevisionForViewportWidths: true,
    };
    const markdownFacts = {
      markdown: {
        droppedPathEventCount: 0,
        pathEvents: [
          { type: 'session-created', key: 'assistant-1' },
          { type: 'source-updated', key: 'assistant-1', sourceLength: 42 },
          { type: 'document-projected', key: 'assistant-1', revision: 3 },
          { type: 'layout-created', key: 'assistant-1', revision: 3, viewportWidth: 80 },
          { type: 'layout-created', key: 'assistant-1', revision: 3, viewportWidth: 24 },
          { type: 'session-finalized', key: 'assistant-1', revision: 3 },
        ],
      },
    };

    expect(evaluateScenarioAssertions([assertion], markdownFacts)).toEqual([
      expect.objectContaining({
        kind: 'markdown-path-events',
        ok: true,
        keys: ['assistant-1'],
        viewportWidths: [80, 24],
      }),
    ]);
    expect(() =>
      evaluateScenarioAssertions([assertion], {
        markdown: { ...markdownFacts.markdown, droppedPathEventCount: 1 },
      }),
    ).toThrow('1 event(s) were dropped');
  });

  it('implements deterministic deep partial matching', () => {
    expect(
      deepPartialMatch(
        { target: 'project', skill: { name: 'portable', metadata: { domain: 'story' } } },
        { skill: { name: 'portable' } },
      ),
    ).toBe(true);
    expect(deepPartialMatch({ values: [1, 2, 3] }, { values: [1, 2] })).toBe(true);
    expect(deepPartialMatch({ values: [1] }, { values: [1, 2] })).toBe(false);
  });
});

async function createTemporaryDirectory() {
  const directory = await fs.mkdtemp(join(os.tmpdir(), 'neko-agent-eval-'));
  temporaryDirectories.push(directory);
  return directory;
}
