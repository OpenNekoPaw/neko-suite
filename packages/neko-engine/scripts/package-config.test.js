'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('path');

const {
  NAPI_DIR,
  getSupportedTargets,
  getTargetConfig,
  resolveNodeBinaryPath,
} = require('./package-config');

test('package config resolves supported targets and ORT artifact names', () => {
  assert.deepEqual(getSupportedTargets(), ['darwin-arm64', 'darwin-x64', 'linux-x64', 'win32-x64']);

  assert.equal(getTargetConfig('darwin-arm64')?.ort.dest, 'libonnxruntime-darwin-arm64.1.20.1.dylib');
  assert.equal(getTargetConfig('linux-x64')?.ort.dest, 'libonnxruntime-linux-x64.so.1.20.1');
  assert.equal(getTargetConfig('win32-x64')?.ort.dest, 'onnxruntime-win-x64.dll');
});

test('package config resolves host-napi binary paths from the shared target map', () => {
  assert.equal(
    resolveNodeBinaryPath('darwin-arm64'),
    path.join(NAPI_DIR, 'neko-engine.darwin-arm64.node'),
  );
  assert.equal(
    resolveNodeBinaryPath('win32-x64'),
    path.join(NAPI_DIR, 'neko-engine.win32-x64-msvc.node'),
  );
});
