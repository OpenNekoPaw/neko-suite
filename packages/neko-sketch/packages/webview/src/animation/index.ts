// S.2: Animation system interfaces
//
// Currently supports:
// - Inochi2D puppets via inox2d (native-puppet engine backend)
//
// Future:
// - Frame-by-frame animation (S.2c)
// - Onion skin rendering

export type { IInochi2DController } from './inochi2d-controller';
export { Inochi2DController } from './inochi2d-controller';
export type { PuppetSnapshot, PuppetDelta, DeformedMesh, ParameterInfo } from './types';
