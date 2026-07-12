import { useEffect, useLayoutEffect, useReducer, useRef } from 'react';
import type { OpenTab } from '@neko-agent/types';
import {
  createTabRenderRuntimeRegistry,
  type TabRenderRuntimeRegistry,
} from './tab-render-runtime';

interface RegistryRootLease {
  generation: number;
  active: boolean;
}

export function useTabRenderRuntimeRegistry(
  openTabs: readonly OpenTab[],
  activeTabId: string | null,
): TabRenderRuntimeRegistry {
  const registryRef = useRef<TabRenderRuntimeRegistry>();
  const rootLeaseRef = useRef<RegistryRootLease>({ generation: 0, active: false });
  const [, publishReconciliation] = useReducer((revision: number) => revision + 1, 0);
  registryRef.current ??= createTabRenderRuntimeRegistry();
  const registry = registryRef.current;

  useLayoutEffect(() => {
    registry.reconcile(
      openTabs.map((tab) => ({ tabId: tab.id, conversationId: tab.conversationId })),
      activeTabId,
    );
    publishReconciliation();
  }, [activeTabId, openTabs, registry]);

  useEffect(() => {
    const lease = rootLeaseRef.current;
    const generation = lease.generation + 1;
    lease.generation = generation;
    lease.active = true;

    return () => {
      lease.active = false;
      queueMicrotask(() => {
        if (!lease.active && lease.generation === generation) {
          registry.dispose();
        }
      });
    };
  }, [registry]);

  return registry;
}
