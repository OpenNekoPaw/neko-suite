import type { SceneCommand } from '@neko/shared';

export type ComponentFieldKind = 'number' | 'vec3' | 'quat' | 'color';

export interface ComponentFieldSchema {
  path: string;
  label: string;
  kind: ComponentFieldKind;
  min?: number;
  max?: number;
  step?: number;
  commandType: SceneCommand['type'];
}

export interface ComponentSchema {
  component: 'transform' | 'material' | 'light' | 'camera';
  fields: readonly ComponentFieldSchema[];
}

export class ComponentSchemaRegistry {
  private readonly schemas = new Map<ComponentSchema['component'], ComponentSchema>();

  register(schema: ComponentSchema): void {
    this.schemas.set(schema.component, schema);
  }

  get(component: ComponentSchema['component']): ComponentSchema | undefined {
    return this.schemas.get(component);
  }

  getField(
    component: ComponentSchema['component'],
    path: string,
  ): ComponentFieldSchema | undefined {
    return this.schemas.get(component)?.fields.find((field) => field.path === path);
  }

  list(): ComponentSchema[] {
    return Array.from(this.schemas.values());
  }
}

export const MODEL_COMPONENT_SCHEMA_REGISTRY = new ComponentSchemaRegistry();

MODEL_COMPONENT_SCHEMA_REGISTRY.register({
  component: 'transform',
  fields: [
    { path: 'position.x', label: 'X', kind: 'number', step: 0.001, commandType: 'transform' },
    { path: 'position.y', label: 'Y', kind: 'number', step: 0.001, commandType: 'transform' },
    { path: 'position.z', label: 'Z', kind: 'number', step: 0.001, commandType: 'transform' },
    { path: 'rotation.x', label: 'X', kind: 'number', step: 0.001, commandType: 'transform' },
    { path: 'rotation.y', label: 'Y', kind: 'number', step: 0.001, commandType: 'transform' },
    { path: 'rotation.z', label: 'Z', kind: 'number', step: 0.001, commandType: 'transform' },
    { path: 'rotation.w', label: 'W', kind: 'number', step: 0.001, commandType: 'transform' },
    { path: 'scale.x', label: 'X', kind: 'number', min: 0, step: 0.001, commandType: 'transform' },
    { path: 'scale.y', label: 'Y', kind: 'number', min: 0, step: 0.001, commandType: 'transform' },
    { path: 'scale.z', label: 'Z', kind: 'number', min: 0, step: 0.001, commandType: 'transform' },
  ],
});

MODEL_COMPONENT_SCHEMA_REGISTRY.register({
  component: 'material',
  fields: [
    {
      path: 'roughness',
      label: 'Roughness',
      kind: 'number',
      min: 0,
      max: 1,
      step: 0.001,
      commandType: 'material-update',
    },
    {
      path: 'metallic',
      label: 'Metallic',
      kind: 'number',
      min: 0,
      max: 1,
      step: 0.001,
      commandType: 'material-update',
    },
    {
      path: 'emissive',
      label: 'Emissive',
      kind: 'color',
      min: 0,
      max: 1,
      step: 0.001,
      commandType: 'material-update',
    },
  ],
});

MODEL_COMPONENT_SCHEMA_REGISTRY.register({
  component: 'light',
  fields: [
    {
      path: 'intensity',
      label: 'Intensity',
      kind: 'number',
      min: 0,
      step: 0.01,
      commandType: 'light-update',
    },
  ],
});

MODEL_COMPONENT_SCHEMA_REGISTRY.register({
  component: 'camera',
  fields: [
    {
      path: 'fov',
      label: 'FOV',
      kind: 'number',
      min: 1,
      max: 179,
      step: 0.1,
      commandType: 'camera-set',
    },
  ],
});
