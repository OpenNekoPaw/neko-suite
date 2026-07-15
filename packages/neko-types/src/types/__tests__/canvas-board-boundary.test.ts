import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const repositoryRoot = resolve(import.meta.dirname, '../../../../..');

function read(relativePath: string): string {
  return readFileSync(resolve(repositoryRoot, relativePath), 'utf8');
}

describe('Canvas Board package boundaries', () => {
  it('keeps Agent on public shared/Canvas API contracts', () => {
    const source = read(
      'packages/neko-agent/packages/extension/src/services/agentCanvasBoardCoordinator.ts',
    );

    expect(source).toContain("from '@neko/shared'");
    expect(source).not.toMatch(/from ['"].*neko-canvas\/packages/);
    expect(source).not.toMatch(/from ['"].*canvasProjectAuthoringService/);
    expect(source).not.toMatch(/from ['"].*canvasBoardResolverService/);
  });

  it('keeps Canvas Board services independent from Agent runtime internals', () => {
    const source = [
      'canvasBoardIndexService.ts',
      'canvasBoardResolverService.ts',
      'canvasBoardDeliveryService.ts',
      'canvasBoardProjection.ts',
    ]
      .map((file) => read(`packages/neko-canvas/packages/extension/src/services/${file}`))
      .join('\n');

    expect(source).not.toMatch(/from ['"]@neko\/agent/);
    expect(source).not.toMatch(/from ['"]@neko-agent/);
    expect(source).not.toMatch(/packages\/neko-agent/);
  });
});
