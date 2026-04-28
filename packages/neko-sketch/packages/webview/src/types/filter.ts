/**
 * Filter types for 2D image processing
 *
 * Defines filter definitions, parameters, and applied filter state.
 */

// ─── Filter Parameter Types ───

export type FilterParamType = 'float' | 'int' | 'bool' | 'vec2' | 'color';
export type FilterParamValue =
  | number
  | boolean
  | [number, number]
  | [number, number, number, number];

export interface FilterParam {
  readonly name: string;
  readonly label: string;
  readonly type: FilterParamType;
  readonly default: FilterParamValue;
  readonly min?: number;
  readonly max?: number;
  readonly step?: number;
}

// ─── Filter Definition ───

export type FilterCategory = 'blur' | 'color' | 'distort' | 'stylize';

export interface FilterDef {
  readonly id: string;
  readonly name: string;
  readonly category: FilterCategory;
  readonly params: readonly FilterParam[];
  readonly fragmentShader: string;
}

// ─── Applied Filter Instance ───

export interface AppliedFilter {
  readonly id: string;
  readonly filterId: string;
  readonly params: Record<string, FilterParamValue>;
  readonly enabled: boolean;
}
