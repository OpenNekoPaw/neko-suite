import { buildDesktopBundle, packageRoot, runElectron } from './runtime-utils.mjs';

buildDesktopBundle();

runElectron([packageRoot]);
