type SignalExitHandler = (code?: number | null, signal?: NodeJS.Signals | null) => void;

export const signals: readonly NodeJS.Signals[] = ['SIGHUP', 'SIGINT', 'SIGTERM'];

export function load(): void {
  // The standalone TUI only needs Ink's unsubscribe hook during Bun compile.
}

export function unload(): void {
  // Kept for compatibility with signal-exit's public surface.
}

export function onExit(handler: SignalExitHandler): () => void {
  const exitHandler = (code: number) => handler(code, null);
  const signalHandlers = signals.map((signal) => {
    const listener = () => {
      handler(null, signal);
      process.kill(process.pid, signal);
    };
    process.once(signal, listener);
    return { signal, listener };
  });
  process.once('exit', exitHandler);
  return () => {
    process.off('exit', exitHandler);
    for (const { signal, listener } of signalHandlers) {
      process.off(signal, listener);
    }
  };
}

export default onExit;
