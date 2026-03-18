//! MIDI service trait

use crate::error::Result;
use serde::Serialize;

/// MIDI port info
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiPort {
    pub id: String,
    pub name: String,
}

/// MIDI event (pushed via WebSocket JSON)
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MidiEvent {
    pub timestamp_us: i64,
    pub kind: String,
    pub channel: u8,
    pub data1: u8,
    pub data2: u8,
    pub status: u8,
}

/// MIDI service interface
#[allow(async_fn_in_trait)]
pub trait IMidiService: Send + Sync {
    /// List available MIDI input ports
    fn list_ports(&self) -> Vec<MidiPort>;

    /// Connect to a MIDI port, returns stream ID for WebSocket subscription
    async fn connect(&self, port_id: &str) -> Result<String>;

    /// Disconnect from a MIDI port
    async fn disconnect(&self, stream_id: &str) -> Result<()>;
}
