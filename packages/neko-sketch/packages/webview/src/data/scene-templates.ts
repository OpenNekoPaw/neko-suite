/**
 * Scene Templates
 *
 * Pre-configured scene layouts for common 2D game genres.
 */
import type { SceneLayerType } from '../types/scene';

export interface SceneTemplate {
  readonly id: string;
  readonly name: string;
  readonly layers: readonly {
    readonly name: string;
    readonly type: SceneLayerType;
    readonly zIndex: number;
    readonly parallaxFactor: readonly [number, number];
    readonly objects: readonly [];
    readonly visible: boolean;
  }[];
}

export const SCENE_TEMPLATES: readonly SceneTemplate[] = [
  {
    id: 'platformer',
    name: 'Platformer (3-layer parallax)',
    layers: [
      {
        name: 'Sky',
        type: 'parallax',
        zIndex: 0,
        parallaxFactor: [0.2, 0.1],
        objects: [],
        visible: true,
      },
      {
        name: 'Mountains',
        type: 'parallax',
        zIndex: 1,
        parallaxFactor: [0.5, 0.3],
        objects: [],
        visible: true,
      },
      {
        name: 'Foreground',
        type: 'parallax',
        zIndex: 2,
        parallaxFactor: [1.0, 1.0],
        objects: [],
        visible: true,
      },
    ],
  },
  {
    id: 'topdown-rpg',
    name: 'Top-Down RPG (2-layer)',
    layers: [
      {
        name: 'Ground',
        type: 'tilemap',
        zIndex: 0,
        parallaxFactor: [1, 1],
        objects: [],
        visible: true,
      },
      {
        name: 'Objects',
        type: 'sprite',
        zIndex: 1,
        parallaxFactor: [1, 1],
        objects: [],
        visible: true,
      },
    ],
  },
  {
    id: 'visual-novel',
    name: 'Visual Novel (BG + FG)',
    layers: [
      {
        name: 'Background',
        type: 'parallax',
        zIndex: 0,
        parallaxFactor: [0.8, 0.8],
        objects: [],
        visible: true,
      },
      {
        name: 'Characters',
        type: 'sprite',
        zIndex: 1,
        parallaxFactor: [1, 1],
        objects: [],
        visible: true,
      },
    ],
  },
  {
    id: 'side-scroller',
    name: 'Side Scroller (4-layer)',
    layers: [
      {
        name: 'Sky',
        type: 'parallax',
        zIndex: 0,
        parallaxFactor: [0.1, 0],
        objects: [],
        visible: true,
      },
      {
        name: 'Far BG',
        type: 'parallax',
        zIndex: 1,
        parallaxFactor: [0.3, 0.1],
        objects: [],
        visible: true,
      },
      {
        name: 'Near BG',
        type: 'parallax',
        zIndex: 2,
        parallaxFactor: [0.6, 0.3],
        objects: [],
        visible: true,
      },
      {
        name: 'Gameplay',
        type: 'parallax',
        zIndex: 3,
        parallaxFactor: [1.0, 1.0],
        objects: [],
        visible: true,
      },
    ],
  },
];
