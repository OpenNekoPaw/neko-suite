import type { MessageBundle } from '@neko/shared';

import { common } from './common';
import { creativeEntities } from './creativeEntities';
import { dashboard } from './dashboard';
import { projects } from './projects';
import { recent } from './recent';
import { tasks } from './tasks';

export const bundles: Record<string, MessageBundle> = {
  common,
  creativeEntities,
  dashboard,
  projects,
  recent,
  tasks,
};
