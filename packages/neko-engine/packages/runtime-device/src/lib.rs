//! runtime-device — Device input runtime for Neko Engine
//!
//! Provides concrete implementations for device services:
//! - Camera capture (cpal microphone input)
//! - MIDI input (midir)
//! - Gamepad input (gilrs)
//!
//! Service traits and DTOs are owned here so the runtime can be compiled
//! and tested without engine-kernel orchestration.

pub mod camera;
pub mod camera_contracts;
pub mod error;
pub mod gamepad;
pub mod gamepad_contracts;
pub mod mic_capture;
pub mod midi;
pub mod midi_contracts;

#[cfg(test)]
mod architecture_tests;

pub use camera::CameraService;
pub use camera_contracts::{CameraCaptureConfig, CameraDevice, ICameraService};
pub use error::{DeviceError, DeviceResult, Error, Result};
pub use gamepad::GamepadService;
pub use gamepad_contracts::{GamepadEvent, GamepadInfo, IGamepadService};
pub use mic_capture::MicCaptureService;
pub use midi::MidiService;
pub use midi_contracts::{IMidiService, MidiEvent, MidiPort};
