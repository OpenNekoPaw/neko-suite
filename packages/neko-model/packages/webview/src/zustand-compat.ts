/**
 * Zustand compatibility shim for @react-three/fiber v8.
 *
 * R3F v8 internally does `import create from 'zustand'` (default import),
 * but zustand v4.4+ only has named exports. This shim re-exports `create`
 * as default to satisfy R3F's import.
 */
export { create as default, create } from 'zustand';
export * from 'zustand';
