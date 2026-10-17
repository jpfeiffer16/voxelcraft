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
