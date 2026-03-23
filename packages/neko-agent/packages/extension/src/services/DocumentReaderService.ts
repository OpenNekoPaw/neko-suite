/**
 * Document Reader Service — Extracts text from PDF, DOCX, and other document formats
 *
 * Runs in Extension Host (Node.js) where file system and native modules are available.
 * Used by the readDocument pipeline stage and ReadDocument agent tool.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getLogger } from '../base';

const logger = getLogger('DocumentReaderService');

/** Extracted document content */
export interface DocumentContent {
  /** Full text content */
  text: string;
  /** Number of pages (for PDFs) */
  pageCount?: number;
  /** Document metadata (title, author, etc.) */
  metadata?: Record<string, string>;
}

/** Document reader interface */
export interface IDocumentReaderService {
  /** Read and extract text from a document file */
  read(filePath: string): Promise<DocumentContent>;
  /** Check if a file format is supported */
  supports(filePath: string): boolean;
}

const SUPPORTED_EXTENSIONS = new Set([
  '.pdf',
  '.docx',
  '.doc',
  '.md',
  '.txt',
  '.fountain',
  '.html',
  '.htm',
  '.json',
  '.yaml',
  '.yml',
]);

export class DocumentReaderService implements IDocumentReaderService {
  supports(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return SUPPORTED_EXTENSIONS.has(ext);
  }

  async read(filePath: string): Promise<DocumentContent> {
    const ext = path.extname(filePath).toLowerCase();

    switch (ext) {
      case '.pdf':
        return this.readPdf(filePath);
      case '.docx':
      case '.doc':
        return this.readDocx(filePath);
      case '.md':
      case '.txt':
      case '.fountain':
      case '.json':
      case '.yaml':
      case '.yml':
        return this.readTextFile(filePath);
      case '.html':
      case '.htm':
        return this.readHtmlFile(filePath);
      default:
        throw new Error(`Unsupported document format: ${ext}`);
    }
  }

  private async readTextFile(filePath: string): Promise<DocumentContent> {
    const text = await fs.readFile(filePath, 'utf-8');
    return { text };
  }

  private async readHtmlFile(filePath: string): Promise<DocumentContent> {
    const html = await fs.readFile(filePath, 'utf-8');
    // Strip HTML tags for plain text extraction
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return { text };
  }

  private async readPdf(filePath: string): Promise<DocumentContent> {
    try {
      // Dynamic import to avoid hard dependency
      const pdfParse = await this.tryImport<
        (buffer: Buffer) => Promise<{
          text: string;
          numpages: number;
          info?: Record<string, string>;
        }>
      >('pdf-parse');

      if (!pdfParse) {
        throw new Error(
          'pdf-parse package not installed. Run: pnpm add pdf-parse -F @neko-agent/extension',
        );
      }

      const buffer = await fs.readFile(filePath);
      const result = await pdfParse(buffer);

      return {
        text: result.text,
        pageCount: result.numpages,
        metadata: result.info,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('pdf-parse')) {
        throw error;
      }
      logger.error('Failed to read PDF', { path: filePath, error });
      throw new Error(
        `Failed to read PDF: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private async readDocx(filePath: string): Promise<DocumentContent> {
    try {
      // Dynamic import to avoid hard dependency
      const mammoth = await this.tryImport<{
        extractRawText: (options: { path: string }) => Promise<{ value: string }>;
      }>('mammoth');

      if (!mammoth) {
        throw new Error(
          'mammoth package not installed. Run: pnpm add mammoth -F @neko-agent/extension',
        );
      }

      const result = await mammoth.extractRawText({ path: filePath });

      return {
        text: result.value,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('mammoth')) {
        throw error;
      }
      logger.error('Failed to read DOCX', { path: filePath, error });
      throw new Error(
        `Failed to read DOCX: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Try to dynamically import a package, return null if not installed
   */
  private async tryImport<T>(packageName: string): Promise<T | null> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mod = require(packageName) as T;
      return mod;
    } catch {
      return null;
    }
  }
}

/**
 * Create a document reader service instance
 */
export function createDocumentReaderService(): IDocumentReaderService {
  return new DocumentReaderService();
}
