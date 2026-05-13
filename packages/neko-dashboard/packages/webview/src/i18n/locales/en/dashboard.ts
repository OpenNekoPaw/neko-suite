import type { MessageBundle } from '@neko/shared';

export const dashboard = {
  'dashboard.title': 'Neko Dashboard',

  'dashboard.status.engine': 'Engine',
  'dashboard.status.projects': 'Projects',
  'dashboard.status.agent': 'Agent',
  'dashboard.status.assets': 'Assets',
  'dashboard.status.ready': 'Ready',
  'dashboard.status.running': '{running}/{total} running',
  'dashboard.status.files': '{count} files',

  'dashboard.quickStart': 'Quick Start',
  'dashboard.quickStart.video': 'New Video',
  'dashboard.quickStart.canvas': 'New Canvas',
  'dashboard.quickStart.sketch': 'New Sketch',
  'dashboard.quickStart.audio': 'New Audio',
  'dashboard.quickStart.model': 'New Model',
  'dashboard.quickStart.puppet': 'New Puppet',
  'dashboard.quickStart.ai': 'Open Chat',

  'dashboard.workflows': 'Creative Workflows',

  'dashboard.workflow.filmmaking': 'Film & Video',
  'dashboard.workflow.filmmaking.desc':
    'Video editing, audio mixing, AI-powered generation and enhancement',
  'dashboard.workflow.filmmaking.tags': 'Video, Audio, AI Generate',

  'dashboard.workflow.screenwriting': 'Screenwriting',
  'dashboard.workflow.screenwriting.desc':
    'Script editing with LSP, storyboard generation, timeline conversion',
  'dashboard.workflow.screenwriting.tags': 'Script, Storyboard, AI Script',

  'dashboard.workflow.visual': 'Visual Art',
  'dashboard.workflow.visual.desc':
    'Digital painting with pressure sensitivity, canvas composition, AI image generation',
  'dashboard.workflow.visual.tags': 'Sketch, Canvas, AI Image',

  'dashboard.workflow.modeling': '3D & Character',
  'dashboard.workflow.modeling.desc':
    '3D model editing, character sculpting, GPU-accelerated real-time viewport',
  'dashboard.workflow.modeling.tags': 'Model, Sculpt, AI Face',

  'dashboard.workflow.animation': 'Animation & Live',
  'dashboard.workflow.animation.desc':
    '2D skeletal animation, live motion capture, real-time puppet streaming',
  'dashboard.workflow.animation.tags': 'Puppet, Live, Motion Cap',

  'dashboard.workflow.ai': 'AI Assistant',
  'dashboard.workflow.ai.desc':
    'Multi-model chat, image/video/audio generation, multimodal analysis',
  'dashboard.workflow.ai.tags': 'Chat, Generate, Analyze',

  'dashboard.workflow.unavailable': 'Extension not installed',

  'dashboard.skills': 'Installed Skills',
  'dashboard.skills.empty':
    'No skills available. Install Neko suite extensions to unlock AI capabilities.',
} as const satisfies MessageBundle;
