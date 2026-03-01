import type { MessageBundle } from '@neko/shared';

import { agentControl } from './agentControl';
import { agents } from './agents';
import { animation } from './animation';
import { audio } from './audio';
import { blendMode } from './blendMode';
import { chat } from './chat';
import { colorCorrection } from './colorCorrection';
import { common } from './common';
import { effects } from './effects';
import { errors } from './errors';
import { exportBundle } from './export';
import { header } from './header';
import { history } from './history';
import { mask } from './mask';
import { preview } from './preview';
import { promptTemplates } from './promptTemplates';
import { propertyPanel } from './propertyPanel';
import { settings } from './settings';
import { shape } from './shape';
import { speed } from './speed';
import { subAgent } from './subAgent';
import { subtitles } from './subtitles';
import { tasks } from './tasks';
import { timeline } from './timeline';
import { toolCalls } from './toolCalls';
import { transition } from './transition';

export const bundles: Record<string, MessageBundle> = {
  agentControl,
  agents,
  animation,
  audio,
  blendMode,
  chat,
  colorCorrection,
  common,
  effects,
  errors,
  exportBundle,
  header,
  history,
  mask,
  preview,
  promptTemplates,
  propertyPanel,
  settings,
  shape,
  speed,
  subAgent,
  subtitles,
  tasks,
  timeline,
  toolCalls,
  transition,
};
