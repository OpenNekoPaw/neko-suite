#!/usr/bin/env node
/**
 * Simple Export Test
 *
 * Tests the native module export pipeline directly.
 * Run with: node packages/extension/src/mediaEngine/export/simpleExportTest.js
 */

const path = require('path');
const fs = require('fs');

// Paths
const PROJECT_DIR = path.resolve(__dirname, '../../../../../test');
const TEST_VIDEO = path.join(PROJECT_DIR, 'test.mp4');
const OUTPUT_VIDEO = path.join(PROJECT_DIR, 'output_simple_test.mp4');

async function main() {
	console.log('='.repeat(60));
	console.log('Simple Export Test - Native Module');
	console.log('='.repeat(60));
	console.log();

	// Check if test video exists
	if (!fs.existsSync(TEST_VIDEO)) {
		console.error(`❌ Test video not found: ${TEST_VIDEO}`);
		process.exit(1);
	}

	console.log(`📁 Input: ${TEST_VIDEO}`);
	console.log(`📤 Output: ${OUTPUT_VIDEO}`);
	console.log();

	try {
		// Load native module
		console.log('Step 1: Loading native module...');
		const nativeModule = require('@vedit/media-processor-rs');
		console.log('  ✓ Module loaded');

		// Create media processor
		console.log('Step 2: Creating MediaProcessor...');
		const processor = await nativeModule.MediaProcessor.create();
		console.log('  ✓ MediaProcessor created');

		// Get GPU info
		const gpuInfo = processor.getGpuInfo();
		console.log(`  GPU: ${gpuInfo.name} (${gpuInfo.vendor})`);
		console.log(`  Backend: ${gpuInfo.backend}`);

		// Create compositor
		console.log('Step 3: Creating CompositorSession...');
		const compositor = await nativeModule.CompositorSession.create();
		console.log('  ✓ CompositorSession created');

		// Test parameters
		const width = 1920;
		const height = 1080;
		const fps = 30;
		const duration = 2.0; // Just export 2 seconds for testing
		const totalFrames = Math.ceil(duration * fps);

		console.log();
		console.log(`Export config:`);
		console.log(`  Resolution: ${width}x${height}`);
		console.log(`  FPS: ${fps}`);
		console.log(`  Duration: ${duration}s`);
		console.log(`  Total frames: ${totalFrames}`);
		console.log();

		// Create muxer
		console.log('Step 4: Creating MuxerSession...');
		const muxer = nativeModule.MuxerSession.create({
			outputPath: OUTPUT_VIDEO,
			format: 'mp4',
		});
		console.log('  ✓ MuxerSession created');

		// Add video stream
		const streamInfo = muxer.addVideoStream({
			width: width,
			height: height,
			fps: fps,
			bitrate: 5000000,
			codec: 'h264',
			preset: 'fast',
			pixelFormat: 'rgba',
		});
		console.log(`  ✓ Video stream added (index: ${streamInfo.index})`);

		// Write header
		muxer.writeHeader();
		console.log('  ✓ Header written');

		// Create video encoder
		console.log('Step 5: Creating VideoEncoder...');
		const encoder = processor.createVideoEncoder({
			width: width,
			height: height,
			fps: fps,
			bitrate: 5000000,
			codec: 'h264',
			preset: 'fast',
			pixelFormat: 'rgba',
		});
		console.log('  ✓ VideoEncoder created');

		// Export frames
		console.log();
		console.log('Step 6: Exporting frames...');

		const startTime = Date.now();

		for (let frame = 0; frame < totalFrames; frame++) {
			const currentTime = frame / fps;

			// Decode frame from source video
			const frameData = processor.decodeFrame(
				{ path: TEST_VIDEO },
				currentTime
			);

			// Composite single layer (the decoded frame)
			const composited = compositor.composite(
				[{
					data: frameData.data,
					width: frameData.width,
					height: frameData.height,
					opacity: 1.0,
					zIndex: 0,
				}],
				width,
				height,
				[0, 0, 0, 1] // Black background
			);

			// Encode composited frame
			const packets = encoder.encodeFrame(
				{
					width: composited.width,
					height: composited.height,
					format: 'rgba',
					data: composited.data,
					timestamp: currentTime,
					isKeyframe: frame === 0,
				},
				frame
			);

			// Write packets
			for (const packet of packets) {
				muxer.writeVideoPacket({
					data: packet.data,
					pts: packet.pts,
					dts: packet.dts,
					duration: packet.duration,
					isKeyframe: packet.isKeyframe,
				});
			}

			// Progress
			const progress = ((frame + 1) / totalFrames * 100).toFixed(1);
			process.stdout.write(`\r  Frame ${frame + 1}/${totalFrames} (${progress}%)`);
		}

		console.log();

		// Flush encoder
		console.log('Step 7: Flushing encoder...');
		const flushPackets = encoder.flush();
		for (const packet of flushPackets) {
			muxer.writeVideoPacket({
				data: packet.data,
				pts: packet.pts,
				dts: packet.dts,
				duration: packet.duration,
				isKeyframe: packet.isKeyframe,
			});
		}
		encoder.close();
		console.log('  ✓ Encoder flushed and closed');

		// Finish muxer
		console.log('Step 8: Finishing muxer...');
		muxer.finish();
		console.log('  ✓ Muxer finished');

		// Report results
		const totalTime = Date.now() - startTime;
		const avgFrameTime = totalTime / totalFrames;

		console.log();
		console.log('='.repeat(60));
		console.log('Export Results');
		console.log('='.repeat(60));
		console.log(`✅ Export successful!`);
		console.log(`   Output: ${OUTPUT_VIDEO}`);
		console.log(`   Frames: ${totalFrames}`);
		console.log(`   Total time: ${(totalTime / 1000).toFixed(2)}s`);
		console.log(`   Avg frame time: ${avgFrameTime.toFixed(2)}ms`);
		console.log(`   FPS: ${(1000 / avgFrameTime).toFixed(1)}`);

		// Verify output
		if (fs.existsSync(OUTPUT_VIDEO)) {
			const stats = fs.statSync(OUTPUT_VIDEO);
			console.log(`   File size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
		}

		// Cleanup
		processor.dispose();

		console.log();
		console.log('Test completed successfully!');

	} catch (error) {
		console.error();
		console.error('❌ Test failed:');
		console.error(error);
		process.exit(1);
	}
}

main();
