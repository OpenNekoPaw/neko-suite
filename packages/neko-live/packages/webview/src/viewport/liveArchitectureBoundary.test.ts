import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const WEBVIEW_SRC = new URL('../', import.meta.url);

describe('neko-live viewport architecture boundaries', () => {
  it('does not import model or puppet controller implementations', () => {
    const offenders = sourceFiles(WEBVIEW_SRC.pathname).filter((filePath) => {
      if (filePath.endsWith('liveArchitectureBoundary.test.ts')) return false;
      const text = readFileSync(filePath, 'utf8');
      return /neko-(model|puppet).*controller|ModelController|PuppetSceneController/.test(text);
    });

    expect(offenders.map((filePath) => relative(WEBVIEW_SRC.pathname, filePath))).toEqual([]);
  });

  it('keeps local R3F and puppet renderers behind the live local preview surface', () => {
    const allowed = new Set(['viewport/LiveLocalPreviewSurface.tsx']);
    const offenders = sourceFiles(WEBVIEW_SRC.pathname).filter((filePath) => {
      const relativePath = relative(WEBVIEW_SRC.pathname, filePath);
      if (relativePath === 'viewport/liveArchitectureBoundary.test.ts') return false;
      if (allowed.has(relativePath)) return false;

      const text = readFileSync(filePath, 'utf8');
      return /components\/(?:Viewport3D|PuppetViewer)|<Viewport3D\b|<PuppetViewer\b/.test(text);
    });

    expect(offenders.map((filePath) => relative(WEBVIEW_SRC.pathname, filePath))).toEqual([]);
  });
});

function sourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      files.push(...sourceFiles(path));
      continue;
    }
    if (/\.(ts|tsx)$/.test(entry)) {
      files.push(path);
    }
  }
  return files;
}
