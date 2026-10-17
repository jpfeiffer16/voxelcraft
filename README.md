# VoxelCraft

A single-player, Minecraft-style voxel sandbox that runs fully offline in the browser.
No server, no build step: just open `index.html` (double-click / file://).

Controls: mouse look · WASD move · Space jump/swim · Shift sprint (descend while flying) ·
F or double-tap Space toggles flying · Ctrl fast-fly · Left click break · Right click place ·
Middle click pick block · 1-9 / wheel hotbar · E block inventory · F3 debug HUD · Esc pause/settings.

World edits, player position, time of day and hotbar auto-save to localStorage.
Three.js r160 (MIT) is vendored in `vendor/`.

## Mobile / touch

On phones and tablets (auto-detected; force with `?mobile=1` / `?mobile=0`) the game shows touch controls:
left-thumb joystick to move, drag on the right to look, tap to place, long-press to break,
buttons for jump/fly-up, fly-down, fly toggle, sprint, break, place, a pause menu, a tilt-look toggle and a recenter button.
Tap a hotbar slot to select it; `⋯` opens the block menu.
Tilt look uses the gyroscope (DeviceOrientation). iOS asks for motion permission when you tap Play or "Enable tilt look",
and tilt turns on once you allow it. Tilt and touch-drag work together. Sensitivity sliders are in the pause menu.
Mobile defaults: render distance 4, pixel ratio 1.

## Torches, lighting & pets

- **Torches** go on floors or walls (place on the side of a block). Torches, lanterns, glowstone and jack o'lanterns
  give off real block light (flood fill, levels 0-15), built into the chunk meshes with a warm flicker. That light lights
  up caves and nights, and updates across chunk borders when you place or break blocks. Breaking the block a torch is
  attached to drops the torch.
- **Dogs & cats** (6 coats each) spawn on grass near you and wander around: they idle, walk, hop up 1 block and avoid
  water and big drops. Use a **spawn egg** from the block menu to place one.
  Right-click / tap an animal to tame it (it gets a collar and follows you); do it again to make it sit or follow.
  Left-click / long-press pets a tamed animal, or shoos a wild one away. Tamed and egg-spawned animals are saved with the world.
  Animal sounds can be turned off in the pause menu.
- More blocks: lantern, crafting table, pumpkin, jack o'lantern, 9 more wool colours, mossy cobblestone, hay bale,
  melon, terracotta, blue orchid, pink tulip, red mushroom (flowers can be placed on grass/dirt).
