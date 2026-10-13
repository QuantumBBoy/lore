---
name: kin-spike
description: Storage test for the Kin project. Use only when the user says spike write or spike read.
metadata:
  homepage: https://github.com/QuantumBBoy/lore
---

# Kin storage spike

Checks that data saved on this phone survives closing the app.

## Instructions

Call the `run_js` tool with:
- script name: index.html
- data: a JSON string with these fields:
  - action: "write" or "read"
  - value: String. Only for "write". The text after "spike write".

Examples:
- "spike write hello" → {"action": "write", "value": "hello"}
- "spike read" → {"action": "read"}

After the tool returns, repeat its result to the user word for word. Add nothing.
