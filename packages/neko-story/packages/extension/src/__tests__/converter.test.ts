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

  describe('Asset References', () => {
    it('creates media track when image asset reference exists', () => {
      const script = `INT. LAB - NIGHT

[[IMAGE: diagram.png]]

The scientist points at the screen.`;

      const doc = parse(script);
      const result = converter.convert(doc, 'test');

      expect(result.project.tracks).toHaveLength(3);
      const mediaTrack = result.project.tracks[0];
      expect(mediaTrack?.type).toBe('media');
      expect(mediaTrack?.elements).toHaveLength(1);
    });

    it('creates media element with correct properties for image', () => {
      const script = `INT. LAB - NIGHT

[[IMAGE: path/to/diagram.png]]

Action text.`;

      const doc = parse(script);
      const result = converter.convert(doc, 'test');

      const mediaTrack = result.project.tracks[0];
      const mediaEl = mediaTrack?.elements[0];

      expect(mediaEl).toBeDefined();
      if (mediaEl && mediaEl.type === 'media') {
        expect(mediaEl.src).toBe('path/to/diagram.png');
        expect(mediaEl.mediaType).toBe('image');
        expect(mediaEl.muted).toBe(true);
      }
    });

    it('creates media element with correct properties for video', () => {
      const script = `INT. OFFICE - DAY

[[VIDEO: establishing.mp4]]

John enters.`;

      const doc = parse(script);
      const result = converter.convert(doc, 'test');

      const mediaTrack = result.project.tracks[0];
      const mediaEl = mediaTrack?.elements[0];

      expect(mediaEl).toBeDefined();
      if (mediaEl && mediaEl.type === 'media') {
        expect(mediaEl.src).toBe('establishing.mp4');
        expect(mediaEl.mediaType).toBe('video');
        expect(mediaEl.muted).toBe(false);
      }
    });

    it('handles multiple asset references in different scenes', () => {
      const script = `INT. LAB - DAY

[[IMAGE: slide_01.png]]

First scene.

INT. OFFICE - NIGHT

[[IMAGE: slide_02.png]]

Second scene.`;

      const doc = parse(script);
      const result = converter.convert(doc, 'test');

      const mediaTrack = result.project.tracks[0];
      expect(mediaTrack?.elements).toHaveLength(2);
    });

    it('does not create media track when no asset references exist', () => {
      const script = `INT. OFFICE - DAY

[[Just a regular note]]

John walks in.`;

      const doc = parse(script);
      const result = converter.convert(doc, 'test');

      expect(result.project.tracks).toHaveLength(2);
      expect(result.project.tracks[0]?.type).toBe('text');
    });

    it('supports ASSET protocol syntax', () => {
      const script = `INT. LAB - NIGHT

[[ASSET: video://clip.mp4]]

Action.`;

      const doc = parse(script);
      const result = converter.convert(doc, 'test');

      const mediaTrack = result.project.tracks[0];
      const mediaEl = mediaTrack?.elements[0];

      expect(mediaEl).toBeDefined();
      if (mediaEl && mediaEl.type === 'media') {
        expect(mediaEl.src).toBe('clip.mp4');
        expect(mediaEl.mediaType).toBe('video');
      }
    });
  });
});
