import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      toString: () => `file://${fsPath}`,
    }),
  },
}));

import * as vscode from 'vscode';
import { parse } from '@neko-story/parser';
import { buildScriptIndex } from '../services/scriptIndexBuilder';

describe('buildScriptIndex', () => {
  it('adds stable scene metadata fields', () => {
    const doc = parse(`INT. OFFICE - DAY

Alice studies a wall of monitors.

ALICE
We only have one shot.

EXT. STREET - NIGHT

Rain hits the asphalt.

BOB
Then make it count.`);

    const index = buildScriptIndex(vscode.Uri.file('/project/demo.fountain') as never, doc);

    expect(index.scenes).toHaveLength(2);
    expect(index.scenes[0]).toMatchObject({
      id: expect.stringMatching(/^scene_/),
      sceneId: expect.stringMatching(/^scene_/),
      sceneTitle: 'INT. OFFICE - DAY',
      location: 'OFFICE',
      timeOfDay: 'DAY',
      sceneCharacters: ['ALICE'],
      actionSummary: 'Alice studies a wall of monitors.',
    });
    expect(index.scenes[0]!.estimatedDuration).toBeGreaterThan(0);
    expect(index.characters[0]).toMatchObject({
      name: 'ALICE',
      scene_ids: [index.scenes[0]!.sceneId],
    });
  });

  it('keeps scene ids stable when lines are inserted above a scene', () => {
    const baseDoc = parse(`INT. OFFICE - DAY

Alice studies a wall of monitors.`);
    const shiftedDoc = parse(`Title: Demo

INT. OFFICE - DAY

Alice studies a wall of monitors.`);

    const baseIndex = buildScriptIndex(vscode.Uri.file('/project/base.fountain') as never, baseDoc);
    const shiftedIndex = buildScriptIndex(
      vscode.Uri.file('/project/shifted.fountain') as never,
      shiftedDoc,
    );

    expect(baseIndex.scenes[0]!.sceneId).toBe(shiftedIndex.scenes[0]!.sceneId);
    expect(baseIndex.scenes[0]!.line_start).not.toBe(shiftedIndex.scenes[0]!.line_start);
  });
});
