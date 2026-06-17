/**
 * ProjectSessionService
 *
 * 目标：
 * - 为 HTTP/外部调用提供“已加载/已创建项目”的无 Webview 执行上下文
 * - 当没有活动 VideoEditorModel 时，提供 ProjectData 的读写能力
 *
 * 说明：
 * - 若通过 load(path) 加载，则会将变更写回该 .nkv 文件（以 JSON 形式全量覆盖）
 * - 若通过 create() 创建，则仅维护内存态 ProjectData（不落盘）
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { ProjectData, ProjectFileOps } from '@neko/shared';
import {
  ProjectFileStore,
  createDefaultProject,
  createDefaultProjectFormatCodecRegistry,
  nkvSourcePathPolicy,
} from '@neko/shared';
import { createServiceId } from '../base';

export interface ProjectSessionInfo {
  loaded: boolean;
  /** 仅 file 会有 path */
  path?: string;
  source: 'file' | 'memory';
}

export interface IProjectSessionService {
  load(filePath: string): Promise<void>;
  create(options?: { name?: string; width?: number; height?: number; fps?: number }): Promise<void>;
  isLoaded(): boolean;
  getInfo(): ProjectSessionInfo | null;
  getProjectData(): ProjectData | null;
  updateProjectData(data: ProjectData): Promise<void>;
  clear(): void;
  dispose(): void;
}

export const IProjectSessionService =
  createServiceId<IProjectSessionService>('projectSessionService');

export class ProjectSessionService implements IProjectSessionService {
  private session: { info: ProjectSessionInfo; project: ProjectData } | null = null;
  private readonly store: ProjectFileStore;

  constructor(fileOps: ProjectFileOps = createNodeProjectFileOps()) {
    this.store = new ProjectFileStore({
      registry: createDefaultProjectFormatCodecRegistry(),
      fileOps,
    });
  }

  async load(filePath: string): Promise<void> {
    if (!filePath || typeof filePath !== 'string') {
      throw new Error('Project path is required');
    }

    const normalizedPath = path.resolve(filePath);
    const result = await this.store.load<ProjectData>({
      filePath: normalizedPath,
      formatId: 'nkv',
    });

    if (!result.document || !result.ok) {
      throw new Error(
        formatProjectFileDiagnostics(result.diagnostics, 'Failed to load NKV project'),
      );
    }

    this.session = {
      info: { loaded: true, path: normalizedPath, source: 'file' },
      project: result.document,
    };
  }

  async create(options?: {
    name?: string;
    width?: number;
    height?: number;
    fps?: number;
  }): Promise<void> {
    const project = createDefaultProject(options?.name ?? 'Untitled Project');
    if (options?.width && options?.height) {
      project.resolution = { width: options.width, height: options.height };
    }
    if (options?.fps) {
      project.fps = options.fps;
    }

    this.session = {
      info: { loaded: true, source: 'memory' },
      project,
    };
  }

  isLoaded(): boolean {
    return this.session?.info.loaded ?? false;
  }

  getInfo(): ProjectSessionInfo | null {
    return this.session?.info ?? null;
  }

  getProjectData(): ProjectData | null {
    return this.session?.project ?? null;
  }

  async updateProjectData(data: ProjectData): Promise<void> {
    if (!this.session) {
      throw new Error('No project loaded');
    }

    this.session.project = data;

    // file-backed：写回磁盘（全量覆盖，保证与 VideoEditorModel 的 applyEdit 行为一致）
    const filePath = this.session.info.source === 'file' ? this.session.info.path : undefined;
    if (!filePath) {
      return;
    }

    const result = await this.store.save({
      filePath,
      formatId: 'nkv',
      document: data,
      sourcePolicy: nkvSourcePathPolicy,
      sourcePolicyOptions: {
        context: {
          owningWorkspaceRoot: path.dirname(filePath),
          workspaceRoots: [path.dirname(filePath)],
          documentDir: path.dirname(filePath),
          pathVariables: new Map([['PROJECT', path.dirname(filePath)]]),
        },
      },
    });
    if (!result.ok) {
      throw new Error(
        formatProjectFileDiagnostics(result.diagnostics, 'Failed to save NKV project'),
      );
    }
  }

  clear(): void {
    this.session = null;
  }

  dispose(): void {
    this.clear();
  }
}

function createNodeProjectFileOps(): ProjectFileOps {
  return {
    readFile: async (filePath) => new Uint8Array(await fs.readFile(filePath)),
    writeFile: async (filePath, content) => {
      await fs.writeFile(filePath, content);
    },
    deleteFile: async (filePath) => {
      await fs.rm(filePath, { force: true });
    },
    renameFile: async (fromPath, toPath) => {
      await fs.rename(fromPath, toPath);
    },
  };
}

function formatProjectFileDiagnostics(
  diagnostics: readonly { readonly message: string }[],
  fallback: string,
): string {
  if (diagnostics.length === 0) return fallback;
  return `${fallback}: ${diagnostics.map((diagnostic) => diagnostic.message).join('; ')}`;
}
