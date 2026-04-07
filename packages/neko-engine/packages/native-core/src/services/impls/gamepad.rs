//! GamepadService implementation via gilrs
//!
//! Enumerates gamepads and pushes events to a broadcast channel.

use crate::error::{Error, Result};
use crate::services::gamepad::{GamepadEvent, GamepadInfo, IGamepadService};
use gilrs::{Button, Gilrs};
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::broadcast;

struct ActiveGamepadStream {
    cancel: tokio_util::sync::CancellationToken,
}

pub struct GamepadService {
    streams: Mutex<HashMap<String, ActiveGamepadStream>>,
    senders: Mutex<HashMap<String, broadcast::Sender<GamepadEvent>>>,
}

impl GamepadService {
    pub fn new() -> Self {
        Self {
            streams: Mutex::new(HashMap::new()),
            senders: Mutex::new(HashMap::new()),
        }
    }

    /// Get a receiver for gamepad events (for WebSocket endpoint)
    pub fn subscribe(&self, stream_id: &str) -> Option<broadcast::Receiver<GamepadEvent>> {
        self.senders
            .lock()
            .ok()
            .and_then(|s| s.get(stream_id).map(|tx| tx.subscribe()))
    }
}

impl IGamepadService for GamepadService {
    fn list(&self) -> Vec<GamepadInfo> {
        match Gilrs::new() {
            Ok(gilrs) => gilrs
                .gamepads()
                .map(|(id, gp)| GamepadInfo {
                    id: format!("{}", id),
                    name: gp.name().to_string(),
                    connected: gp.is_connected(),
                })
                .collect(),
            Err(e) => {
                tracing::error!("Failed to initialize gilrs: {e}");
                Vec::new()
            }
        }
    }

    async fn connect(&self, gamepad_id: &str) -> Result<String> {
        let stream_id = format!("gamepad-{}-{}", gamepad_id, uuid::Uuid::new_v4());
        let (tx, _rx) = broadcast::channel::<GamepadEvent>(256);
        let tx_clone = tx.clone();
        let cancel = tokio_util::sync::CancellationToken::new();
        let cancel_clone = cancel.clone();
        let target_id = gamepad_id.to_string();

        // Spawn gamepad polling on a dedicated thread (gilrs is sync)
        std::thread::spawn(move || {
            let mut gilrs = match Gilrs::new() {
                Ok(g) => g,
                Err(e) => {
                    tracing::error!("Failed to init gilrs: {e}");
                    return;
                }
            };

            tracing::info!("Gamepad event loop started for {target_id}");

            while !cancel_clone.is_cancelled() {
                while let Some(gilrs::Event {
                    id, event, time, ..
                }) = gilrs.next_event()
                {
                    let gp_id = format!("{id}");
                    if gp_id != target_id {
                        continue;
                    }

                    let timestamp_us = time
                        .duration_since(std::time::SystemTime::UNIX_EPOCH)
                        .map(|d| d.as_micros() as i64)
                        .unwrap_or(0);

                    let (kind, button, axis, value) = match event {
                        gilrs::EventType::ButtonPressed(btn, _) => {
                            ("button_pressed", Some(format!("{btn:?}")), None, 1.0)
                        }
                        gilrs::EventType::ButtonReleased(btn, _) => {
                            ("button_released", Some(format!("{btn:?}")), None, 0.0)
                        }
                        gilrs::EventType::ButtonChanged(btn, val, _) => {
                            ("button_changed", Some(format!("{btn:?}")), None, val)
                        }
                        gilrs::EventType::AxisChanged(ax, val, _) => {
                            ("axis_changed", None, Some(format!("{ax:?}")), val)
                        }
                        gilrs::EventType::Connected => ("connected", None, None, 0.0),
                        gilrs::EventType::Disconnected => ("disconnected", None, None, 0.0),
                        _ => continue,
                    };

                    let event = GamepadEvent {
                        timestamp_us,
                        gamepad_id: gp_id,
                        kind: kind.to_string(),
                        button,
                        axis,
                        value,
                    };

                    let _ = tx_clone.send(event);
                }

                std::thread::sleep(std::time::Duration::from_millis(8)); // ~120Hz poll
            }

            tracing::info!("Gamepad event loop stopped for {target_id}");
        });

        self.streams
            .lock()
            .map_err(|_| Error::Other("Lock poisoned".to_string()))?
            .insert(stream_id.clone(), ActiveGamepadStream { cancel });

        self.senders
            .lock()
            .map_err(|_| Error::Other("Lock poisoned".to_string()))?
            .insert(stream_id.clone(), tx);

        Ok(stream_id)
    }

    async fn disconnect(&self, stream_id: &str) -> Result<()> {
        if let Some(s) = self
            .streams
            .lock()
            .map_err(|_| Error::Other("Lock poisoned".to_string()))?
            .remove(stream_id)
        {
            s.cancel.cancel();
        }

        self.senders
            .lock()
            .map_err(|_| Error::Other("Lock poisoned".to_string()))?
            .remove(stream_id);

        Ok(())
    }
}
