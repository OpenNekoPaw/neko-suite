import { lazy } from 'react';
import { createPlaceholderSubsystemRegistration } from './placeholder';
import { createNarrativeNodeTypeDescriptors } from './narrative/descriptors';
import { createNarrativeNodeRendererRegistry } from './narrative/renderers';

const narrativeRegistration = {
  ...createPlaceholderSubsystemRegistration('narrative'),
  nodeRenderers: createNarrativeNodeRendererRegistry(),
  nodeTypeDescriptors: createNarrativeNodeTypeDescriptors(),
  floatingPanels: [
    {
      id: 'narrative.variables',
      title: 'Narrative Variables',
      component: lazy(() => import('./narrative/NarrativeVariablesPanel')),
    },
  ],
  playbackController: {
    id: 'narrative.playback',
    title: 'Narrative Playback',
    component: lazy(() => import('./narrative/NarrativePlaybackController')),
  },
};

export default narrativeRegistration;
