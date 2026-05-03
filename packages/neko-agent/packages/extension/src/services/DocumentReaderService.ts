import * as fs from 'fs/promises';
import * as os from 'os';
import {
  createDocumentReaderRuntime,
  type DocumentContent,
  type IDocumentReader,
} from '@neko/platform/document';
import { getLogger } from '../base';

const logger = getLogger('DocumentReaderService');

export type { DocumentContent };

export interface IDocumentReaderService extends IDocumentReader {}

export class DocumentReaderService implements IDocumentReaderService {
  private readonly runtime: IDocumentReader;

  constructor() {
    this.runtime = createDocumentReaderRuntime({
      readTextFile: (filePath) => fs.readFile(filePath, 'utf-8'),
      readBinaryFile: (filePath) => fs.readFile(filePath),
      writeBinaryFile: (filePath, data) => fs.writeFile(filePath, data),
      makeDir: (filePath, options) => fs.mkdir(filePath, options).then(() => undefined),
      tempDir: () => os.tmpdir(),
      loadModule: (packageName) => this.tryImport(packageName),
      logger,
    });
  }

  read(filePath: string): Promise<DocumentContent> {
    return this.runtime.read(filePath);
  }

  supports(filePath: string): boolean {
    return this.runtime.supports(filePath);
  }

  hasDRM(filePath: string): Promise<boolean> {
    return this.runtime.hasDRM(filePath);
  }

  private async tryImport<T>(packageName: string): Promise<T | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      return require(packageName) as T;
    } catch {
      return null;
    }
  }
}

export function createDocumentReaderService(): IDocumentReaderService {
  return new DocumentReaderService();
}
