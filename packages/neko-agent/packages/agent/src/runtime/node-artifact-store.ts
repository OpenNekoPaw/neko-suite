import * as nodeFs from 'node:fs/promises';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { createArtifactWatcher } from '../artifact';
import { createNodeJournalStorage } from '../session/journal-storage';
import { createNekoPaths } from '../workspace';
import { createWorkspaceArtifactService, type ArtifactServiceFsOps } from './artifact-service';
import type { ArtifactWatcherFactory, IArtifactStore, IRuntimeWorkspaceFsOps } from './types';

export interface NodeArtifactStoreConfig {
  readonly workspaceRoot?: string;
  readonly globalPreferencesPath?: string;
  readonly journalBaseDir?: string;
}

export function createNodeRuntimeWorkspaceFsOps(): IRuntimeWorkspaceFsOps & ArtifactServiceFsOps {
  return {
    appendFile: (filePath, data) => nodeFs.appendFile(filePath, data),
    mkdir: async (dirPath, opts) => {
      await nodeFs.mkdir(dirPath, { recursive: opts?.recursive ?? false });
    },
    readFile: (filePath, encoding) => nodeFs.readFile(filePath, encoding),
    writeFile: (filePath, data, encoding) => nodeFs.writeFile(filePath, data, encoding),
  };
}

export function createNodeArtifactStore(config: NodeArtifactStoreConfig = {}): IArtifactStore {
  const journalStorage = createNodeJournalStorage(config.journalBaseDir);
  if (!config.workspaceRoot) {
    return {
      createJournalWriter: (conversationId) => journalStorage.createWriter(conversationId),
    };
  }

  const fsOps = createNodeRuntimeWorkspaceFsOps();
  const nekoPaths = createNekoPaths(config.workspaceRoot);
  const workspace = {
    root: config.workspaceRoot,
    fsOps,
    globalPreferencesPath:
      config.globalPreferencesPath ?? nodePath.join(nodeOs.homedir(), '.neko', 'preferences.md'),
  };
  const artifactWatcherFactory: ArtifactWatcherFactory = ({ eventBus, getRunId }) =>
    createArtifactWatcher({
      paths: nekoPaths,
      eventBus,
      getRunId,
    });

  return {
    workspace,
    artifactService: createWorkspaceArtifactService({
      workspaceRoot: workspace.root,
      fsOps,
    }),
    createJournalWriter: (conversationId) => journalStorage.createWriter(conversationId),
    createArtifactWatcher: artifactWatcherFactory,
  };
}
