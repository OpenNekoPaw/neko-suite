import {
  diagnosticFromUnknownError,
  type ProjectFormatCodec,
  type ProjectFormatCodecRegistry,
  type ProjectFormatLoadResult,
} from './codec';
import {
  createProjectFileDiagnostic,
  hasProjectFileErrors,
  type ProjectFileDiagnostic,
} from './diagnostics';
import {
  applyPortableSourcePathPolicy,
  resolveProjectSourceDiagnostics,
  type ApplyPortableSourcePolicyOptions,
  type PortableSourcePathPolicy,
} from './source-policy';

export interface ProjectFileOps {
  readFile(filePath: string): Promise<Uint8Array>;
  writeFile(filePath: string, content: Uint8Array): Promise<void>;
  deleteFile?(filePath: string): Promise<void>;
  renameFile?(
    fromPath: string,
    toPath: string,
    options?: { readonly overwrite?: boolean },
  ): Promise<void>;
}

export interface ProjectTextEncoder {
  encode(input?: string): Uint8Array;
}

export interface ProjectTextDecoder {
  decode(input?: Uint8Array): string;
}

export interface ProjectFileStoreOptions {
  readonly registry: ProjectFormatCodecRegistry;
  readonly fileOps: ProjectFileOps;
  readonly textEncoder?: ProjectTextEncoder;
  readonly textDecoder?: ProjectTextDecoder;
}

export interface ProjectFileLoadRequest<TDocument> {
  readonly filePath: string;
  readonly formatId?: string;
  readonly sourcePolicy?: PortableSourcePathPolicy<TDocument>;
  readonly sourcePolicyOptions?: ApplyPortableSourcePolicyOptions;
}

export interface ProjectFileSaveRequest<TDocument> {
  readonly filePath: string;
  readonly document: TDocument;
  readonly formatId?: string;
  readonly sourcePolicy?: PortableSourcePathPolicy<TDocument>;
  readonly sourcePolicyOptions?: ApplyPortableSourcePolicyOptions;
  readonly indent?: number;
  readonly atomic?: boolean;
}

export interface ProjectFileBackupRequest<TDocument> extends ProjectFileSaveRequest<TDocument> {
  readonly backupPath: string;
}

export interface ProjectFileLoadResponse<TDocument> {
  readonly ok: boolean;
  readonly filePath: string;
  readonly formatId?: string;
  readonly document?: TDocument;
  readonly readOnly: boolean;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
  readonly loadResult?: ProjectFormatLoadResult<TDocument>;
}

export interface ProjectFileSaveResponse {
  readonly ok: boolean;
  readonly filePath: string;
  readonly diagnostics: readonly ProjectFileDiagnostic[];
  readonly written: boolean;
}

export class ProjectFileStore {
  private readonly registry: ProjectFormatCodecRegistry;
  private readonly fileOps: ProjectFileOps;
  private readonly textEncoder: ProjectTextEncoder;
  private readonly textDecoder: ProjectTextDecoder;
  private readonly writeQueues = new Map<string, Promise<void>>();

  constructor(options: ProjectFileStoreOptions) {
    this.registry = options.registry;
    this.fileOps = options.fileOps;
    this.textEncoder = options.textEncoder ?? new TextEncoder();
    this.textDecoder = options.textDecoder ?? new TextDecoder();
  }

  async load<TDocument>(
    request: ProjectFileLoadRequest<TDocument>,
  ): Promise<ProjectFileLoadResponse<TDocument>> {
    const codec = this.resolveCodec<TDocument>(request.filePath, request.formatId);
    if (!codec) {
      return {
        ok: false,
        filePath: request.filePath,
        formatId: request.formatId,
        readOnly: true,
        diagnostics: [
          createProjectFileDiagnostic({
            code: 'invalid-format',
            message: `No project format codec is registered for ${request.filePath}.`,
          }),
        ],
      };
    }

    let bytes: Uint8Array;
    try {
      bytes = await this.fileOps.readFile(request.filePath);
    } catch (error) {
      return {
        ok: false,
        filePath: request.filePath,
        formatId: codec.formatId,
        readOnly: true,
        diagnostics: [
          diagnosticFromUnknownError('read-failed', 'Failed to read project file', error),
        ],
      };
    }

    const json = this.textDecoder.decode(bytes);
    const loadResult = codec.load(json, {
      filePath: request.filePath,
      formatId: codec.formatId,
    });
    const sourceDiagnostics = request.sourcePolicyOptions
      ? resolveProjectSourceDiagnostics(
          loadResult.document,
          request.sourcePolicy,
          request.sourcePolicyOptions,
        ).diagnostics
      : [];
    const diagnostics = [...loadResult.diagnostics, ...sourceDiagnostics];
    const readOnly = loadResult.compatibility?.readOnly ?? false;

    return {
      ok: !hasProjectFileErrors(loadResult.diagnostics),
      filePath: request.filePath,
      formatId: codec.formatId,
      document: loadResult.document,
      readOnly,
      diagnostics,
      loadResult,
    };
  }

