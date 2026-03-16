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
    name: 'sketch.filter.gaussianBlur',
    category: 'blur',
    params: [
      {
        name: 'u_radius',
        label: 'sketch.filter.param.radius',
        type: 'float',
        default: 5,
        min: 0,
        max: 50,
        step: 0.5,
      },
    ],
    fragmentShader: GAUSSIAN_BLUR_FRAG,
  },
  {
    id: 'brightness-contrast',
    name: 'sketch.filter.brightnessContrast',
    category: 'color',
    params: [
      {
        name: 'u_brightness',
        label: 'sketch.filter.param.brightness',
        type: 'float',
        default: 0,
        min: -1,
        max: 1,
        step: 0.01,
      },
      {
        name: 'u_contrast',
        label: 'sketch.filter.param.contrast',
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
    name: 'sketch.filter.hueSaturation',
    category: 'color',
    params: [
      {
        name: 'u_hue',
        label: 'sketch.filter.param.hue',
        type: 'float',
        default: 0,
        min: -0.5,
        max: 0.5,
        step: 0.01,
      },
      {
        name: 'u_saturation',
        label: 'sketch.filter.param.saturation',
        type: 'float',
        default: 0,
        min: -1,
        max: 1,
        step: 0.01,
      },
      {
        name: 'u_lightness',
        label: 'sketch.filter.param.lightness',
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
    name: 'sketch.filter.sharpen',
    category: 'stylize',
    params: [
      {
        name: 'u_amount',
        label: 'sketch.filter.param.amount',
        type: 'float',
        default: 0.5,
        min: 0,
        max: 3,
        step: 0.1,
      },
    ],
    fragmentShader: SHARPEN_FRAG,
  },
  {
    id: 'vignette',
    name: 'sketch.filter.vignette',
    category: 'stylize',
    params: [
      {
        name: 'u_radius',
        label: 'sketch.filter.param.radius',
        type: 'float',
        default: 0.75,
        min: 0,
        max: 1,
        step: 0.01,
      },
      {
        name: 'u_softness',
        label: 'sketch.filter.param.softness',
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
    name: 'sketch.filter.chromaticAberration',
    category: 'distort',
    params: [
      {
        name: 'u_offset',
        label: 'sketch.filter.param.offset',
        type: 'float',
        default: 3,
        min: 0,
        max: 20,
        step: 0.5,
      },
    ],
    fragmentShader: CHROMATIC_ABERRATION_FRAG,
  },
  {
    id: 'exposure',
    name: 'sketch.filter.exposure',
    category: 'color',
    params: [
      {
        name: 'u_exposure',
        label: 'sketch.filter.param.stops',
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
    name: 'sketch.filter.colorTemperature',
    category: 'color',
    params: [
      {
        name: 'u_temperature',
        label: 'sketch.filter.param.temperature',
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
    name: 'sketch.filter.glow',
    category: 'stylize',
    params: [
      {
        name: 'u_intensity',
        label: 'sketch.filter.param.intensity',
        type: 'float',
        default: 0.8,
        min: 0,
        max: 3,
        step: 0.1,
      },
      {
        name: 'u_radius',
        label: 'sketch.filter.param.radius',
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
    name: 'sketch.filter.filmGrain',
    category: 'stylize',
    params: [
      {
        name: 'u_amount',
        label: 'sketch.filter.param.amount',
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
