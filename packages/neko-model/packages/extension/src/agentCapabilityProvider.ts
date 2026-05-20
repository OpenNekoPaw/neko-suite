/**
 * NekoModel Agent Capability Provider
 *
 * Exposes 3D scene query and editing tools through the shared
 * AgentCapabilityProvider protocol. Scene lifecycle and mutation authority stay
 * owned by NekoModelAPI in the Extension Host.
 */

import type {
  AgentCapabilityContext,
  AgentCapabilityProvider,
  EngineQuat,
  EngineVec3,
  ModelNodeTransformPatch,
  NekoModelAPI,
  Tool,
  ToolParameters,
  ToolResult,
} from '@neko/shared';
import { TOOL_NAMES_MODEL } from '@neko/shared';

type ModelSceneQueryMode = 'scene' | 'node' | 'animations';
type ModelNodeOperation = 'setTransform' | 'setVisible' | 'updateMaterial';
type ModelAnimationOperation = 'play' | 'stop' | 'seek';

interface ParseOk<T> {
  readonly ok: true;
  readonly value: T;
}

interface ParseFailure {
  readonly ok: false;
  readonly error: string;
}

type ParseResult<T> = ParseOk<T> | ParseFailure;

const MODEL_QUERY_BEFORE_MUTATE = {
  preferredQueryTools: [TOOL_NAMES_MODEL.MODEL_SCENE_QUERY],
  reason:
    'Query the active scene first to obtain stable node, material, and animation identifiers before mutating model state.',
} as const;

export function createNekoModelCapabilityProvider(api: NekoModelAPI): AgentCapabilityProvider {
  return new NekoModelCapabilityProvider(api);
}

class NekoModelCapabilityProvider implements AgentCapabilityProvider {
  readonly id = 'neko-model';
  readonly version = '1.0.0';

  constructor(private readonly api: NekoModelAPI) {}

  getTools(_context: AgentCapabilityContext): Tool[] {
    return [
      this.createSceneQueryTool(),
      this.createNodeManipulateTool(),
      this.createAnimationControlTool(),
    ];
  }