  async save<TDocument>(
    request: ProjectFileSaveRequest<TDocument>,
  ): Promise<ProjectFileSaveResponse> {
    return this.enqueueWrite(request.filePath, () => this.saveNow(request));
  }

  async saveAs<TDocument>(
    request: ProjectFileSaveRequest<TDocument>,
  ): Promise<ProjectFileSaveResponse> {
    return this.save(request);
  }

  async backup<TDocument>(
    request: ProjectFileBackupRequest<TDocument>,
  ): Promise<ProjectFileSaveResponse> {
    const response = await this.save({
      ...request,
      filePath: request.backupPath,
      atomic: false,
    });
    if (!response.ok) {
      return {
        ...response,
        diagnostics: [
          ...response.diagnostics,
          createProjectFileDiagnostic({
            code: 'backup-failed',
            message: `Failed to write project backup for ${request.filePath}.`,
            recoverability: 'retry',
          }),
        ],
      };
    }
    return response;
  }

  async revert<TDocument>(
    request: ProjectFileLoadRequest<TDocument>,
  ): Promise<ProjectFileLoadResponse<TDocument>> {
    return this.load(request);
  }

  private async saveNow<TDocument>(
    request: ProjectFileSaveRequest<TDocument>,
  ): Promise<ProjectFileSaveResponse> {
    const codec = this.resolveCodec<TDocument>(request.filePath, request.formatId);
    if (!codec) {
      return {
        ok: false,
        filePath: request.filePath,
        diagnostics: [
          createProjectFileDiagnostic({
            code: 'invalid-format',
            message: `No project format codec is registered for ${request.filePath}.`,
          }),
        ],
        written: false,
      };
    }

    const policyResult =
      request.sourcePolicyOptions && request.sourcePolicy
        ? applyPortableSourcePathPolicy(
            request.document,
            request.sourcePolicy,
            request.sourcePolicyOptions,
          )
        : { document: request.document, diagnostics: [] as readonly ProjectFileDiagnostic[] };

    if (hasProjectFileErrors(policyResult.diagnostics)) {
      return {
        ok: false,
        filePath: request.filePath,
        diagnostics: policyResult.diagnostics,
        written: false,
      };
    }

    let saveResult;
    try {
      saveResult = codec.save(policyResult.document, {
        filePath: request.filePath,
        formatId: codec.formatId,
        indent: request.indent,
      });
    } catch (error) {
      return {
        ok: false,
        filePath: request.filePath,
        diagnostics: [
          ...policyResult.diagnostics,
          diagnosticFromUnknownError('codec-save-failed', 'Failed to encode project file', error),
        ],
        written: false,
      };
    }

    const diagnostics = [...policyResult.diagnostics, ...saveResult.diagnostics];
    if (hasProjectFileErrors(saveResult.diagnostics)) {
      return { ok: false, filePath: request.filePath, diagnostics, written: false };
    }

    try {
      await this.writeFile(request.filePath, saveResult.content, request.atomic ?? true);
    } catch (error) {
      return {
        ok: false,
        filePath: request.filePath,
        diagnostics: [
          ...diagnostics,
          diagnosticFromUnknownError('write-failed', 'Failed to write project file', error),
        ],
        written: false,
      };
    }

    return {
      ok: true,
      filePath: request.filePath,
      diagnostics,
      written: true,
    };
  }

  private async writeFile(filePath: string, content: string, atomic: boolean): Promise<void> {
    const bytes = this.textEncoder.encode(content.endsWith('\n') ? content : `${content}\n`);
    if (!atomic || !this.fileOps.renameFile) {
      await this.fileOps.writeFile(filePath, bytes);
      return;
    }

    const tempPath = `${filePath}.tmp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    try {
      await this.fileOps.writeFile(tempPath, bytes);
      await this.fileOps.renameFile(tempPath, filePath, { overwrite: true });
    } catch (error) {
      if (this.fileOps.deleteFile) {
        try {
          await this.fileOps.deleteFile(tempPath);
        } catch {
          // Best-effort cleanup; preserve the original write failure.
        }
      }
      throw error;
    }
  }

  private async enqueueWrite<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.writeQueues.get(filePath) ?? Promise.resolve();
    let release: () => void = () => undefined;
    const next = new Promise<void>((resolve) => {
      release = resolve;
    });
    const queued = previous.then(
      () => next,
      () => next,
    );
    this.writeQueues.set(filePath, queued);

    await previous.catch(() => undefined);
    try {
      return await operation();
    } finally {
      release();
      if (this.writeQueues.get(filePath) === queued) {
        this.writeQueues.delete(filePath);
      }
    }
  }

  private resolveCodec<TDocument>(
    filePath: string,
    formatId: string | undefined,
  ): ProjectFormatCodec<TDocument> | undefined {
    const codec = formatId ? this.registry.get(formatId) : this.registry.getByExtension(filePath);
    return codec as ProjectFormatCodec<TDocument> | undefined;
  }
}
