//! Host-api permission audit for native plugins.
//!
//! This is a traceability mechanism for calls made through engine host APIs. It
//! deliberately does not claim syscall-level enforcement for in-process native
//! code.

use super::governance::{now_unix_millis, NATIVE_SYSCALL_AUDIT_BOUNDARY_NOTE};
use super::manifest::{EnginePluginManifest, PluginKind};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

pub const PERMISSION_SYSTEM_INFO: &str = "system-info";

/// Optional watermark/session context attached to audit reports.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct PluginAuditContext {
    pub purchaser_id: Option<String>,
    pub session_id: Option<String>,
    pub watermark_id: Option<String>,
}

/// Host-api permission audit event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginPermissionAuditEvent {
    pub plugin_id: String,
    pub action: String,
    pub permission: String,
    pub declared: bool,
    pub timestamp: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub purchaser_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub session_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub watermark_id: Option<String>,
    pub boundary_note: String,
}

/// Activation lifecycle audit event.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PluginLifecycleAuditEvent {
    pub plugin_id: String,
    pub plugin_kind: PluginKind,
    pub action: String,
    pub outcome: String,
    pub message: String,
    pub timestamp: u64,
    pub boundary_note: String,
}

/// Reporting adapter for undeclared host-api permission usage.
pub trait PluginAuditReporter: Send + Sync {
    fn report_permission_violation(&self, event: &PluginPermissionAuditEvent);
}

#[derive(Default)]
pub struct NoopPluginAuditReporter;

impl PluginAuditReporter for NoopPluginAuditReporter {
    fn report_permission_violation(&self, _event: &PluginPermissionAuditEvent) {}
}

pub struct PluginAuditor {
    events: Mutex<Vec<PluginPermissionAuditEvent>>,
    lifecycle_events: Mutex<Vec<PluginLifecycleAuditEvent>>,
    reporter: Box<dyn PluginAuditReporter>,
}

impl PluginAuditor {
    pub fn new() -> Self {
        Self {
            events: Mutex::new(Vec::new()),
            lifecycle_events: Mutex::new(Vec::new()),
            reporter: Box::new(NoopPluginAuditReporter),
        }
    }

    pub fn with_reporter(reporter: Box<dyn PluginAuditReporter>) -> Self {
        Self {
            events: Mutex::new(Vec::new()),
            lifecycle_events: Mutex::new(Vec::new()),
            reporter,
        }
    }

    pub fn record_host_api_call(
        &self,
        manifest: &EnginePluginManifest,
        action: impl Into<String>,
        permission: impl Into<String>,
        context: Option<PluginAuditContext>,
    ) -> PluginPermissionAuditEvent {
        let permission = permission.into();
        let context = context.unwrap_or_default();
        let event = PluginPermissionAuditEvent {
            plugin_id: manifest.id.clone(),
            action: action.into(),
            declared: manifest
                .permissions
                .iter()
                .any(|declared| declared == &permission),
            permission,
            timestamp: now_unix_millis(),
            purchaser_id: context.purchaser_id,
            session_id: context.session_id,
            watermark_id: context.watermark_id,
            boundary_note: NATIVE_SYSCALL_AUDIT_BOUNDARY_NOTE.to_string(),
        };

        if !event.declared {
            self.reporter.report_permission_violation(&event);
        }

        let mut events = self.events.lock().unwrap_or_else(|e| e.into_inner());
        events.push(event.clone());
        event
    }

    pub fn events(&self) -> Vec<PluginPermissionAuditEvent> {
        let events = self.events.lock().unwrap_or_else(|e| e.into_inner());
        events.clone()
    }

    pub fn record_lifecycle_event(
        &self,
        plugin_id: impl Into<String>,
        plugin_kind: PluginKind,
        action: impl Into<String>,
        outcome: impl Into<String>,
        message: impl Into<String>,
    ) -> PluginLifecycleAuditEvent {
        let event = PluginLifecycleAuditEvent {
            plugin_id: plugin_id.into(),
            plugin_kind,
            action: action.into(),
            outcome: outcome.into(),
            message: message.into(),
            timestamp: now_unix_millis(),
            boundary_note: NATIVE_SYSCALL_AUDIT_BOUNDARY_NOTE.to_string(),
        };

        let mut events = self
            .lifecycle_events
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        events.push(event.clone());
        event
    }

    pub fn lifecycle_events(&self) -> Vec<PluginLifecycleAuditEvent> {
        let events = self
            .lifecycle_events
            .lock()
            .unwrap_or_else(|e| e.into_inner());
        events.clone()
    }
}

impl Default for PluginAuditor {
    fn default() -> Self {
        Self::new()
    }
}
