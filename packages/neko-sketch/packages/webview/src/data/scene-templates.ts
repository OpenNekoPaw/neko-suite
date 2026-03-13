/**
 * Scene Templates
 *
 * Pre-configured scene layouts for common 2D game genres.
 */
import type { SceneLayerType } from '../types/scene';

export interface SceneTemplate {
  readonly id: string;
  readonly nameKey: string;
  readonly layers: readonly {
    readonly nameKey: string;
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
    nameKey: 'sketch.template.platformer',
    layers: [
      {
        nameKey: 'sketch.template.layer.sky',
        type: 'parallax',
        zIndex: 0,
        parallaxFactor: [0.2, 0.1],
        objects: [],
        visible: true,
      },
      {
        nameKey: 'sketch.template.layer.mountains',
        type: 'parallax',
        zIndex: 1,
        parallaxFactor: [0.5, 0.3],
        objects: [],
        visible: true,
      },
      {
        nameKey: 'sketch.template.layer.foreground',
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
    nameKey: 'sketch.template.topdownRpg',
    layers: [
      {
        nameKey: 'sketch.template.layer.ground',
        type: 'tilemap',
        zIndex: 0,
        parallaxFactor: [1, 1],
        objects: [],
        visible: true,
      },
      {
        nameKey: 'sketch.template.layer.objects',
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
    nameKey: 'sketch.template.visualNovel',
    layers: [
      {
        nameKey: 'sketch.template.layer.background',
        type: 'parallax',
        zIndex: 0,
        parallaxFactor: [0.8, 0.8],
        objects: [],
        visible: true,
      },
      {
        nameKey: 'sketch.template.layer.characters',
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
    nameKey: 'sketch.template.sideScroller',
    layers: [
      {
        nameKey: 'sketch.template.layer.sky',
        type: 'parallax',
        zIndex: 0,
        parallaxFactor: [0.1, 0],
        objects: [],
        visible: true,
      },
      {
        nameKey: 'sketch.template.layer.farBg',
        type: 'parallax',
        zIndex: 1,
        parallaxFactor: [0.3, 0.1],
        objects: [],
        visible: true,
      },
      {
        nameKey: 'sketch.template.layer.nearBg',
        type: 'parallax',
        zIndex: 2,
        parallaxFactor: [0.6, 0.3],
        objects: [],
        visible: true,
      },
      {
        nameKey: 'sketch.template.layer.gameplay',
        type: 'parallax',
        zIndex: 3,
        parallaxFactor: [1.0, 1.0],
        objects: [],
        visible: true,
      },
    ],
  },
];
