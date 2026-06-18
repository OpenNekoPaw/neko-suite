import { describe, expect, it } from 'vitest';
import { CapturedLogTransport } from '../captured-log-transport';
import { ConsoleLogger } from '../console-logger';
import { createLoggerRegistry, createWebviewLoggerRegistry, LogLevel } from '../index';

describe('Webview logger registries', () => {
  it('creates child loggers from a package root', () => {
    const transport = new CapturedLogTransport();
    const registry = createWebviewLoggerRegistry({
      packageName: 'NekoPreview',
      defaultLevel: LogLevel.Debug,
      rootLogger: new ConsoleLogger('NekoPreview', LogLevel.Debug, [transport]),
    });

    registry.getLogger('VideoPlayer').debug('stream.start', { id: 'stream-1' });

    expect(transport.findByMessage('stream.start')).toMatchObject({
      source: 'NekoPreview:VideoPlayer',
      level: LogLevel.Debug,
      data: { id: 'stream-1' },
    });
  });

  it('lets tests replace the root logger without changing component code', () => {
    const firstTransport = new CapturedLogTransport();
    const secondTransport = new CapturedLogTransport();
    const registry = createLoggerRegistry('NekoCanvas', LogLevel.Debug);

    registry.setRootLogger(new ConsoleLogger('TestCanvas', LogLevel.Debug, [firstTransport]));
    registry.getLogger('InlineVideo').info('before.replace');
    registry.setRootLogger(new ConsoleLogger('InjectedCanvas', LogLevel.Debug, [secondTransport]));
    registry.getLogger('InlineVideo').info('after.replace');

    expect(firstTransport.findByMessage('before.replace')?.source).toBe('TestCanvas:InlineVideo');
    expect(secondTransport.findByMessage('after.replace')?.source).toBe(
      'InjectedCanvas:InlineVideo',
    );
  });

  it('propagates root ConsoleLogger level changes through registry children', () => {
    const transport = new CapturedLogTransport();
    const registry = createLoggerRegistry('NekoAudio', LogLevel.Debug);
    const root = new ConsoleLogger('NekoAudio', LogLevel.Debug, [transport]);
    registry.setRootLogger(root);

    const logger = registry.getLogger('TransportBar');
    root.setLevel(LogLevel.Warn);
    logger.info('hidden');
    logger.warn('visible');

    expect(transport.findByMessage('hidden')).toBeUndefined();
    expect(transport.findByMessage('visible')?.source).toBe('NekoAudio:TransportBar');
  });
});
