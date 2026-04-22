import { describe, it, expect } from 'vitest';
import { createNekoPaths, NEKO_SUBDIRS, NEKO_LOG_FILES, NEKO_STATE_FILES } from '../neko-paths';

describe('NekoPaths', () => {
  it('root is <projectRoot>/.neko', () => {
    const p = createNekoPaths('/home/user/proj');
    expect(p.root).toBe('/home/user/proj/.neko');
  });

  it('normalises trailing slash on the project root', () => {
    const p = createNekoPaths('/home/user/proj/');
    expect(p.root).toBe('/home/user/proj/.neko');
  });

  it('throws when projectRoot is empty', () => {
    expect(() => createNekoPaths('')).toThrow(/projectRoot is required/);
  });

  it('dir() returns canonical subdir paths', () => {
    const p = createNekoPaths('/r');
    expect(p.dir('proposals')).toBe(`/r/.neko/${NEKO_SUBDIRS.proposals}`);
    expect(p.dir('plans')).toBe(`/r/.neko/${NEKO_SUBDIRS.plans}`);
    expect(p.dir('todos')).toBe(`/r/.neko/${NEKO_SUBDIRS.todos}`);
    expect(p.dir('sessions')).toBe(`/r/.neko/${NEKO_SUBDIRS.sessions}`);
    expect(p.dir('logs')).toBe(`/r/.neko/${NEKO_SUBDIRS.logs}`);
    expect(p.dir('cache')).toBe(`/r/.neko/${NEKO_SUBDIRS.cache}`);
    expect(p.dir('state')).toBe(`/r/.neko/${NEKO_SUBDIRS.state}`);
    expect(p.dir('archives')).toBe(`/r/.neko/${NEKO_SUBDIRS.archives}`);
  });

  it('file() appends the canonical extension for each AI family', () => {
    const p = createNekoPaths('/r');
    expect(p.file('proposals', 'tiktok-001')).toBe('/r/.neko/proposals/tiktok-001.nkproposal.md');
    expect(p.file('plans', 'tiktok-001')).toBe('/r/.neko/plans/tiktok-001.nkplan.md');
    expect(p.file('todos', 'tiktok-001')).toBe('/r/.neko/todos/tiktok-001.nktodo.md');
    expect(p.file('sessions', 'run-a')).toBe('/r/.neko/sessions/run-a.nksession.md');
    expect(p.file('archives', '2026-04')).toBe('/r/.neko/archives/2026-04.md');
  });

  it('file() strips a duplicate canonical extension from the basename', () => {
    const p = createNekoPaths('/r');
    expect(p.file('proposals', 'tiktok-001.nkproposal.md')).toBe(
      '/r/.neko/proposals/tiktok-001.nkproposal.md',
    );
  });

  it('file() rejects empty basename', () => {
    const p = createNekoPaths('/r');
    expect(() => p.file('proposals', '')).toThrow(/basename is required/);
  });

  it('log() returns canonical JSONL paths', () => {
    const p = createNekoPaths('/r');
    expect(p.log('events')).toBe(`/r/.neko/logs/${NEKO_LOG_FILES.events}`);
    expect(p.log('audits')).toBe(`/r/.neko/logs/${NEKO_LOG_FILES.audits}`);
    expect(p.log('steps')).toBe(`/r/.neko/logs/${NEKO_LOG_FILES.steps}`);
  });

  it('state() returns canonical state file paths', () => {
    const p = createNekoPaths('/r');
    expect(p.state('sessionLock')).toBe(`/r/.neko/state/${NEKO_STATE_FILES.sessionLock}`);
  });
});
