import { describe, expect, it } from 'vitest';
import { buildTemplatePrompt, buildShotTemplatePrompt } from '../pipeline-adapters';

describe('buildTemplatePrompt', () => {
  const baseScene = {
    index: 0,
    heading: 'INT. COFFEE SHOP - MORNING',
    description: 'A cozy coffee shop with warm lighting.',
    dialogue: ['Hello there!', 'Nice to meet you.'],
    estimatedDuration: 15,
    suggestedPrompt: '',
  };

  it('includes all scene fields in the template', () => {
    const result = buildTemplatePrompt(baseScene);

    expect(result).toContain('Scene: INT. COFFEE SHOP - MORNING');
    expect(result).toContain('Visual: A cozy coffee shop with warm lighting.');
    expect(result).toContain('Action: Hello there!; Nice to meet you.');
    expect(result).toContain('Duration: 15s');
  });

  it('includes global style when provided', () => {
    const result = buildTemplatePrompt(baseScene, 'anime');
    expect(result).toContain('Style: anime');
  });

  it('omits style line when globalStyle is undefined', () => {
    const result = buildTemplatePrompt(baseScene);
    expect(result).not.toContain('Style:');
  });

  it('includes camera info from first shot plan', () => {
    const scene = {
      ...baseScene,
      shotPlans: [{ shotScale: 'LS' as const, cameraMovement: 'dolly-in' as const }],
    };
    const result = buildTemplatePrompt(scene);
    expect(result).toContain('Camera: LS / dolly-in');
  });

  it('omits camera line when no shot plans', () => {
    const result = buildTemplatePrompt(baseScene);
    expect(result).not.toContain('Camera:');
  });

  it('truncates dialogue to 2 lines', () => {
    const scene = {
      ...baseScene,
      dialogue: ['Line 1', 'Line 2', 'Line 3'],
    };
    const result = buildTemplatePrompt(scene);
    expect(result).toContain('Action: Line 1; Line 2');
    expect(result).not.toContain('Line 3');
  });
});

describe('buildShotTemplatePrompt', () => {
  const scene = {
    index: 0,
    heading: 'EXT. PARK - DAY',
    description: 'A sunny park.',
    dialogue: [],
    estimatedDuration: 20,
    suggestedPrompt: '',
  };

  const shot = {
    shotNumber: 1,
    duration: 5,
    visualDescription: 'Wide shot of the park with children playing.',
    characters: [{ characterName: 'ALICE' }, { characterName: 'BOB' }],
    shotScale: 'LS' as const,
    cameraMovement: 'pan' as const,
    cameraAngle: 'eye-level' as const,
    emotion: ['joyful', 'peaceful'] as readonly string[],
  };

  it('includes scene heading and shot details', () => {
    const result = buildShotTemplatePrompt(scene, shot);

    expect(result).toContain('Scene: EXT. PARK - DAY');
    expect(result).toContain('Visual: Wide shot of the park with children playing.');
    expect(result).toContain('Duration: 5s');
    expect(result).toContain('Camera: LS / pan / eye-level');
    expect(result).toContain('Characters: ALICE, BOB');
    expect(result).toContain('Mood: joyful, peaceful');
  });

  it('includes global style when provided', () => {
    const result = buildShotTemplatePrompt(scene, shot, 'cinematic');
    expect(result).toContain('Style: cinematic');
  });

  it('omits optional fields when not present', () => {
    const minimalShot = { shotNumber: 1 };
    const result = buildShotTemplatePrompt(scene, minimalShot);

    expect(result).toContain('Scene: EXT. PARK - DAY');
    expect(result).not.toContain('Visual:');
    expect(result).not.toContain('Duration:');
    expect(result).not.toContain('Camera:');
    expect(result).not.toContain('Characters:');
    expect(result).not.toContain('Mood:');
  });
});
