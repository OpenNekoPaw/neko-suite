import { describe, it, expect } from 'vitest';
import { parse } from '@neko-story/parser';
import { TimelineConverter } from '../converters/TimelineConverter';

const SAMPLE_SCRIPT = `Title: My Film

INT. OFFICE - DAY

ALICE
Hello there.

BOB
How are you?

EXT. PARK - NIGHT

ALICE
Goodbye.`;

describe('TimelineConverter', () => {
  const converter = new TimelineConverter();

  it('returns correct scene count', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    expect(result.sceneCount).toBe(2);
  });

  it('extracts character names', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    expect(result.characterNames).toContain('ALICE');
    expect(result.characterNames).toContain('BOB');
  });

  it('total duration is positive', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    expect(result.totalDurationSec).toBeGreaterThan(0);
  });

  it('project has two tracks', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    expect(result.project.tracks).toHaveLength(2);
  });

  it('scene track (index 0) has one element per scene', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    const sceneTrack = result.project.tracks[0];
    expect(sceneTrack?.elements).toHaveLength(2);
  });

  it('subtitle track (index 1) has one element per dialogue line', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'My Film');
    const subtitleTrack = result.project.tracks[1];
    expect(subtitleTrack?.elements).toHaveLength(3);
  });

  it('uses title page name when available', () => {
    const doc = parse(SAMPLE_SCRIPT);
    const result = converter.convert(doc, 'fallback');
    expect(result.project.name).toBe('My Film');
  });

  it('falls back to provided name when no title page', () => {
    const doc = parse('INT. PARK - DAY\n\nSome action.');
    const result = converter.convert(doc, 'fallback');
    expect(result.project.name).toBe('fallback');
  });

  it('scene elements have minimum 3 second duration', () => {
    const doc = parse('INT. EMPTY SCENE - DAY\n\nShort.');
    const result = converter.convert(doc, 'test');
    const sceneTrack = result.project.tracks[0];
    const el = sceneTrack?.elements[0];
    expect(el).toBeDefined();
    if (el) expect(el.duration).toBeGreaterThanOrEqual(3);
  });
});
