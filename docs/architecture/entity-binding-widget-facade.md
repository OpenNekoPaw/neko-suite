# Entity Binding Widget Facade

`EntityBindingWidget` is a trigger protocol for creative tools. Canvas, Sketch, Model, Puppet, Story, Agent, Assets, Dashboard, Inspector, TreeView, and future overlays may render buttons or menus that create `EntityBindingWidgetTriggerRequest` payloads.

The trigger surface must not validate entity-global policy, write entity fact files, or own long-lived entity state. It sends the trigger to Extension Host code, and the host invokes typed `neko.entity.*` facade commands.

Quick Edit is limited to short entity-global fields such as canonical name, aliases, default binding, and short appearance summaries. Complex edits, relationship edits, merge/split workflows, long-form memory edits, and batch operations must route to Dashboard or another full editing surface.

Overlay components are optional UI containers. They may call the same facade commands, but removing an overlay must not remove Quick Edit capability.
