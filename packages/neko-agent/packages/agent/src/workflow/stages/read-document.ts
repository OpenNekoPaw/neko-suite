/**
 * ReadDocument Stage — Reads source file content into pipeline context
 *
 * Supports: .md, .txt, .fountain, .pdf, .docx
 * For PDF/DOCX, delegates to DocumentReaderService (injected).
 * For text-based formats, reads directly via filesystem.
 */

import type { IWorkflowStage, WorkflowContext } from '../types';

/** Dependency: document reading service (injected from extension layer) */
export interface IDocumentReader {
  read(filePath: string): Promise<{ text: string; metadata?: Record<string, string> }>;
  supports(filePath: string): boolean;
}

/** Dependency: file system read */
export interface IFileReader {
  readFile(filePath: string): Promise<string>;
}

export interface ReadDocumentStageDeps {
  fileReader: IFileReader;
  documentReader?: IDocumentReader;
}

export function createReadDocumentStage(deps: ReadDocumentStageDeps): IWorkflowStage {
  return {
    name: 'readDocument',
    type: 'linear',
    gate: 'auto',

    async execute(ctx: WorkflowContext): Promise<WorkflowContext> {
      const source = ctx.source;
      if (!source) {
        throw new Error('readDocument: No source provided in context');
      }

      // If source is inline text (no file path), use it directly
      if (!source.includes('.') || source.includes('\n')) {
        return { ...ctx, documentText: source, sourceFormat: ctx.sourceFormat ?? 'freeform' };
      }

      // Determine format from extension
      const ext = source.split('.').pop()?.toLowerCase();

      if (ext === 'pdf' || ext === 'docx' || ext === 'pptx') {
        if (!deps.documentReader) {
          throw new Error(`readDocument: No document reader available for .${ext} files`);
        }
        if (!deps.documentReader.supports(source)) {
          throw new Error(`readDocument: Unsupported format .${ext}`);
        }
        const result = await deps.documentReader.read(source);
        return { ...ctx, documentText: result.text, sourceFormat: 'document' };
      }

      // Text-based formats: read directly
      const text = await deps.fileReader.readFile(source);
      const format = ext === 'fountain' ? 'fountain' : (ctx.sourceFormat ?? 'freeform');
      return { ...ctx, documentText: text, sourceFormat: format };
    },
  };
}
