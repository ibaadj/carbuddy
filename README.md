# Car Buddy

A motion-reactive dashboard face for an old phone. Open https://ibaadj.github.io/carbuddy/

- `/` — the face. **Car mode** uses the phone's sensors; **Simulator** works on any device (add `?sim` to the URL).
- `/sensors/` — the raw sensor test page (v3) for debugging and logging drives.
- `js/motion.js` — motion engine: calibrates to the car (saved on the phone and reused), smooths,
  detects accelerate / brake / turn / bump, and re-calibrates by itself if the phone is moved.
- `js/dog.js`, `js/dog-paths.js` — the dog, traced from Ibaad's own drawing (`art/`).
- `js/ascii.js` — live colored-ASCII renderer and the speed-bump crumble.
- `js/sfx.js` — sound effects synthesized with the Web Audio API (no audio files).
- `sim/drive2.csv` — a real drive used by the simulator's replay.

## What it does
- Head physics: leans in normal driving; slams into the screen edge on sharp turns, splats on the
  glass on hard braking, clonks the top on bumps, sinks into the seat when you floor it.
- Two styles (⋯ menu → Style): colored ASCII (default) or the drawing.
- Speed bump in ASCII style: every character falls into a pile, then flies back into the dog.
- Tap the nose: BOOP! Tap elsewhere: giggles or winks; poke it too much and it gets annoyed, then furious.
- Idle personality bits every 18–35 s (looks around, winks, hums, yawns…).
- Carsick after several turns in a row (green, woozy); sunglasses after 40 s of smooth cruising.
- Snoozes when parked (sooner at night); night mode (9pm–6am) dims the screen.

No third-party code. Character art © Ibaad Jiwani.
