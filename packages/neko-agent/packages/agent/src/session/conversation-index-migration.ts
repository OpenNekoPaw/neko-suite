/**
 * One-off migration helper for legacy ~/.neko/conversations/*.json files.
 *
 * The migration reuses FileConversationStorage's explicit legacy-import path:
 * for each discovered workDir, instantiate the storage and force an initial
 * list() call so legacy records are normalized into conversations-index.json.
 */

import type { FileConversationStorage } from './file-conversation-storage';
import type { ConversationIndex } from './conversation-record';
import { getLogger } from '../utils/logger';

const logger = getLogger('ConversationIndexMigration');

export interface ConversationIndexMigrationFsOps {
  readdir: (path: string) => Promise<string[]>;
  readFile: (path: string) => Promise<string>;
}

export interface ConversationIndexMigrationOptions {
  legacyConversationsDir: string;
  fsOps: ConversationIndexMigrationFsOps;
  createStorage: (workDir: string) => Pick<FileConversationStorage, 'list' | 'dispose'>;
}

export interface ConversationIndexMigrationResult {
  scannedFiles: number;
  discoveredWorkDirs: number;
  migratedWorkDirs: number;
  failedFiles: string[];
  failedWorkDirs: string[];
}

export async function migrateLegacyConversationIndex(
  options: ConversationIndexMigrationOptions,
): Promise<ConversationIndexMigrationResult> {
  const discovered = await discoverLegacyConversationWorkDirs(
    options.legacyConversationsDir,
    options.fsOps,
  );

  const failedWorkDirs: string[] = [];
  let migratedWorkDirs = 0;

  for (const workDir of discovered.workDirs) {
    try {
      const storage = options.createStorage(workDir);
      await storage.list();
      await storage.dispose();
      migratedWorkDirs += 1;
    } catch (error) {
      failedWorkDirs.push(workDir);
      logger.warn('Failed to migrate legacy conversation workspace', { workDir, error });
    }
  }

  return {
    scannedFiles: discovered.scannedFiles,
    discoveredWorkDirs: discovered.workDirs.length,
    migratedWorkDirs,
    failedFiles: discovered.failedFiles,
    failedWorkDirs,
  };
}

export async function discoverLegacyConversationWorkDirs(
  legacyConversationsDir: string,
  fsOps: ConversationIndexMigrationFsOps,
): Promise<{
  scannedFiles: number;
  workDirs: string[];
  failedFiles: string[];
}> {
  try {
    const files = await fsOps.readdir(legacyConversationsDir);
    const conversationFiles = files.filter((file) => file.endsWith('.json'));
    const workDirs = new Set<string>();
    const failedFiles: string[] = [];

    for (const file of conversationFiles) {
      const fullPath = joinPath(legacyConversationsDir, file);
      try {
        const content = await fsOps.readFile(fullPath);
        const parsed = JSON.parse(content) as ConversationIndex;
        for (const record of parsed.records ?? []) {
          if (typeof record?.workDir === 'string' && record.workDir.length > 0) {
            workDirs.add(record.workDir);
          }
        }
      } catch (error) {
        failedFiles.push(fullPath);
        logger.warn('Failed to inspect legacy conversation file during migration', {
          filePath: fullPath,
          error,
        });
      }
    }

    return {
      scannedFiles: conversationFiles.length,
      workDirs: Array.from(workDirs).sort(),
      failedFiles,
    };
  } catch (error) {
    logger.warn('Failed to scan legacy conversations directory', {
      legacyConversationsDir,
      error,
    });
    return {
      scannedFiles: 0,
      workDirs: [],
      failedFiles: [],
    };
  }
}

function joinPath(baseDir: string, fileName: string): string {
  const path = require('path') as typeof import('path');
  return path.join(baseDir, fileName);
}
