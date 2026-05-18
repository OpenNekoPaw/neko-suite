export class EventEmitter<T> {
  private readonly listeners = new Set<(event: T) => void>();
  readonly event = (listener: (event: T) => void) => {
    this.listeners.add(listener);
    return {
      dispose: () => {
        this.listeners.delete(listener);
      },
    };
  };

  fire(event: T): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  dispose(): void {
    this.listeners.clear();
  }
}

export const commands = {
  registerCommand: () => ({ dispose: () => undefined }),
};
