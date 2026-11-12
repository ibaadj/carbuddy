# Car Buddy

A motion-reactive dashboard face for an old phone. Open https://ibaadj.github.io/carbuddy/

- `/` — the face. **Car mode** uses the phone's sensors; **Simulator** works on any device (add `?sim` to the URL).
- `/sensors/` — the raw sensor test page (v3) for debugging and logging drives.
- `js/motion.js` — motion engine: calibrates to the car (saved on the phone and reused), smooths,
  detects accelerate / brake / turn / bump, and re-calibrates by itself if the phone is moved.
- `js/sfx.js` — sound effects synthesized with the Web Audio API (no audio files).
- `sim/drive2.csv` — a real drive used by the simulator's replay.

## What it does
- Head physics: leans in normal driving; slams into the screen edge on sharp turns, splats on the
  glass on hard braking, clonks the top on bumps, sinks into the seat when you floor it.
- Tap the face: giggles or winks; poke it too much and it gets annoyed, then furious.
- Idle personality bits every 18–35 s (looks around, winks, hums, yawns…).
- Carsick after several turns in a row (green, woozy); sunglasses after 40 s of smooth cruising.
- Snoozes when parked (sooner at night); night mode (9pm–6am) dims the screen.

Third-party: kaia-face.js 0.1.0 (Apache-2.0) and Fabric.js 1.7.22 (MIT), in `vendor/` with their licenses.
