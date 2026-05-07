//! Device input binding service.
//!
//! This service is the engine-side boundary for mapping low-latency device
//! events to engine actions. TypeScript may configure bindings, but runtime
//! execution is expected to happen inside the engine process.

use crate::error::Result;
use serde::{Deserialize, Serialize};
use std::sync::{Arc, Mutex};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceBindingSource {
    MidiInput,
    Gamepad,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceInputMatcher {
    Midi {
        kind: String,
        channel: Option<u8>,
        data1: Option<u8>,
    },
    Gamepad {
        kind: String,
        control: String,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceActionBinding {
    pub id: String,
    pub source: DeviceBindingSource,
    pub device_id: Option<String>,
    pub matcher: DeviceInputMatcher,
    pub action_id: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum DeviceInputEvent {
    Midi {
        device_id: Option<String>,
        kind: String,
        channel: u8,
        data1: u8,
        data2: u8,
        status: u8,
    },
    Gamepad {
        device_id: String,
        kind: String,
        button: Option<String>,
        axis: Option<String>,
        value: f32,
    },
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceActionInvocation {
    pub binding_id: String,
    pub action_id: String,
    pub event: DeviceInputEvent,
}

pub trait IDeviceBindingService: Send + Sync {
    fn set_bindings(&self, bindings: Vec<DeviceActionBinding>) -> Result<()>;
    fn bindings(&self) -> Vec<DeviceActionBinding>;
    fn consume_event(&self, event: DeviceInputEvent) -> Result<Vec<DeviceActionInvocation>>;
}

#[derive(Debug, Clone, Default)]
pub struct DeviceBindingService {
    bindings: Arc<Mutex<Vec<DeviceActionBinding>>>,
}

impl DeviceBindingService {
    pub fn new() -> Self {
        Self::default()
    }
}

impl IDeviceBindingService for DeviceBindingService {
    fn set_bindings(&self, bindings: Vec<DeviceActionBinding>) -> Result<()> {
        let mut guard = self
            .bindings
            .lock()
            .map_err(|_| crate::error::Error::Other("device binding lock poisoned".to_string()))?;
        *guard = bindings;
        Ok(())
    }

    fn bindings(&self) -> Vec<DeviceActionBinding> {
        self.bindings
            .lock()
            .map(|bindings| bindings.clone())
            .unwrap_or_default()
    }

    fn consume_event(&self, event: DeviceInputEvent) -> Result<Vec<DeviceActionInvocation>> {
        let bindings = self.bindings();
        let invocations = bindings
            .into_iter()
            .filter(|binding| binding_matches_event(binding, &event))
            .map(|binding| DeviceActionInvocation {
                binding_id: binding.id,
                action_id: binding.action_id,
                event: event.clone(),
            })
            .collect();
        Ok(invocations)
    }
}

fn binding_matches_event(binding: &DeviceActionBinding, event: &DeviceInputEvent) -> bool {
    match (&binding.source, &binding.matcher, event) {
        (
            DeviceBindingSource::MidiInput,
            DeviceInputMatcher::Midi {
                kind,
                channel,
                data1,
            },
            DeviceInputEvent::Midi {
                device_id,
                kind: event_kind,
                channel: event_channel,
                data1: event_data1,
                ..
            },
        ) => {
            device_matches(binding.device_id.as_deref(), device_id.as_deref())
                && kind == event_kind
                && channel.is_none_or(|value| value == *event_channel)
                && data1.is_none_or(|value| value == *event_data1)
        }
        (
            DeviceBindingSource::Gamepad,
            DeviceInputMatcher::Gamepad { kind, control },
            DeviceInputEvent::Gamepad {
                device_id,
                kind: event_kind,
                button,
                axis,
                ..
            },
        ) => {
            device_matches(binding.device_id.as_deref(), Some(device_id.as_str()))
                && kind == event_kind
                && (button.as_deref() == Some(control.as_str())
                    || axis.as_deref() == Some(control.as_str()))
        }
        _ => false,
    }
}

fn device_matches(binding_device_id: Option<&str>, event_device_id: Option<&str>) -> bool {
    binding_device_id.is_none_or(|value| Some(value) == event_device_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn midi_binding_consumes_event_without_webview_roundtrip() {
        let service = DeviceBindingService::new();
        service
            .set_bindings(vec![DeviceActionBinding {
                id: "binding-midi-note".to_string(),
                source: DeviceBindingSource::MidiInput,
                device_id: Some("midi-1".to_string()),
                matcher: DeviceInputMatcher::Midi {
                    kind: "noteOn".to_string(),
                    channel: Some(1),
                    data1: Some(64),
                },
                action_id: "timeline.marker.add".to_string(),
            }])
            .unwrap();

        let invocations = service
            .consume_event(DeviceInputEvent::Midi {
                device_id: Some("midi-1".to_string()),
                kind: "noteOn".to_string(),
                channel: 1,
                data1: 64,
                data2: 127,
                status: 144,
            })
            .unwrap();

        assert_eq!(invocations.len(), 1);
        assert_eq!(invocations[0].action_id, "timeline.marker.add");
    }

    #[test]
    fn gamepad_binding_matches_button_control() {
        let service = DeviceBindingService::new();
        service
            .set_bindings(vec![DeviceActionBinding {
                id: "binding-gamepad-a".to_string(),
                source: DeviceBindingSource::Gamepad,
                device_id: None,
                matcher: DeviceInputMatcher::Gamepad {
                    kind: "button".to_string(),
                    control: "South".to_string(),
                },
                action_id: "scene.camera.reset".to_string(),
            }])
            .unwrap();

        let invocations = service
            .consume_event(DeviceInputEvent::Gamepad {
                device_id: "pad-1".to_string(),
                kind: "button".to_string(),
                button: Some("South".to_string()),
                axis: None,
                value: 1.0,
            })
            .unwrap();

        assert_eq!(invocations.len(), 1);
        assert_eq!(invocations[0].binding_id, "binding-gamepad-a");
    }

    #[test]
    fn unmatched_event_returns_no_invocations() {
        let service = DeviceBindingService::new();
        service
            .set_bindings(vec![DeviceActionBinding {
                id: "binding-midi-note".to_string(),
                source: DeviceBindingSource::MidiInput,
                device_id: Some("midi-1".to_string()),
                matcher: DeviceInputMatcher::Midi {
                    kind: "noteOn".to_string(),
                    channel: Some(1),
                    data1: Some(64),
                },
                action_id: "timeline.marker.add".to_string(),
            }])
            .unwrap();

        let invocations = service
            .consume_event(DeviceInputEvent::Midi {
                device_id: Some("midi-2".to_string()),
                kind: "noteOn".to_string(),
                channel: 1,
                data1: 64,
                data2: 127,
                status: 144,
            })
            .unwrap();

        assert!(invocations.is_empty());
    }
}
