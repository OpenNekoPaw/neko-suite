/**
 * Plan Wire — barrel re-export for the `plan-wire/` modules.
 *
 * Five independent concerns live under `./plan-wire/`:
 *   - converters     pure LitePlan / Workflow → wire-type conversions
 *   - capabilities   pure capability derivation
 *   - messenger      webview postMessage helpers
 *   - broadcast      cross-extension broadcast
 *   - store-writer   PlanStore read/write facade
 *   - notifier       user-facing notification seam
 *
 * Keeping each in its own file prevents plan-wire from becoming a
 * second god-module.  New helpers should pick the matching concern
 * (or add a new file) rather than pile into this barrel.
 */

export * from './plan-wire/converters';
export * from './plan-wire/capabilities';
export * from './plan-wire/messenger';
export * from './plan-wire/broadcast';
export * from './plan-wire/store-writer';
export * from './plan-wire/notifier';
