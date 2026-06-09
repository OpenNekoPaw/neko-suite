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
  'dashboard.status.endpointUnknown': 'Endpoint unknown',
  'dashboard.status.health.healthy': 'Healthy',
  'dashboard.status.health.unhealthy': 'Unhealthy',
  'dashboard.status.health.unknown': 'Health unknown',

  'dashboard.quickStart': 'Quick Start',
  'dashboard.quickStart.screenplay': 'New Script',
  'dashboard.quickStart.video': 'New Video',
  'dashboard.quickStart.canvas': 'New Canvas',
  'dashboard.quickStart.sketch': 'New Sketch',
  'dashboard.quickStart.audio': 'New Audio',
  'dashboard.quickStart.model': 'New Model',
  'dashboard.quickStart.puppet': 'New Puppet',
  'dashboard.quickStart.ai': 'Open Chat',

  'dashboard.workflows': 'Creative Suite',

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
  'dashboard.skills.count': '{count} skills',
  'dashboard.skills.filteredCount': '{shown}/{total} skills',
  'dashboard.skills.allTags': 'All',
  'dashboard.skills.filterByTag': 'Filter skills by tag',
  'dashboard.skills.empty':
    'No skills available. Install Neko suite extensions to unlock AI capabilities.',
  'dashboard.skills.noFilteredResults': 'No skills match this filter.',
  'dashboard.skills.run': 'Run',
  'dashboard.skills.new': 'New Skill',
  'dashboard.skills.newNamePrompt': 'Skill name',
  'dashboard.skills.rescan': 'Rescan',
  'dashboard.skills.orchestrators': 'Orchestrators',
  'dashboard.skills.standalone': 'Standalone Skills',
  'dashboard.skills.quickActions': 'Quick Actions',
  'dashboard.skills.advanced': 'Advanced',
  'dashboard.skills.childSkills': 'Focused skills',
  'dashboard.skills.childSkillsWithCount': 'Focused ({count})',
  'dashboard.skills.showAdvanced': 'Show advanced ({count})',
  'dashboard.skills.hideAdvanced': 'Hide advanced',
  'dashboard.skills.source.builtin': 'Built-in',
  'dashboard.skills.source.project': 'Workspace',
  'dashboard.skills.source.personal': 'User',
  'dashboard.skills.source.market': 'Market',
  'dashboard.skills.source.plugin': 'Plugin',
  'dashboard.skills.role.orchestrator': 'Orchestrator',
  'dashboard.skills.role.focused-skill': 'Focused',
  'dashboard.skills.role.standalone': 'Standalone',
  'dashboard.skills.role.quick-action': 'Action',
  'dashboard.skills.role.persona': 'Persona',
  'dashboard.skills.action.run': 'Run',
  'dashboard.skills.action.edit': 'Edit',
  'dashboard.skills.action.reveal': 'Reveal',
  'dashboard.skills.action.fork': 'Fork',
  'dashboard.skills.action.create': 'Create',
  'dashboard.skills.action.duplicate': 'Duplicate',
  'dashboard.skills.action.rescan': 'Rescan',
} as const satisfies MessageBundle;
