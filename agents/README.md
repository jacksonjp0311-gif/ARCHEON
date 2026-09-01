# Agent cards

Each folder holds the **operating contract** for one agent: role, tools, allowed DTP operations, authority. Runtime copies live in `archeon-agents::roster()`. These JSON files are the human-readable source.

Agents never bypass DTP. Memory curator cannot mutate DesignIR. Spatial director is view-only.
