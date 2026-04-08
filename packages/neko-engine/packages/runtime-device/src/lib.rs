//! runtime-device — Device input runtime for Neko Engine
//!
//! Provides concrete implementations for device services:
//! - Camera capture (cpal microphone input)
//! - MIDI input (midir)
//! - Gamepad input (gilrs)
//!
//! Service traits are defined in engine-kernel; this crate provides
//! the platform-specific implementations.

pub mod camera;
pub mod gamepad;
pub mod mic_capture;
pub mod midi;

pub use camera::CameraService;
pub use gamepad::GamepadService;
pub use mic_capture::MicCaptureService;
pub use midi::MidiService;
