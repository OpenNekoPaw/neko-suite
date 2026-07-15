import { isRuntimeOnlyResourceIdentityValue } from '@neko/shared';
import type {
  NekoApplicationHandoffPort,
  NekoApplicationHandoffRequest,
  NekoApplicationIdentity,
} from '@neko/host/application';
import type { HomeAigcGeneratedOutput } from './home-aigc-lifecycle';

export interface HomeExternalOpenPort {
  openExternal(uri: string): Promise<void>;
}

export function createHomeApplicationHandoffPort(
  external: HomeExternalOpenPort,
): NekoApplicationHandoffPort {
  return {
    async handoff(request) {
      if (request.target.toolId !== 'neko-vscode') {
        throw new Error(`Home professional tool is not registered: ${request.target.toolId}`);
      }
      assertStableHandoffIdentity(request);
      const payload = encodeURIComponent(JSON.stringify(request.target));
      await external.openExternal(`vscode://neko.neko-suite/open?handoff=${payload}`);
      return { accepted: true, requestId: request.requestId };
    },
  };
}

export function createHomeAigcProfessionalToolHandoffRequest(input: {
  readonly requestId: string;
  readonly source: NekoApplicationIdentity;
  readonly workspaceId: string;
  readonly editorId: string;
  readonly output: HomeAigcGeneratedOutput;
}): NekoApplicationHandoffRequest {
  if (!input.output.validation.ok) {
    throw new Error(`Home cannot hand off an invalid AIGC output: ${input.output.outputId}`);
  }
  return {
    schemaVersion: 1,
    requestId: input.requestId,
    source: input.source,
    target: {
      toolId: 'neko-vscode',
      workspaceId: input.workspaceId,
      resourceId: input.output.resourceRef.id,
      artifactId: input.output.artifact.artifactId,
      taskId: input.output.taskId,
      editorId: input.editorId,
    },
  };
}

function assertStableHandoffIdentity(request: NekoApplicationHandoffRequest): void {
  for (const [name, value] of Object.entries({
    resourceId: request.target.resourceId,
    artifactId: request.target.artifactId,
    taskId: request.target.taskId,
  })) {
    if (value && isRuntimeOnlyResourceIdentityValue(value)) {
      throw new Error(`Home handoff ${name} must be stable identity, not a runtime projection.`);
    }
  }
}
