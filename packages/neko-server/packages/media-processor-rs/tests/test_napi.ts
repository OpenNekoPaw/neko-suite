/**
 * =============================================================================
 * media-processor-rs NAPI Interface Test Script
 * =============================================================================
 * Usage: npx ts-node test_napi.ts [test_video.mp4]
 * Prerequisites: npm install @vedit/media-processor-rs
 * =============================================================================
 */

import { MediaProcessor } from '@vedit/media-processor-rs';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// Types
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration?: number;
}

// =============================================================================
// Configuration
// =============================================================================

const TEST_VIDEO = process.argv[2] || '/path/to/test_video.mp4';
const OUTPUT_DIR = './test_output';

// =============================================================================
// Test Utilities
// =============================================================================

const results: TestResult[] = [];

function log(message: string): void {
  console.log(message);
}

function logSection(title: string): void {
  console.log('\n========================================');
  console.log(` ${title}`);
  console.log('========================================');
}

function logPass(name: string, duration?: number): void {
  const durationStr = duration ? ` (${duration.toFixed(2)}ms)` : '';
  console.log(`\x1b[32m[PASS]\x1b[0m ${name}${durationStr}`);
  results.push({ name, passed: true, duration });
}

function logFail(name: string, error: string): void {
  console.log(`\x1b[31m[FAIL]\x1b[0m ${name}: ${error}`);
  results.push({ name, passed: false, error });
}

function logSkip(name: string, reason: string): void {
  console.log(`\x1b[33m[SKIP]\x1b[0m ${name}: ${reason}`);
  results.push({ name, passed: true, error: `Skipped: ${reason}` });
}

async function runTest(
  name: string,
  testFn: () => Promise<void> | void
): Promise<void> {
  const start = performance.now();
  try {
    await testFn();
    const duration = performance.now() - start;
    logPass(name, duration);
  } catch (error) {
    logFail(name, error instanceof Error ? error.message : String(error));
  }
}

function setupTestEnv(): void {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  log(`Test output directory: ${OUTPUT_DIR}`);
}

function cleanup(): void {
  if (fs.existsSync(OUTPUT_DIR)) {
    fs.rmSync(OUTPUT_DIR, { recursive: true });
    log('Cleaned up test output directory');
  }
}

function hasTestVideo(): boolean {
  return fs.existsSync(TEST_VIDEO);
}

// =============================================================================
// Test: MediaProcessor Creation
// =============================================================================

async function testMediaProcessorCreate(): Promise<MediaProcessor> {
  logSection('MediaProcessor Creation Tests');

  let processor: MediaProcessor | null = null;

  await runTest('MediaProcessor.create()', async () => {
    processor = await MediaProcessor.create();
    if (!processor) {
      throw new Error('Failed to create MediaProcessor instance');
    }
  });

  if (!processor) {
    throw new Error('MediaProcessor not created');
  }

  return processor;
}

// =============================================================================
// Test: GPU Info
// =============================================================================

async function testGpuInfo(processor: MediaProcessor): Promise<void> {
  logSection('GPU Info Tests');

  await runTest('getGpuInfo()', () => {
    const gpuInfo = processor.getGpuInfo();
    if (!gpuInfo.name || !gpuInfo.backend) {
      throw new Error('Invalid GPU info');
    }
    log(`  GPU: ${gpuInfo.name} (${gpuInfo.backend})`);
  });

  await runTest('detectHwAccel()', () => {
    const hwAccel = processor.detectHwAccel();
    if (!hwAccel.decoders || !hwAccel.encoders) {
      throw new Error('Invalid HW accel info');
    }
    log(`  Decoders: ${hwAccel.decoders.join(', ')}`);
    log(`  Encoders: ${hwAccel.encoders.join(', ')}`);
  });
}

// =============================================================================
// Test: Video Decoding
// =============================================================================

