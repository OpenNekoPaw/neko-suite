// Puppet animation system
//
// Supports INP (legacy) and MOC3 (Live2D) formats via runtime-puppet engine backend

export type { IPuppetController } from './puppet-controller';
export { PuppetController } from './puppet-controller';

// Backward-compatible aliases (deprecated — use PuppetController / IPuppetController)
export { PuppetController as Inochi2DController } from './puppet-controller';
export type { IPuppetController as IInochi2DController } from './puppet-controller';

export type { PuppetSnapshot, PuppetDelta, DeformedMesh, ParameterInfo } from './types';
