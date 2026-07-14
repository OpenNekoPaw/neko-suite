import * as nodeFs from 'node:fs/promises';
import * as nodeOs from 'node:os';
import * as nodePath from 'node:path';
import { createNodeJournalStorage } from '../../session/journal-storage';
import type { IRuntimeWorkspaceFsOps, IWorkspaceRuntimeStore } from '../types';

export interface NodeWorkspaceRuntimeStoreConfig {
  readonly workspaceRoot?: string;
  readonly globalPreferencesPath?: string;
  readonly journalBaseDir?: string;
}

export function createNodeRuntimeWorkspaceFsOps(): IRuntimeWorkspaceFsOps {
  return {
    appendFile: (filePath, data) => nodeFs.appendFile(filePath, data),
    mkdir: async (dirPath, options) => {
      await nodeFs.mkdir(dirPath, { recursive: options?.recursive ?? false });
    },
    readFile: (filePath, encoding) => nodeFs.readFile(filePath, encoding),
    writeFile: (filePath, data, encoding) => nodeFs.writeFile(filePath, data, encoding),
  };
}

export function createNodeWorkspaceRuntimeStore(
  config: NodeWorkspaceRuntimeStoreConfig = {},
): IWorkspaceRuntimeStore {
  const journalStorage = createNodeJournalStorage(config.journalBaseDir);
  if (!config.workspaceRoot) {
    return {
      createJournalWriter: (conversationId) => journalStorage.createWriter(conversationId),
    };
  }

  return {
    workspace: {
      root: config.workspaceRoot,
      fsOps: createNodeRuntimeWorkspaceFsOps(),
      globalPreferencesPath:
        config.globalPreferencesPath ?? nodePath.join(nodeOs.homedir(), '.neko', 'preferences.md'),
    },
    createJournalWriter: (conversationId) => journalStorage.createWriter(conversationId),
  };
}