  private createSceneQueryTool(): Tool {
    return {
      name: TOOL_NAMES_MODEL.MODEL_SCENE_QUERY,
      description:
        'Query the active 3D model scene graph, one node, or available animations. Use this read-only tool before model mutations to obtain stable IDs.',
      category: 'analysis',
      isReadOnly: true,
      isConcurrencySafe: true,
      safetyKind: 'read-only-query',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            enum: ['scene', 'node', 'animations'],
            description: 'Query mode. Defaults to scene.',
          },
          nodeId: {
            type: 'string',
            description: 'Node ID when query is node.',
          },
        },
      } satisfies ToolParameters,
      execute: async (args) => {
        const query = parseSceneQueryMode(args.query);
        if (!query.ok) return failure(query.error);

        try {
          if (query.value === 'node') {
            const nodeId = requiredString(args.nodeId, 'nodeId');
            if (!nodeId.ok) return failure(nodeId.error);
            const node = await this.api.getNodeProperties(nodeId.value);
            if (!node) return failure(`Model scene node is not available: ${nodeId.value}`);
            return { success: true, data: { node } };
          }

          if (query.value === 'animations') {
            const animations = await this.api.listAnimations();
            return { success: true, data: { animations } };
          }

          const scene = await this.api.getSceneGraph();
          if (!scene) return failure('No active model editor is available.');
          return { success: true, data: { scene } };
        } catch (error) {
          return failure(`Failed to query model scene: ${formatError(error)}`);
        }
      },
    };
  }

  private createNodeManipulateTool(): Tool {
    return {
      name: TOOL_NAMES_MODEL.MODEL_NODE_MANIPULATE,
      description:
        'Mutate active 3D model scene nodes: set transform, set visibility, or update material parameters. Query the scene first and pass stable target IDs.',
      category: 'project',
      safetyKind: 'non-destructive-mutation',
      targetRequirements: {
        required: ['operation', 'nodeId'],
        allowedFallbacks: ['selection', 'explicit-user-input'],
      },
      queryBeforeMutate: MODEL_QUERY_BEFORE_MUTATE,
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['setTransform', 'setVisible', 'updateMaterial'],
            description: 'Node operation to execute.',
          },
          nodeId: {
            type: 'string',
            description:
              'Target node ID. Material updates may use this as the host material target.',
          },
          visible: {
            type: 'boolean',
            description: 'Visibility value for setVisible.',
          },
          transform: {
            type: 'object',
            description:
              'Transform patch for setTransform. Supports position, rotation, and scale fields.',
          },
          position: {
            type: 'object',
            description: 'Optional position vector { x, y, z } for setTransform.',
          },
          rotation: {
            type: 'object',
            description: 'Optional rotation quaternion { x, y, z, w } for setTransform.',
          },
          scale: {
            type: 'object',
            description: 'Optional scale vector { x, y, z } for setTransform.',
          },
          materialId: {
            type: 'string',
            description:
              'Material target ID for updateMaterial. If omitted, nodeId is used as the current host material target.',
          },
          params: {
            type: 'object',
            description:
              'Material parameter patch for updateMaterial, e.g. baseColor, metallic, roughness, emissive, or occlusionStrength.',
          },
          materialParams: {
            type: 'object',
            description: 'Alias for params.',
          },
        },
        required: ['operation'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const operation = parseNodeOperation(args.operation);
        if (!operation.ok) return failure(operation.error);

        try {
          switch (operation.value) {
            case 'setTransform': {
              const nodeId = requiredString(args.nodeId, 'nodeId');
              if (!nodeId.ok) return failure(nodeId.error);
              const transform = parseTransformPatch(args);
              if (!transform.ok) return failure(transform.error);
              const result = await this.api.setNodeTransform(nodeId.value, transform.value);
              return operationResult(result, { nodeId: nodeId.value, operation: operation.value });
            }

            case 'setVisible': {
              const nodeId = requiredString(args.nodeId, 'nodeId');
              if (!nodeId.ok) return failure(nodeId.error);
              if (typeof args.visible !== 'boolean') {
                return failure('visible must be a boolean for setVisible.');
              }
              const result = await this.api.setNodeVisible(nodeId.value, args.visible);
              return operationResult(result, {
                nodeId: nodeId.value,
                visible: args.visible,
                operation: operation.value,
              });
            }

            case 'updateMaterial': {
              const materialTarget = optionalString(args.materialId) ?? optionalString(args.nodeId);
              if (!materialTarget) {
                return failure('materialId or nodeId is required for updateMaterial.');
              }
              const params = parseMaterialParams(args);
              if (!params.ok) return failure(params.error);
              const result = await this.api.updateMaterial({
                materialId: materialTarget,
                params: params.value,
              });
              return operationResult(result, {
                materialId: materialTarget,
                operation: operation.value,
              });
            }

            default:
              return unsupportedOperation(operation.value, 'model node');
          }
        } catch (error) {
          return failure(`Failed to mutate model scene: ${formatError(error)}`);
        }
      },
    };
  }

  private createAnimationControlTool(): Tool {
    return {
      name: TOOL_NAMES_MODEL.MODEL_ANIMATION_CONTROL,
      description:
        'Control active 3D model animation playback. Use model_scene_query with query=animations before play or seek operations.',
      category: 'project',
      safetyKind: 'non-destructive-mutation',
      targetRequirements: {
        required: ['operation'],
        allowedFallbacks: ['explicit-user-input'],
      },
      queryBeforeMutate: MODEL_QUERY_BEFORE_MUTATE,
      parameters: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            enum: ['play', 'stop', 'seek'],
            description: 'Animation operation.',
          },
          nameOrIndex: {
            type: 'string',
            description: 'Animation clip name or numeric index for play.',
          },
          name: {
            type: 'string',
            description: 'Animation clip name for play.',
          },
          index: {
            type: 'integer',
            description: 'Animation clip index for play.',
          },
          timeSeconds: {
            type: 'number',
            description: 'Target animation time for seek.',
          },
        },
        required: ['operation'],
      } satisfies ToolParameters,
      execute: async (args) => {
        const operation = parseAnimationOperation(args.operation);
        if (!operation.ok) return failure(operation.error);

        try {
          switch (operation.value) {
            case 'play': {
              const target = parseAnimationTarget(args);
              if (!target.ok) return failure(target.error);
              const result = await this.api.playAnimation(target.value);
              return operationResult(result, { operation: operation.value, target: target.value });
            }

            case 'stop': {
              const result = await this.api.stopAnimation();
              return operationResult(result, { operation: operation.value });
            }

            case 'seek': {
              const timeSeconds = requiredFiniteNumber(args.timeSeconds, 'timeSeconds');
              if (!timeSeconds.ok) return failure(timeSeconds.error);
              const result = await this.api.seekAnimation(timeSeconds.value);
              return operationResult(result, {
                operation: operation.value,
                timeSeconds: timeSeconds.value,
              });
            }

            default:
              return unsupportedOperation(operation.value, 'model animation');
          }
        } catch (error) {
          return failure(`Failed to control model animation: ${formatError(error)}`);
        }
      },
    };
  }
}

function parseSceneQueryMode(value: unknown): ParseResult<ModelSceneQueryMode> {
  if (value === undefined) return ok('scene');
  if (value === 'scene' || value === 'node' || value === 'animations') return ok(value);
  return fail('query must be one of scene, node, or animations.');
}

function parseNodeOperation(value: unknown): ParseResult<ModelNodeOperation> {
  if (value === 'setTransform' || value === 'setVisible' || value === 'updateMaterial') {
    return ok(value);
  }
  return fail('operation must be one of setTransform, setVisible, or updateMaterial.');
}

function parseAnimationOperation(value: unknown): ParseResult<ModelAnimationOperation> {
  if (value === 'play' || value === 'stop' || value === 'seek') return ok(value);
  return fail('operation must be one of play, stop, or seek.');
}

