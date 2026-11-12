# Car Buddy

A motion-reactive dashboard face for an old phone. Open https://ibaadj.github.io/carbuddy/

- `/` — the face. **Car mode** uses the phone's sensors; **Simulator** works on any device (add `?sim` to the URL).
- `/sensors/` — the raw sensor test page (v3) for debugging and logging drives.
- `js/motion.js` — motion engine: calibrates to the car, smooths, detects accelerate / brake / turn / bump.
- `sim/drive2.csv` — a real drive used by the simulator's replay.

Third-party: kaia-face.js 0.1.0 (Apache-2.0) and Fabric.js 1.7.22 (MIT), in `vendor/` with their licenses.
