import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const commandSource = readFileSync(join(__dirname, 'index.ts'), 'utf-8');
const messageHandlerSource = readFileSync(
  join(__dirname, '../editor/video/messageHandler.ts'),
  'utf-8',
);
const timelineToolExecutorSource = readFileSync(
  join(__dirname, '../services/TimelineToolExecutor.ts'),
  'utf-8',
);

describe('neko-cut command project-file I/O guardrails', () => {
  it('routes command media adds through the shared Cut project source ingest flow', () => {
    expect(commandSource).toContain('addCutProjectSource(');
    expect(commandSource).toContain("type: 'project:sourceAdded'");
    expect(commandSource).not.toContain('workspace.asRelativePath');
    expect(commandSource).not.toContain("type: 'addMediaFile'");
    expect(commandSource).not.toContain("type: 'importGeneratedClip'");
  });

  it('does not keep the legacy addMediaToTimeline webview message path alive', () => {
    expect(messageHandlerSource).not.toContain("case 'addMediaToTimeline'");
    expect(messageHandlerSource).not.toContain("type: 'fileAdded'");
  });

  it('syncs active editor tool results through the VS Code TextDocument save lifecycle', () => {
    expect(timelineToolExecutorSource).not.toContain('saveCutProjectFile(');
    expect(timelineToolExecutorSource).toContain('model!.syncSavedProjectData(');
    expect(timelineToolExecutorSource).not.toContain('model!.updateProjectData(');
    expect(timelineToolExecutorSource).toContain('projectSession.updateProjectData(');
  });
});
