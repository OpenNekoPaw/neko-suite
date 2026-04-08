import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const extensionSource = readFileSync(join(__dirname, '../extension.ts'), 'utf-8');
const capabilitySource = readFileSync(join(__dirname, '../agentCapabilityProvider.ts'), 'utf-8');

describe('canvas storyboard import contracts', () => {
  it('exports a storyboard import API on NekoCanvasAPI implementation', () => {
    expect(extensionSource).toContain('storyboard: {');
    expect(extensionSource).toContain('import: (payload, options) => importStoryboardToCanvas(api, payload, options)');
  });

  it('registers a public command for storyboard payload import', () => {
    expect(extensionSource).toContain("'neko.canvas.importStoryboard'");
  });

  it('routes agent storyboard import through the canvas storyboard API', () => {
    expect(capabilitySource).toContain('api.storyboard.import(payload, { startX, startY })');
  });
});