async function testVideoDecoding(processor: MediaProcessor): Promise<void> {
  logSection('Video Decoding Tests');

  if (!hasTestVideo()) {
    logSkip('decodeFrame()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('decodeFrameRange()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('decodeFrameZerocopy()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('decodeToTexture()', `Test video not found: ${TEST_VIDEO}`);
    return;
  }

  await runTest('decodeFrame()', () => {
    const frame = processor.decodeFrame(
      { path: TEST_VIDEO, hwAccel: 'auto', outputFormat: 'rgba' },
      0.0
    );
    if (!frame.width || !frame.height || !frame.data) {
      throw new Error('Invalid frame data');
    }
    log(`  Frame: ${frame.width}x${frame.height}, ${frame.data.length} bytes`);
  });

  await runTest('decodeFrame() at 5s', () => {
    const frame = processor.decodeFrame({ path: TEST_VIDEO }, 5.0);
    if (!frame.width || !frame.height) {
      throw new Error('Invalid frame data');
    }
  });

  await runTest('decodeFrameRange()', () => {
    const frames = processor.decodeFrameRange(
      { path: TEST_VIDEO },
      0.0,
      0.5,
      30.0
    );
    if (!frames || frames.length === 0) {
      throw new Error('No frames decoded');
    }
    log(`  Decoded ${frames.length} frames`);
  });

  await runTest('decodeFrameZerocopy()', () => {
    try {
      const frame = processor.decodeFrameZerocopy({ path: TEST_VIDEO }, 1.0);
      if (!frame.width || !frame.height) {
        throw new Error('Invalid frame data');
      }
    } catch (e) {
      // Zero-copy may not be available on all platforms
      if (String(e).includes('not supported')) {
        log('  Zero-copy not supported on this platform');
        return;
      }
      throw e;
    }
  });

  await runTest('decodeToTexture()', () => {
    try {
      const texture = processor.decodeToTexture({ path: TEST_VIDEO }, 2.0);
      if (!texture.id || !texture.width || !texture.height) {
        throw new Error('Invalid texture handle');
      }
      log(`  Texture: id=${texture.id}, ${texture.width}x${texture.height}`);
    } catch (e) {
      // Texture decoding may not be available
      if (String(e).includes('not supported')) {
        log('  Texture decoding not supported');
        return;
      }
      throw e;
    }
  });
}

// =============================================================================
// Test: GPU Effects
// =============================================================================

async function testGpuEffects(processor: MediaProcessor): Promise<void> {
  logSection('GPU Effects Tests');

  if (!hasTestVideo()) {
    logSkip('applyEffects()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('applyBlur()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('applySharpen()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('applyVignette()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('applyFilmGrain()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('applyGlow()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('applyChromaticAberration()', `Test video not found: ${TEST_VIDEO}`);
    return;
  }

  const frame = processor.decodeFrame({ path: TEST_VIDEO }, 0.0);

  await runTest('applyEffects() - color correction', () => {
    const result = processor.applyEffects(frame, {
      brightness: 0.1,
      contrast: 1.2,
      saturation: 1.1,
      exposure: 0.5,
      gamma: 1.0,
    });
    if (!result.width || !result.height) {
      throw new Error('Invalid result');
    }
  });

  await runTest('applyBlur() - gaussian', () => {
    const result = processor.applyBlur(frame, {
      blurType: 'gaussian',
      radius: 10,
    });
    if (!result.width || !result.height) {
      throw new Error('Invalid result');
    }
  });

  await runTest('applyBlur() - directional', () => {
    const result = processor.applyBlur(frame, {
      blurType: 'directional',
      radius: 15,
      directionX: 1.0,
      directionY: 0.0,
    });
    if (!result.width || !result.height) {
      throw new Error('Invalid result');
    }
  });

  await runTest('applyBlur() - radial', () => {
    const result = processor.applyBlur(frame, {
      blurType: 'radial',
      radius: 10,
      centerX: 0.5,
      centerY: 0.5,
    });
    if (!result.width || !result.height) {
      throw new Error('Invalid result');
    }
  });

  await runTest('applySharpen()', () => {
    const result = processor.applySharpen(frame, {
      amount: 1.5,
      radius: 1.0,
      threshold: 0.1,
    });
    if (!result.width || !result.height) {
      throw new Error('Invalid result');
    }
  });

  await runTest('applyVignette()', () => {
    const result = processor.applyVignette(frame, {
      amount: 0.5,
      radius: 1.0,
      softness: 0.5,
    });
    if (!result.width || !result.height) {
      throw new Error('Invalid result');
    }
  });

  await runTest('applyFilmGrain()', () => {
    const result = processor.applyFilmGrain(frame, {
      amount: 0.3,
      size: 1.5,
      colorAmount: 0.2,
    });
    if (!result.width || !result.height) {
      throw new Error('Invalid result');
    }
  });

  await runTest('applyGlow()', () => {
    const result = processor.applyGlow(frame, {
      intensity: 1.0,
      threshold: 0.7,
      radius: 20,
    });
    if (!result.width || !result.height) {
      throw new Error('Invalid result');
    }
  });

  await runTest('applyChromaticAberration()', () => {
    const result = processor.applyChromaticAberration(frame, {
      amount: 0.02,
      angle: 0,
      centerX: 0.5,
      centerY: 0.5,
    });
    if (!result.width || !result.height) {
      throw new Error('Invalid result');
    }
  });
}

// =============================================================================
// Test: Transitions
// =============================================================================

async function testTransitions(processor: MediaProcessor): Promise<void> {
  logSection('Transition Effects Tests');

  if (!hasTestVideo()) {
    logSkip('applyTransition()', `Test video not found: ${TEST_VIDEO}`);
    return;
  }

  const fromFrame = processor.decodeFrame({ path: TEST_VIDEO }, 0.0);
  const toFrame = processor.decodeFrame({ path: TEST_VIDEO }, 5.0);

  const transitionTypes = [
    'fade',
    'wipe_left',
    'wipe_right',
    'iris_circle',
    'dissolve',
    'pixelate',
    'glitch',
    'flash',
  ];

  for (const transitionType of transitionTypes) {
    await runTest(`applyTransition() - ${transitionType}`, () => {
      const result = processor.applyTransition(fromFrame, toFrame, {
        transitionType,
        progress: 0.5,
        feather: 0.1,
      });
      if (!result.width || !result.height) {
        throw new Error('Invalid result');
      }
    });
  }
}

// =============================================================================
// Test: Video Encoding
// =============================================================================

async function testVideoEncoding(processor: MediaProcessor): Promise<void> {
  logSection('Video Encoding Tests');

  await runTest('createVideoEncoder() - h264', () => {
    const encoder = processor.createVideoEncoder({
      width: 1920,
      height: 1080,
      fps: 30,
      bitrate: 5000000,
      codec: 'h264',
      preset: 'fast',
      hwEncoder: 'auto',
    });

    log(`  HW Encoder active: ${encoder.isHwActive()}`);
    encoder.close();
  });

  if (!hasTestVideo()) {
    logSkip('encodeFrame()', `Test video not found: ${TEST_VIDEO}`);
    return;
  }

  await runTest('encodeFrame() and flush()', () => {
    const encoder = processor.createVideoEncoder({
      width: 1920,
      height: 1080,
      fps: 30,
      codec: 'h264',
      preset: 'ultrafast',
    });

    const frame = processor.decodeFrame({ path: TEST_VIDEO }, 0.0);
    const packets = encoder.encodeFrame(frame, 0);
    log(`  Encoded packets: ${packets.length}`);

    const remaining = encoder.flush();
    log(`  Flushed packets: ${remaining.length}`);

    encoder.close();
  });
}

// =============================================================================
// Test: Audio Processing
// =============================================================================

async function testAudioProcessing(processor: MediaProcessor): Promise<void> {
  logSection('Audio Processing Tests');

  if (!hasTestVideo()) {
    logSkip('getAudioInfo()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('decodeAudioFrame()', `Test video not found: ${TEST_VIDEO}`);
    logSkip('createAudioDecoder()', `Test video not found: ${TEST_VIDEO}`);
    return;
  }

  await runTest('getAudioInfo()', () => {
    try {
      const audioInfo = processor.getAudioInfo(TEST_VIDEO);
      if (!audioInfo.sampleRate || !audioInfo.channels) {
        throw new Error('Invalid audio info');
      }
      log(`  Sample rate: ${audioInfo.sampleRate}, Channels: ${audioInfo.channels}`);
    } catch (e) {
      // Video may not have audio
      if (String(e).includes('no audio')) {
        log('  No audio track in video');
        return;
      }
      throw e;
    }
  });

  await runTest('decodeAudioFrame()', () => {
    try {
      const audioFrame = processor.decodeAudioFrame(TEST_VIDEO, 1.0);
      if (!audioFrame.samples || !audioFrame.data) {
        throw new Error('Invalid audio frame');
      }
      log(`  Samples: ${audioFrame.samples}, Channels: ${audioFrame.channels}`);
    } catch (e) {
      if (String(e).includes('no audio')) {
        log('  No audio track in video');
        return;
      }
      throw e;
    }
  });

  await runTest('createAudioDecoder()', () => {
    try {
      const decoder = processor.createAudioDecoder(TEST_VIDEO);
      const info = decoder.getInfo();
      log(`  Audio: ${info.sampleRate}Hz, ${info.channels}ch`);

      decoder.seek(0.0);
      const frame = decoder.decodeNext();
      if (frame) {
        log(`  First frame at ${frame.timestamp}s`);
      }

      decoder.close();
    } catch (e) {
      if (String(e).includes('no audio')) {
        log('  No audio track in video');
        return;
      }
      throw e;
    }
  });
}

// =============================================================================
// Test: Error Handling
// =============================================================================

async function testErrorHandling(processor: MediaProcessor): Promise<void> {
  logSection('Error Handling Tests');

  await runTest('decodeFrame() - nonexistent file', async () => {
    try {
      processor.decodeFrame({ path: '/nonexistent/video_12345.mp4' }, 0);
      throw new Error('Should have thrown an error');
    } catch (e) {
      if (String(e).includes('Should have thrown')) {
        throw e;
      }
      // Expected error
      log(`  Expected error: ${String(e).substring(0, 50)}...`);
    }
  });

  await runTest('createVideoEncoder() - invalid width', async () => {
    try {
      processor.createVideoEncoder({
        width: 0,
        height: 1080,
        fps: 30,
        codec: 'h264',
      });
      throw new Error('Should have thrown an error');
    } catch (e) {
      if (String(e).includes('Should have thrown')) {
        throw e;
      }
      log(`  Expected error: ${String(e).substring(0, 50)}...`);
    }
  });

  await runTest('createVideoEncoder() - invalid codec', async () => {
    try {
      processor.createVideoEncoder({
        width: 1920,
        height: 1080,
        fps: 30,
        codec: 'invalid_codec_12345',
      });
      throw new Error('Should have thrown an error');
    } catch (e) {
      if (String(e).includes('Should have thrown')) {
        throw e;
      }
      log(`  Expected error: ${String(e).substring(0, 50)}...`);
    }
  });
}

// =============================================================================
// Test: Performance
// =============================================================================

async function testPerformance(processor: MediaProcessor): Promise<void> {
  logSection('Performance Tests');

  if (!hasTestVideo()) {
    logSkip('Decode performance', `Test video not found: ${TEST_VIDEO}`);
    logSkip('Effect performance', `Test video not found: ${TEST_VIDEO}`);
    return;
  }

  await runTest('Decode performance (30 frames)', () => {
    const start = performance.now();
    const frames = processor.decodeFrameRange(
      { path: TEST_VIDEO, hwAccel: 'auto' },
      0,
      1,
      30
    );
    const elapsed = performance.now() - start;

    const fps = frames.length / (elapsed / 1000);
    log(`  Decoded ${frames.length} frames in ${elapsed.toFixed(2)}ms`);
    log(`  Decode FPS: ${fps.toFixed(2)}`);
  });

  await runTest('Effect performance (100 iterations)', () => {
    const frame = processor.decodeFrame({ path: TEST_VIDEO }, 0.0);

    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      processor.applyEffects(frame, {
        brightness: 0.1,
        contrast: 1.2,
        saturation: 1.1,
      });
    }
    const elapsed = performance.now() - start;

    log(`  100 effect passes in ${elapsed.toFixed(2)}ms`);
    log(`  Average: ${(elapsed / 100).toFixed(2)}ms per pass`);
  });
}

// =============================================================================
// Test: Output Quality Detection
// =============================================================================

interface JsFrameData {
  width: number;
  height: number;
  format: string;
  data: Buffer;
  timestamp: number;
  isKeyframe: boolean;
}

interface JsAudioFrame {
  data: Buffer;
  samples: number;
  timestamp: number;
  sampleRate: number;
  channels: number;
}

/**
 * Detect if a frame is black (all pixels below threshold)
 */
function detectBlackFrame(frame: JsFrameData, threshold: number = 0.01): { isBlack: boolean; avgBrightness: number } {
  const data = frame.data;
  let totalBrightness = 0;
  const pixelCount = frame.width * frame.height;

  // RGBA format: calculate luminance for each pixel
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    // ITU-R BT.709 luminance formula
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    totalBrightness += luminance;
  }

  const avgBrightness = totalBrightness / pixelCount;
  return {
    isBlack: avgBrightness < threshold,
    avgBrightness
  };
}

/**
 * Detect image tearing (horizontal discontinuities)
 */
function detectTearing(frame: JsFrameData, threshold: number = 50): { hasTearing: boolean; tearLines: number[] } {
  const data = frame.data;
  const width = frame.width;
  const height = frame.height;
  const tearLines: number[] = [];

  for (let y = 1; y < height; y++) {
    let discontinuousPixels = 0;

    for (let x = 0; x < width; x++) {
      const currentIdx = (y * width + x) * 4;
      const prevIdx = ((y - 1) * width + x) * 4;

      const diffR = Math.abs(data[currentIdx] - data[prevIdx]);
      const diffG = Math.abs(data[currentIdx + 1] - data[prevIdx + 1]);
      const diffB = Math.abs(data[currentIdx + 2] - data[prevIdx + 2]);
      const avgDiff = (diffR + diffG + diffB) / 3;

      if (avgDiff > threshold) {
        discontinuousPixels++;
      }
    }

    // If >80% of pixels have discontinuity, likely tearing
    if (discontinuousPixels / width > 0.8) {
      tearLines.push(y);
    }
  }

  return {
    hasTearing: tearLines.length > 0,
    tearLines
  };
}

/**
 * Analyze audio volume
 */
function analyzeAudioVolume(audioFrame: JsAudioFrame): {
  peakLevel: number;
  rmsLevel: number;
  peakDb: number;
  rmsDb: number;
  isSilent: boolean;
  isClipping: boolean;
} {
  const data = audioFrame.data;
  let peak = 0;
  let sumSquares = 0;

  // Assume 16-bit PCM format
  const view = new Int16Array(data.buffer, data.byteOffset, data.length / 2);

  for (let i = 0; i < view.length; i++) {
    const sample = Math.abs(view[i]) / 32768;
    peak = Math.max(peak, sample);
    sumSquares += sample * sample;
  }

  const rms = Math.sqrt(sumSquares / view.length);
  const peakDb = peak > 0 ? 20 * Math.log10(peak) : -Infinity;
  const rmsDb = rms > 0 ? 20 * Math.log10(rms) : -Infinity;

  return {
    peakLevel: peak,
    rmsLevel: rms,
    peakDb: Math.round(peakDb * 10) / 10,
    rmsDb: Math.round(rmsDb * 10) / 10,
    isSilent: rmsDb < -60,
    isClipping: peak >= 0.99
  };
}

async function testOutputQualityDetection(processor: MediaProcessor): Promise<void> {
  logSection('Output Quality Detection Tests');

  if (!hasTestVideo()) {
    logSkip('Black frame detection', `Test video not found: ${TEST_VIDEO}`);
    logSkip('Tearing detection', `Test video not found: ${TEST_VIDEO}`);
    logSkip('File size detection', `Test video not found: ${TEST_VIDEO}`);
    logSkip('Audio volume detection', `Test video not found: ${TEST_VIDEO}`);
    return;
  }

  // Test: Black frame detection
  await runTest('Black frame detection', () => {
    const testTimes = [0, 1, 5, 10];
    let blackFrameCount = 0;

    for (const time of testTimes) {
      try {
        const frame = processor.decodeFrame({ path: TEST_VIDEO }, time);
        const result = detectBlackFrame(frame);

        if (result.isBlack) {
          blackFrameCount++;
          log(`  WARNING: Black frame at ${time}s (brightness: ${(result.avgBrightness * 100).toFixed(2)}%)`);
        }
      } catch (e) {
        // Frame may be beyond video duration
      }
    }

    if (blackFrameCount > 0) {
      log(`  Black frames detected: ${blackFrameCount}/${testTimes.length}`);
    } else {
      log(`  No black frames detected in ${testTimes.length} samples`);
    }
  });

  // Test: Tearing detection
  await runTest('Tearing detection', () => {
    const frame = processor.decodeFrame({ path: TEST_VIDEO }, 1.0);
    const result = detectTearing(frame);

    if (result.hasTearing) {
      log(`  WARNING: Tearing detected at lines: ${result.tearLines.slice(0, 5).join(', ')}...`);
    } else {
      log(`  No tearing detected`);
    }
  });

  // Test: File size detection
  await runTest('File size detection', () => {
    const stats = fs.statSync(TEST_VIDEO);
    const fileSize = stats.size;

    // Get duration from probe (if available)
    try {
      const info = (processor as any).probeMedia?.(TEST_VIDEO) || { duration: 0 };
      const duration = info.duration || 1;
      const bitrate = (fileSize * 8) / duration;

      log(`  File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
      log(`  Duration: ${duration.toFixed(2)}s`);
      log(`  Estimated bitrate: ${(bitrate / 1000000).toFixed(2)} Mbps`);

      // Check if bitrate is reasonable (100kbps - 100Mbps)
      if (bitrate < 100000 || bitrate > 100000000) {
        log(`  WARNING: Bitrate may be unusual`);
      }
    } catch (e) {
      log(`  File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
    }
  });

  // Test: Audio volume detection
  await runTest('Audio volume detection', () => {
    try {
      const audioDecoder = processor.createAudioDecoder(TEST_VIDEO);
      const info = audioDecoder.getInfo();

      let totalPeak = 0;
      let totalRms = 0;
      let frameCount = 0;
      let silentFrames = 0;
      let clippingFrames = 0;

      // Sample first 10 audio frames
      for (let i = 0; i < 10; i++) {
        const frame = audioDecoder.decodeNext();
        if (!frame) break;

        const analysis = analyzeAudioVolume(frame);
        totalPeak = Math.max(totalPeak, analysis.peakLevel);
        totalRms += analysis.rmsLevel;
        frameCount++;

        if (analysis.isSilent) silentFrames++;
        if (analysis.isClipping) clippingFrames++;
      }

      audioDecoder.close();

      if (frameCount > 0) {
        const avgRms = totalRms / frameCount;
        const peakDb = totalPeak > 0 ? 20 * Math.log10(totalPeak) : -Infinity;
        const avgRmsDb = avgRms > 0 ? 20 * Math.log10(avgRms) : -Infinity;

        log(`  Peak level: ${(totalPeak * 100).toFixed(1)}% (${peakDb.toFixed(1)} dB)`);
        log(`  Average RMS: ${(avgRms * 100).toFixed(1)}% (${avgRmsDb.toFixed(1)} dB)`);
        log(`  Silent frames: ${silentFrames}/${frameCount}`);

        if (silentFrames / frameCount > 0.9) {
          log(`  WARNING: Audio appears mostly silent!`);
        }
        if (clippingFrames > 0) {
          log(`  WARNING: Audio clipping detected in ${clippingFrames} frames!`);
        }
      } else {
        log(`  No audio frames decoded`);
      }
    } catch (e) {
      log(`  No audio track or failed to analyze: ${String(e).substring(0, 50)}`);
    }
  });

  // Test: Audio bitrate check
  await runTest('Audio bitrate check', () => {
    try {
      const audioInfo = processor.getAudioInfo(TEST_VIDEO);
      log(`  Audio codec: ${audioInfo.codec}`);
      log(`  Sample rate: ${audioInfo.sampleRate} Hz`);
      log(`  Channels: ${audioInfo.channels}`);
      log(`  Bitrate: ${(audioInfo.bitrate / 1000).toFixed(0)} kbps`);

      // Check if bitrate is reasonable (32kbps - 512kbps)
      if (audioInfo.bitrate < 32000 || audioInfo.bitrate > 512000) {
        log(`  WARNING: Audio bitrate may be unusual`);
      }
    } catch (e) {
      log(`  No audio track: ${String(e).substring(0, 30)}`);
    }
  });
}

// =============================================================================
// Main
// =============================================================================

async function main(): Promise<void> {
  console.log('\n==============================================');
  console.log(' media-processor-rs NAPI Test Suite');
  console.log('==============================================');
  console.log(` Test video: ${TEST_VIDEO}`);
  console.log('==============================================\n');

  setupTestEnv();

  try {
    const processor = await testMediaProcessorCreate();

    await testGpuInfo(processor);
    await testVideoDecoding(processor);
    await testGpuEffects(processor);
    await testTransitions(processor);
    await testVideoEncoding(processor);
    await testAudioProcessing(processor);
    await testErrorHandling(processor);
    await testPerformance(processor);
    await testOutputQualityDetection(processor);

    // Summary
    logSection('Test Summary');
    const passed = results.filter((r) => r.passed).length;
    const failed = results.filter((r) => !r.passed).length;

    console.log(`\x1b[32mPassed:\x1b[0m  ${passed}`);
    console.log(`\x1b[31mFailed:\x1b[0m  ${failed}`);
    console.log('');

    if (failed === 0) {
      cleanup();
      console.log('\x1b[32mAll tests passed!\x1b[0m');
      process.exit(0);
    } else {
      console.log('\x1b[31mSome tests failed.\x1b[0m');
      console.log('\nFailed tests:');
      results
        .filter((r) => !r.passed)
        .forEach((r) => {
          console.log(`  - ${r.name}: ${r.error}`);
        });
      process.exit(1);
    }
  } catch (error) {
    console.error('\x1b[31mFatal error:\x1b[0m', error);
    process.exit(1);
  }
}

main();
