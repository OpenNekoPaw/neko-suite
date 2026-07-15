import { createHash } from 'node:crypto';
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { AssetLibrary, InMemoryStorage } from '@neko/asset';
import {
  CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX,
  CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
  CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX,
  type NekoAssetsGeneratedCandidatePromotionInput,
} from '@neko/shared';
import { GeneratedCandidatePromotionService } from './GeneratedCandidatePromotionService';

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe('GeneratedCandidatePromotionService AssetLibrary contract', () => {
  it('returns existing Asset identity after a service restart replay', async () => {
    const root = await mkdtemp(path.join(tmpdir(), 'neko-asset-library-promotion-'));
    temporaryDirectories.push(root);
    const sourcePath = path.join(root, '.neko', '.cache', 'generated', 'candidate.png');
    await mkdir(path.dirname(sourcePath), { recursive: true });
    await writeFile(sourcePath, 'candidate bytes');
    const contentDigest = hash('candidate bytes');
    const candidateId = `${CANVAS_GENERATED_DRAFT_CANDIDATE_ID_PREFIX}output:1`;
    const input: NekoAssetsGeneratedCandidatePromotionInput = {
      request: {
        version: CANVAS_GENERATED_DRAFT_GROUP_CONTRACT_VERSION,
        requestId: 'promotion:1',
        projectionId: `${CANVAS_GENERATED_DRAFT_GROUP_ID_PREFIX}task:1`,
        target: {
          documentRef: { kind: 'workspace-path', path: 'neko/boards/concept.nkc' },
          documentId: 'document:1',
          canvasId: 'canvas:1',
          revision: 'canvas-revision:1',
          conversationId: 'conversation:1',
          taskId: 'task:1',
          resolutionSource: 'conversation',
          frozenAt: '2026-07-15T00:00:00.000Z',
        },
        selections: [{ candidateId, revision: 'revision:1', contentDigest }],
        requestedAt: '2026-07-15T00:01:00.000Z',
      },
      sources: [
        {
          candidateId,
          title: 'Concept Candidate',
          mediaKind: 'image',
          mimeType: 'image/png',
          revision: 'revision:1',
          contentDigest,
          sourcePath,
          taskId: 'task:1',
        },
      ],
    };
    const library = new AssetLibrary({
      storage: new InMemoryStorage(),
      pathVariables: new Map([['WORKSPACE', root]]),
    });
    await library.initialize();
    const createService = () =>
      new GeneratedCandidatePromotionService({
        assetFilesRoot: path.join(root, 'neko', 'assets', 'files'),
        fs: {
          readFile,
          writeFile,
          createDirectory: (directory) => mkdir(directory, { recursive: true }),
          exists: async (filePath) => {
            try {
              await access(filePath);
              return true;
            } catch {
              return false;
            }
          },
        },
        registerAsset: async ({ filePath, source, projectionId }) => {
          const imported = await library.importFile(filePath, {
            entityInput: {
              name: source.title,
              category: 'object',
              metadata: {
                source: {
                  type: 'ai-generated',
                  generated: {
                    projectionId,
                    candidateId: source.candidateId,
                    taskId: source.taskId,
                    revision: source.revision,
                    contentDigest: source.contentDigest,
                  },
                },
              },
            },
          });
          return {
            entityId: imported.entity.id,
            variantId: imported.variant.id,
            fileId: imported.file.id,
            path: imported.file.path,
            mediaType: source.mediaKind,
          };
        },
      });

    const first = await createService().promote(input);
    const replayed = await createService().promote(input);

    expect(replayed).toEqual(first);
    expect(await library.getAllEntities()).toHaveLength(1);
    expect(first.items[0]).toMatchObject({
      status: 'saved',
      asset: { path: expect.stringMatching(/^\$\{WORKSPACE\}\//) },
    });
  });
});

function hash(content: string): string {
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}
