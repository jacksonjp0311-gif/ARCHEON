# Agent workspace

## Layers

| Layer | Draw |
|---|---|
| CANONICAL | PBR materials |
| OPERATOR | selection edges, isolate, ghost |
| AGENT_PROPOSAL | orange transparent / wire PREVIEW |
| ANALYSIS | section clip, overlays |
| SPATIAL_OVERLAY | interfaces, explode lines, labels |

Proposal geometry is never presented as exact CAD.

## HUD

`[◈ ARCHEON]` morphs into a draggable instrument (sessionStorage `archeon.agentHud.v1`). Context, PROPOSAL ACTIVE, CAD DESIGNER ● WORKING, and `!` when a decision is waiting.

STOP cancels the live session and drops the proposal. Canonical DesignIR unchanged.

Local parser is deterministic (no API key). The LLM adapter is optional and **cannot mutate DesignIR**.

## Cards

Structured replies: what happened, why, what changed, what needs attention, 1–3 next actions. No chain-of-thought.

Agent states in this build: IDLE / WORKING / PROPOSING. WAITING / VALIDATING / BLOCKED appear on **LiveDesignSession steps**, not as a full multi-agent runtime.
