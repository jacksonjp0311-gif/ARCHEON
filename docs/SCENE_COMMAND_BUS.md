# Scene Command Bus

Agents do not animate frames. They issue semantic commands. The scene engine interpolates.

```text
focus_entity
focus_assembly
explode_entity
explode_system
set_explosion
set_explosion_spread
ghost_others
restore_display
show_overlay / hide_overlay
fit_scene / fit_selection
align_camera
track_entity / untrack_entity
clear_selection
select_entity
isolate_entity
compare_variants
select_variant
previous_view
home_view
show_affected
```

`applySceneCommand` is pure and deterministic. Tests live in `apps/workstation/src/explosion.test.ts`.

`duration_ms` is accepted on focus commands as a hint. The camera rig uses a critically damped lerp (~0.55 s) and then **releases** OrbitControls. Reduced-motion: HUD morph is disabled via CSS.

Spatial restore (`restore_display`, SPATIAL UNDO) is **VIEW UNDO**. Design rollback remains DTP reject / revision.
