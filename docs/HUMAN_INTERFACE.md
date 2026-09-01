# Human interface

Version 0.4 — Adaptive Human Interface.

> The machine is the primary navigation surface.
> The default interface is driven by human intent and selected engineering context.
> Complexity must be available without being permanently visible.

Forward-human: advanced, not complicated.

## Principles

Object first. Intent first. Contextual controls. Progressive disclosure. Spatial directness. Visible system state. Reversibility. Explainability. Minimal mode confusion. Consistent interaction.

## Interaction levels

1. Direct: pointer, tree, sliders, Escape to deselect.
2. Contextual: FOCUS / ISOLATE / EXPLODE / TRACK / ASK on the ribbon and object HUD.
3. Language: Agent HUD + Ctrl+K palette.

Language does not replace CAD interaction.

## Orientation

HOME · FIT · SEL · ← VIEW (camera history) · RESTORE · SPATIAL UNDO · compact XYZ.

The operator must never be trapped by automation.

## Inspector

SUMMARY by default. ENGINEERING / PROVENANCE / GRAPH on demand.

Human-readable name is primary. Semantic id is secondary.

## Color grammar

Gold is human control (DESIGN, ASSEMBLE, EXPLODE, FOCUS, HOME, FIT). Lavender is ARCHEON intelligence (agent names, PROPOSAL / PLAN / ACTIVITY, GENERATED / DERIVED, semantic IDs, ASK ARCHEON). White is engineering fact. Gray is secondary. Green is validated. Amber is assumed / not run. Red is invalid.

Lavender should stay rare: when it appears, the operator knows ARCHEON itself is involved.

## Truth language

Known / Derived / Assumed / Preview / Exact / Simulation — never interchangeable.

Collision is **NOT CHECKED** unless an OCCT Boolean ran. Graph validation is not FEA.

## Accessibility

Keyboard: Escape deselect, Ctrl+K palette. Status uses text + color. `prefers-reduced-motion` disables HUD morph. Desktop-first; narrow viewports hide side rails rather than crash.
