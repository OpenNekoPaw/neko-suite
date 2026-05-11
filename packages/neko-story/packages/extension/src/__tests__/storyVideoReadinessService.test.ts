import { describe, expect, it } from 'vitest';
import { parse } from '@neko-story/parser';
import type { CharacterRegistryFile, NekoStoryScriptIndex } from '@neko/shared';
import { buildScriptIndex } from '../services/scriptIndexBuilder';
import { buildStorySceneVideoReadinessRows } from '../services/storyVideoReadinessService';

const scriptUri = {
  toString: () => 'file:///project/demo.fountain',
} as never;

describe('buildStorySceneVideoReadinessRows', () => {
  it('includes standard Fountain character cues as dialogue-character matches', async () => {
    const doc = parse(`INT. OFFICE - DAY

ALICE
We only have one shot.`);
    const index = buildScriptIndex(scriptUri, doc);
    const registry = createRegistry([
      {
        id: 'char-alice',
        canonicalName: 'ALICE',
        aliases: [],
        status: 'confirmed',
        bindings: { assetEntityIds: ['asset-alice'] },
      },
    ]);

    const rows = await buildStorySceneVideoReadinessRows({
      document: doc,
      scriptIndex: index,
      sceneStates: {},
      characterRegistry: registry,
    });

    expect(rows[0]?.characters[0]).toMatchObject({
      name: 'ALICE',
      characterId: 'char-alice',
      matchSource: 'dialogue-character',
      status: 'bound',
    });
  });

  it('detects conservative Chinese narrative mentions from characters.json names', async () => {
    const doc = parse(`EXT. 森林 - 清晨

小猫米米钻出树洞，看见露水发光。`);
    const index = buildScriptIndex(scriptUri, doc);
    const registry = createRegistry([
      {
        id: 'char-mimi',
        canonicalName: '米米',
        displayName: '小猫米米',
        aliases: ['米米'],
        status: 'confirmed',
        defaults: { assetEntityId: 'asset-mimi' },
      },
    ]);

    const rows = await buildStorySceneVideoReadinessRows({
      document: doc,
      scriptIndex: index,
      sceneStates: {},
      characterRegistry: registry,
    });

    expect(rows[0]?.characters).toHaveLength(1);
    expect(rows[0]?.characters[0]).toMatchObject({
      name: '小猫米米',
      characterId: 'char-mimi',
      matchSource: 'registry-mention',
      status: 'bound',
    });
  });

  it('reports missing character visuals when a recognized character has no asset or thumbnail', async () => {
    const doc = parse(`INT. ROOM - DAY

BOB
I need a design.`);
    const index = buildScriptIndex(scriptUri, doc);
    const registry = createRegistry([
      {
        id: 'char-bob',
        canonicalName: 'BOB',
        aliases: [],
        status: 'confirmed',
      },
    ]);

    const rows = await buildStorySceneVideoReadinessRows({
      document: doc,
      scriptIndex: index,
      sceneStates: {},
      characterRegistry: registry,
      thumbnailResolver: async () => undefined,
    });

    expect(rows[0]?.characters[0]).toMatchObject({
      status: 'missing',
      missingReason: 'No usable character visual is available',
      missingReasonKey: 'table.character.missingReason.missingVisual',
    });
    expect(rows[0]?.missingInputs).toContainEqual(
      expect.objectContaining({
        kind: 'character-visual',
        severity: 'blocking',
        label: 'BOB is missing a character visual',
        labelKey: 'table.missingInput.characterVisual',
      }),
    );
    expect(rows[0]?.readinessStatus).toBe('needs-input');
  });

  it('keeps unresolved script characters visible instead of hiding them', async () => {
    const doc = parse(`INT. ROOM - DAY

CASEY
Who am I?`);
    const index = buildScriptIndex(scriptUri, doc);

    const rows = await buildStorySceneVideoReadinessRows({
      document: doc,
      scriptIndex: index,
      sceneStates: {},
      characterRegistry: createRegistry([]),
    });

    expect(rows[0]?.characters[0]).toMatchObject({
      name: 'CASEY',
      status: 'unresolved',
    });
    expect(rows[0]?.missingInputs).toContainEqual(
      expect.objectContaining({
        kind: 'unresolved-character',
        severity: 'blocking',
        label: 'CASEY is not bound to a character identity',
        labelKey: 'table.missingInput.unresolvedCharacter',
      }),
    );
  });

  it('falls back to unknown visual status when the thumbnail service is unavailable', async () => {
    const doc = parse(`INT. ROOM - DAY

ALICE
The asset service is down.`);
    const index = buildScriptIndex(scriptUri, doc);
    const registry = createRegistry([
      {
        id: 'char-alice',
        canonicalName: 'ALICE',
        aliases: [],
        status: 'confirmed',
      },
    ]);

    const rows = await buildStorySceneVideoReadinessRows({
      document: doc,
      scriptIndex: index,
      sceneStates: {},
      characterRegistry: registry,
      thumbnailResolver: async () => {
        throw new Error('assets unavailable');
      },
    });

    expect(rows[0]?.characters[0]).toMatchObject({
      status: 'unknown',
      missingReason:
        'Asset service is unavailable, so the character visual cannot be confirmed yet',
      missingReasonKey: 'table.character.missingReason.assetsUnavailable',
    });
    expect(rows[0]?.missingInputs).toContainEqual(
      expect.objectContaining({
        kind: 'character-visual',
        severity: 'warning',
        label: 'ALICE character visual status is unknown',
        labelKey: 'table.missingInput.characterVisualUnknown',
      }),
    );
  });

  it('merges Canvas scene progress into readiness rows', async () => {
    const doc = parse(`INT. OFFICE - DAY

Alice studies a wall of monitors.`);
    const index = buildScriptIndex(scriptUri, doc);

    const rows = await buildStorySceneVideoReadinessRows({
      document: doc,
      scriptIndex: index,
      sceneStates: {
        [index.scenes[0]!.sceneId]: {
          sceneId: index.scenes[0]!.sceneId,
          agentStatus: 'sent',
          canvasStatus: 'opened',
        },
      },
      canvasSummary: {
        sourceScriptUri: index.uri,
        scenes: [
          {
            sourceScriptUri: index.uri,
            sceneId: index.scenes[0]!.sceneId,
            sceneNodeId: 'scene-node-1',
            shotCount: 2,
            generatedShotCount: 1,
            failedShotCount: 0,
            status: 'partial',
            shots: [],
          },
        ],
      },
    });

    expect(rows[0]?.canvasSummary?.shotCount).toBe(2);
    expect(rows[0]?.allowedActions).toContain('openCanvas');
  });
});

function createRegistry(characters: CharacterRegistryFile['characters']): CharacterRegistryFile {
  return { version: 1, characters };
}
