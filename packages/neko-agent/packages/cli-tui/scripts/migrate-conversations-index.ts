#!/usr/bin/env node

import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  createFileConversationStorage,
  migrateLegacyConversationIndex,
} from '../../agent/src/index.ts';

async function main(): Promise<void> {
  const nekoHome = resolveNekoHome(process.argv.slice(2));
  const legacyConversationsDir = path.join(nekoHome, 'conversations');

  const result = await migrateLegacyConversationIndex({
    legacyConversationsDir,
    fsOps: {
      readdir: (dirPath) => fs.readdir(dirPath),
      readFile: (filePath) => fs.readFile(filePath, 'utf-8'),
    },
    createStorage: (workDir) =>
      createFileConversationStorage(workDir, { legacySupportMode: 'migration-only' }),
  });

  console.log(`Legacy conversation scan: ${result.scannedFiles} file(s)`);
  console.log(`Discovered workspaces: ${result.discoveredWorkDirs}`);
  console.log(`Migrated workspaces: ${result.migratedWorkDirs}`);

  if (result.failedFiles.length > 0) {
    console.log(`Failed files: ${result.failedFiles.length}`);
    for (const filePath of result.failedFiles) {
      console.log(`  - ${filePath}`);
    }
  }

  if (result.failedWorkDirs.length > 0) {
    console.log(`Failed workspaces: ${result.failedWorkDirs.length}`);
    for (const workDir of result.failedWorkDirs) {
      console.log(`  - ${workDir}`);
    }
    process.exitCode = 1;
  }
}

function resolveNekoHome(args: string[]): string {
  const homeArgIndex = args.findIndex((arg) => arg === '--neko-home');
  if (homeArgIndex >= 0) {
    const customPath = args[homeArgIndex + 1];
    if (customPath && customPath.length > 0) {
      return customPath;
    }
  }

  return path.join(os.homedir(), '.neko');
}

main().catch((error) => {
  console.error('Failed to migrate legacy conversations index:', error);
  process.exitCode = 1;
});
