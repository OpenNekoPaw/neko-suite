//! MidiService implementation via midir
//!
//! Enumerates MIDI input ports and connects to receive events.
//! Events are pushed to a broadcast channel for WebSocket delivery.

use crate::error::{Error, Result};
use crate::services::midi::{IMidiService, MidiEvent, MidiPort};
use midir::MidiInput;
use std::collections::HashMap;
use std::sync::Mutex;
use tokio::sync::broadcast;

struct ActiveMidiConnection {
    // midir::MidiInputConnection is !Send, so we store it in its own thread
    // and signal stop via a flag
    _name: String,
    cancel: tokio_util::sync::CancellationToken,
}

pub struct MidiService {
    connections: Mutex<HashMap<String, ActiveMidiConnection>>,
    /// Broadcast senders for MIDI events, keyed by stream_id
    senders: Mutex<HashMap<String, broadcast::Sender<MidiEvent>>>,
}

impl Default for MidiService {
    fn default() -> Self {
        Self::new()
    }
}

impl MidiService {
    pub fn new() -> Self {
        Self {
            connections: Mutex::new(HashMap::new()),
            senders: Mutex::new(HashMap::new()),
        }
    }

    /// Get a receiver for MIDI events (for WebSocket endpoint)
    pub fn subscribe(&self, stream_id: &str) -> Option<broadcast::Receiver<MidiEvent>> {
        self.senders
            .lock()
            .ok()
            .and_then(|s| s.get(stream_id).map(|tx| tx.subscribe()))
    }
}

impl IMidiService for MidiService {
    fn list_ports(&self) -> Vec<MidiPort> {
        let midi_in = match MidiInput::new("neko-midi-list") {
            Ok(m) => m,
            Err(e) => {
                tracing::error!("Failed to create MIDI input: {e}");
                return Vec::new();
            }
        };

        midi_in
            .ports()
            .iter()
            .enumerate()
            .map(|(i, port)| {
                let name = midi_in
                    .port_name(port)
                    .unwrap_or_else(|_| format!("Port {i}"));
                MidiPort {
                    id: format!("{i}"),
                    name,
                }
            })
            .collect()
    }

    async fn connect(&self, port_id: &str) -> Result<String> {
        let port_index: usize = port_id
            .parse()
            .map_err(|_| Error::Other(format!("Invalid port ID: {port_id}")))?;

        let stream_id = format!("midi-{}-{}", port_id, uuid::Uuid::new_v4());
        let (tx, _rx) = broadcast::channel::<MidiEvent>(256);

        let tx_clone = tx.clone();
        let cancel = tokio_util::sync::CancellationToken::new();
        let cancel_clone = cancel.clone();
        let stream_id_clone = stream_id.clone();

        // Spawn MIDI connection on a dedicated thread (midir callback is sync)
        std::thread::spawn(move || {
            let midi_in = match MidiInput::new("neko-midi") {
                Ok(m) => m,
                Err(e) => {
                    tracing::error!("Failed to create MIDI input: {e}");
                    return;
                }
            };

            let ports = midi_in.ports();
            let port = match ports.get(port_index) {
                Some(p) => p,
                None => {
                    tracing::error!("MIDI port {port_index} not found");
                    return;
                }
            };

            let port_name = midi_in
                .port_name(port)
                .unwrap_or_else(|_| format!("Port {port_index}"));

            tracing::info!("Connecting to MIDI port: {port_name}");

            let _connection = match midi_in.connect(
                port,
                &stream_id_clone,
                move |timestamp_us, message, _| {
                    if message.len() >= 3 {
                        let status = message[0];
                        let kind = match status & 0xF0 {
                            0x80 => "note_off",
                            0x90 => {
                                if message[2] == 0 {
                                    "note_off"
                                } else {
                                    "note_on"
                                }
                            }
                            0xA0 => "aftertouch",
                            0xB0 => "control_change",
                            0xC0 => "program_change",
                            0xD0 => "channel_pressure",
                            0xE0 => "pitch_bend",
                            _ => "unknown",
                        };

                        let event = MidiEvent {
                            timestamp_us: timestamp_us as i64,
                            kind: kind.to_string(),
                            channel: status & 0x0F,
                            data1: message[1],
                            data2: if message.len() > 2 { message[2] } else { 0 },
                            status,
                        };

                        let _ = tx_clone.send(event);
                    }
                },
                (),
            ) {
                Ok(conn) => conn,
                Err(e) => {
                    tracing::error!("Failed to connect to MIDI port: {e}");
                    return;
                }
            };

            // Keep connection alive until cancelled
            while !cancel_clone.is_cancelled() {
                std::thread::sleep(std::time::Duration::from_millis(100));
            }

            tracing::info!("MIDI connection closed: {port_name}");
            // _connection is dropped here, closing the MIDI port
        });

        // Store connection and sender
        self.connections
            .lock()
            .map_err(|_| Error::Other("Lock poisoned".to_string()))?
            .insert(
                stream_id.clone(),
                ActiveMidiConnection {
                    _name: port_id.to_string(),
                    cancel,
                },
            );

        self.senders
            .lock()
            .map_err(|_| Error::Other("Lock poisoned".to_string()))?
            .insert(stream_id.clone(), tx);

        Ok(stream_id)
    }

    async fn disconnect(&self, stream_id: &str) -> Result<()> {
        let conn = self
            .connections
            .lock()
            .map_err(|_| Error::Other("Lock poisoned".to_string()))?
            .remove(stream_id);

        if let Some(conn) = conn {
            conn.cancel.cancel();
        }

        self.senders
            .lock()
            .map_err(|_| Error::Other("Lock poisoned".to_string()))?
            .remove(stream_id);

        Ok(())
    }
}
