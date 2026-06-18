/**
 * TimelineToolExecutor
 *
 * Delegates timeline tool operations (deterministic transforms on ProjectData)
 * to a strategy-based handler registry. Execution is serialized to prevent
 * concurrent read/write race conditions.
 *
 * - Prefers active VideoEditorModel (write-back triggers VSCode undo/redo)
 * - Falls back to ProjectSession when no active editor is available
 */

import * as vscode from 'vscode';
import type { ProjectData } from '@neko/shared';
import { createDefaultProject } from '@neko/shared';
import { getService } from '../base';
import { IEditorRegistry } from '../editor/common/editorRegistry';
import type { VideoEditorModel } from '../editor/video/videoEditorModel';
import { IProjectSessionService } from './ProjectSessionService';
import { createToolRegistry } from './tools';
import type { IToolHandler } from './tools';
import { normalizePathsForSave } from './tools/helpers';

/**
 * Tool execution result (local type, replaces @neko/agent ToolResult)
 */
interface ToolResult {
  success: boolean;
  error?: string;
  data?: unknown;
  duration?: number;
}

export class TimelineToolExecutor {
  private pending: Promise<void> = Promise.resolve();
  private readonly registry: Map<string, IToolHandler>;

  constructor() {
    this.registry = createToolRegistry();
  }

  async execute(toolName: string, params: Record<string, unknown>): Promise<ToolResult> {
    const start = Date.now();

    // Serialize execution to prevent concurrent read/write data loss
    const run = async (): Promise<ToolResult> => {
      const editorRegistry = getService(IEditorRegistry);
      const projectSession = getService(IProjectSessionService);

      if (!editorRegistry) {
        return {
          success: false,
          error: 'EditorRegistry service not available',
          duration: Date.now() - start,
        };
      }

      const active = editorRegistry.getActiveEditor();
      let model: VideoEditorModel | null =
        active && active.type === 'video' ? (active as unknown as VideoEditorModel) : null;

      const sessionInfo = projectSession?.getInfo() ?? null;
      if (!model && sessionInfo?.path) {
        const maybe = editorRegistry.getEditorByUri(vscode.Uri.file(sessionInfo.path));
        if (maybe && maybe.type === 'video') {
          model = maybe as unknown as VideoEditorModel;
        }
      }

      let project: ProjectData | null = null;
      let writeBack: ((next: ProjectData) => Promise<void>) | null = null;
      let projectFilePath: string | undefined;

      if (model) {
        project = model.getProjectData();
        projectFilePath = model.uri.fsPath;
        writeBack = async (next) => {
          await model!.syncSavedProjectData(await normalizePathsForSave(next, model!.uri.fsPath));
        };
      } else if (projectSession?.isLoaded()) {
        project = projectSession.getProjectData();
        projectFilePath = sessionInfo?.path;
        writeBack = async (next) => {
          await projectSession.updateProjectData(
            await normalizePathsForSave(next, projectFilePath),
          );
        };
      }

      if (!project || !writeBack) {
        return {
          success: false,
          error:
            'No project loaded. Open a .nkv file or call POST /api/v1/project/load|create first.',
          duration: Date.now() - start,
        };
      }

      // Delegate to handler via registry lookup
      const handler = this.registry.get(toolName);
      if (!handler) {
        return {
          success: false,
          error: `Unknown tool: ${toolName}`,
          duration: Date.now() - start,
        };
      }

      const result = handler.apply(project, toolName, params);
      if (!result.success) {
        return { success: false, error: result.error, duration: Date.now() - start };
      }

      if (result.updatedProject) {
        await writeBack(result.updatedProject);
      }

      return { success: true, data: result.data, duration: Date.now() - start };
    };

    const task = this.pending.then(run, run) as Promise<ToolResult>;
    this.pending = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
}

/**
 * Convenience: create an empty project (fallback for ProjectSession.create)
 */
export function createEmptyProject(): ProjectData {
  return createDefaultProject();
}
