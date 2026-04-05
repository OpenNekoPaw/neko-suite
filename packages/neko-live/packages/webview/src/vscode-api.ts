/** Singleton VSCode API instance — acquireVsCodeApi() can only be called once. */

declare function acquireVsCodeApi(): { postMessage: (msg: unknown) => void };

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
export const vscode =
  ((globalThis as Record<string, unknown>).__vscodeApi as
    | ReturnType<typeof acquireVsCodeApi>
    | undefined) ??
  (() => {
    const api = acquireVsCodeApi();
    (globalThis as Record<string, unknown>).__vscodeApi = api;
    return api;
  })();