function parseTransformPatch(args: Record<string, unknown>): ParseResult<ModelNodeTransformPatch> {
  const source = isRecord(args.transform) ? args.transform : args;
  const position = parseOptionalVec3(source.position, 'position');
  if (!position.ok) return position;
  const rotation = parseOptionalQuat(source.rotation, 'rotation');
  if (!rotation.ok) return rotation;
  const scale = parseOptionalVec3(source.scale, 'scale');
  if (!scale.ok) return scale;

  const patch: ModelNodeTransformPatch = {
    ...(position.value ? { position: position.value } : {}),
    ...(rotation.value ? { rotation: rotation.value } : {}),
    ...(scale.value ? { scale: scale.value } : {}),
  };

  if (!patch.position && !patch.rotation && !patch.scale) {
    return fail('At least one transform field is required for setTransform.');
  }
  return ok(patch);
}

function parseMaterialParams(args: Record<string, unknown>): ParseResult<Record<string, unknown>> {
  const params = isRecord(args.params)
    ? args.params
    : isRecord(args.materialParams)
      ? args.materialParams
      : undefined;
  if (!params) return fail('params or materialParams must be an object for updateMaterial.');
  if (Object.keys(params).length === 0) {
    return fail('Material parameter patch must contain at least one field.');
  }
  return ok(params);
}

function parseAnimationTarget(args: Record<string, unknown>): ParseResult<string | number> {
  if (typeof args.nameOrIndex === 'string' && args.nameOrIndex.trim().length > 0) {
    return ok(args.nameOrIndex.trim());
  }
  if (typeof args.nameOrIndex === 'number' && Number.isInteger(args.nameOrIndex)) {
    return ok(args.nameOrIndex);
  }
  if (typeof args.name === 'string' && args.name.trim().length > 0) {
    return ok(args.name.trim());
  }
  if (typeof args.index === 'number' && Number.isInteger(args.index)) {
    return ok(args.index);
  }
  return fail('nameOrIndex, name, or index is required for play.');
}

function parseOptionalVec3(value: unknown, field: string): ParseResult<EngineVec3 | undefined> {
  if (value === undefined) return ok(undefined);
  if (Array.isArray(value)) {
    if (value.length !== 3) return fail(`${field} must contain 3 numbers.`);
    const x = finiteNumber(value[0]);
    const y = finiteNumber(value[1]);
    const z = finiteNumber(value[2]);
    if (x === undefined || y === undefined || z === undefined) {
      return fail(`${field} must contain finite numbers.`);
    }
    return ok({ x, y, z });
  }
  if (!isRecord(value)) return fail(`${field} must be an object or number array.`);
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);
  if (x === undefined || y === undefined || z === undefined) {
    return fail(`${field} must include finite x, y, and z numbers.`);
  }
  return ok({ x, y, z });
}

function parseOptionalQuat(value: unknown, field: string): ParseResult<EngineQuat | undefined> {
  if (value === undefined) return ok(undefined);
  if (Array.isArray(value)) {
    if (value.length !== 4) return fail(`${field} must contain 4 numbers.`);
    const x = finiteNumber(value[0]);
    const y = finiteNumber(value[1]);
    const z = finiteNumber(value[2]);
    const w = finiteNumber(value[3]);
    if (x === undefined || y === undefined || z === undefined || w === undefined) {
      return fail(`${field} must contain finite numbers.`);
    }
    return ok({ x, y, z, w });
  }
  if (!isRecord(value)) return fail(`${field} must be an object or number array.`);
  const x = finiteNumber(value.x);
  const y = finiteNumber(value.y);
  const z = finiteNumber(value.z);
  const w = finiteNumber(value.w);
  if (x === undefined || y === undefined || z === undefined || w === undefined) {
    return fail(`${field} must include finite x, y, z, and w numbers.`);
  }
  return ok({ x, y, z, w });
}

function requiredString(value: unknown, field: string): ParseResult<string> {
  const parsed = optionalString(value);
  return parsed ? ok(parsed) : fail(`${field} is required.`);
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

function requiredFiniteNumber(value: unknown, field: string): ParseResult<number> {
  const parsed = finiteNumber(value);
  return parsed === undefined ? fail(`${field} must be a finite number.`) : ok(parsed);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function operationResult(
  result: { readonly ok: boolean; readonly message?: string; readonly revision?: number },
  data: Record<string, unknown>,
): ToolResult {
  return result.ok
    ? { success: true, data: { ...data, result } }
    : {
        success: false,
        error: result.message ?? 'Model operation failed.',
        data: { ...data, result },
      };
}

function unsupportedOperation(value: never, label: string): ToolResult {
  return failure(`Unsupported ${label} operation: ${String(value)}.`);
}

function failure(error: string): ToolResult {
  return { success: false, error };
}

function ok<T>(value: T): ParseOk<T> {
  return { ok: true, value };
}

function fail(error: string): ParseFailure {
  return { ok: false, error };
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
