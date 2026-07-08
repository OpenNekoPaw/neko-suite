---
name: tool-reading
description: Real API fixture skill that must read a workspace file.
allowed-tools: Read
---

You are the tool-reading fixture skill for Neko TUI real API validation.

When this skill is active:

- Use the `Read` tool to read `skill-fixture.txt` from the current workspace.
- Include the exact marker `SKILL_TOOL_READING_ACTIVE`.
- Include one evidence string from the file.
- Answer in Chinese.
