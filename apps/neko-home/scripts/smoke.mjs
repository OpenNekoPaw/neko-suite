import { assertBundle, buildHome } from './runtime-utils.mjs';

buildHome();
assertBundle();
process.stdout.write('Neko Home build smoke passed.\n');
