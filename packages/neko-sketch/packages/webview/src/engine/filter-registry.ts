/**
 * Filter Registry
 *
 * Registers built-in filter definitions and provides lookup by id/category.
 */
import type { FilterDef, FilterCategory } from '../types/filter';
import {
  GAUSSIAN_BLUR_FRAG,
  BRIGHTNESS_CONTRAST_FRAG,
  HUE_SATURATION_FRAG,
  SHARPEN_FRAG,
  VIGNETTE_FRAG,
  CHROMATIC_ABERRATION_FRAG,
  EXPOSURE_FRAG,
  TEMPERATURE_FRAG,
  GLOW_FRAG,
  FILM_GRAIN_FRAG,
} from './filter-shaders';

const BUILTIN_FILTERS: readonly FilterDef[] = [
  {
    id: 'gaussian-blur',
    name: 'Gaussian Blur',
    category: 'blur',
    params: [
      { name: 'u_radius', label: 'Radius', type: 'float', default: 5, min: 0, max: 50, step: 0.5 },
    ],
    fragmentShader: GAUSSIAN_BLUR_FRAG,
  },
  {
    id: 'brightness-contrast',
    name: 'Brightness / Contrast',
    category: 'color',
    params: [
      {
        name: 'u_brightness',
        label: 'Brightness',
        type: 'float',
        default: 0,
        min: -1,
        max: 1,
        step: 0.01,
      },
      {
        name: 'u_contrast',
        label: 'Contrast',
        type: 'float',
        default: 0,
        min: -1,
        max: 1,
        step: 0.01,
      },
    ],
    fragmentShader: BRIGHTNESS_CONTRAST_FRAG,
  },
  {
    id: 'hue-saturation',
    name: 'Hue / Saturation',
    category: 'color',
    params: [
      { name: 'u_hue', label: 'Hue', type: 'float', default: 0, min: -0.5, max: 0.5, step: 0.01 },
      {
        name: 'u_saturation',
        label: 'Saturation',
        type: 'float',
        default: 0,
        min: -1,
        max: 1,
        step: 0.01,
      },
      {
        name: 'u_lightness',
        label: 'Lightness',
        type: 'float',
        default: 0,
        min: -1,
        max: 1,
        step: 0.01,
      },
    ],
    fragmentShader: HUE_SATURATION_FRAG,
  },
  {
    id: 'sharpen',
    name: 'Sharpen',
    category: 'stylize',
    params: [
      { name: 'u_amount', label: 'Amount', type: 'float', default: 0.5, min: 0, max: 3, step: 0.1 },
    ],
    fragmentShader: SHARPEN_FRAG,
  },
  {
    id: 'vignette',
    name: 'Vignette',
    category: 'stylize',
    params: [
      {
        name: 'u_radius',
        label: 'Radius',
        type: 'float',
        default: 0.75,
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        name: 'u_softness',
        label: 'Softness',
        type: 'float',
        default: 0.45,
        min: 0,
        max: 1,
        step: 0.01,
      },
    ],
    fragmentShader: VIGNETTE_FRAG,
  },
  {
    id: 'chromatic-aberration',
    name: 'Chromatic Aberration',
    category: 'distort',
    params: [
      { name: 'u_offset', label: 'Offset', type: 'float', default: 3, min: 0, max: 20, step: 0.5 },
    ],
    fragmentShader: CHROMATIC_ABERRATION_FRAG,
  },
  {
    id: 'exposure',
    name: 'Exposure',
    category: 'color',
    params: [
      {
        name: 'u_exposure',
        label: 'Stops',
        type: 'float',
        default: 0,
        min: -3,
        max: 3,
        step: 0.1,
      },
    ],
    fragmentShader: EXPOSURE_FRAG,
  },
  {
    id: 'temperature',
    name: 'Color Temperature',
    category: 'color',
    params: [
      {
        name: 'u_temperature',
        label: 'Temperature',
        type: 'float',
        default: 0,
        min: -1,
        max: 1,
        step: 0.01,
      },
    ],
    fragmentShader: TEMPERATURE_FRAG,
  },
  {
    id: 'glow',
    name: 'Glow',
    category: 'stylize',
    params: [
      {
        name: 'u_intensity',
        label: 'Intensity',
        type: 'float',
        default: 0.8,
        min: 0,
        max: 3,
        step: 0.1,
      },
      {
        name: 'u_radius',
        label: 'Radius',
        type: 'float',
        default: 4,
        min: 1,
        max: 20,
        step: 0.5,
      },
    ],
    fragmentShader: GLOW_FRAG,
  },
  {
    id: 'film-grain',
    name: 'Film Grain',
    category: 'stylize',
    params: [
      {
        name: 'u_amount',
        label: 'Amount',
        type: 'float',
        default: 0.05,
        min: 0,
        max: 0.3,
        step: 0.005,
      },
    ],
    fragmentShader: FILM_GRAIN_FRAG,
  },
];

export class FilterRegistry {
  private readonly filters = new Map<string, FilterDef>();

  constructor() {
    for (const def of BUILTIN_FILTERS) {
      this.filters.set(def.id, def);
    }
  }

  get(id: string): FilterDef | undefined {
    return this.filters.get(id);
  }

  list(): readonly FilterDef[] {
    return [...this.filters.values()];
  }

  listByCategory(category: FilterCategory): readonly FilterDef[] {
    return [...this.filters.values()].filter((f) => f.category === category);
  }

  register(def: FilterDef): void {
    this.filters.set(def.id, def);
  }
}
