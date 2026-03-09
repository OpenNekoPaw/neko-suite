/**
 * useTerminalSize Hook
 *
 * Tracks terminal dimensions and updates the UI store
 * when the terminal is resized.
 */

import { useEffect } from 'react';
import { useUIStore } from '../stores/ui-store';

/**
 * Listen for terminal resize events and keep UI store in sync.
 */
export function useTerminalSize(): void {
  useEffect(() => {
    function handleResize() {
      useUIStore.getState().setTerminalSize({
        rows: process.stdout.rows ?? 24,
        columns: process.stdout.columns ?? 80,
      });
    }

    process.stdout.on('resize', handleResize);
    // Set initial size
    handleResize();

    return () => {
      process.stdout.off('resize', handleResize);
    };
  }, []);
}
