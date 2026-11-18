# Car Buddy

A motion-reactive dashboard face for an old phone. Open https://ibaadj.github.io/carbuddy/

- `/` — the face. **Car mode** uses the phone's sensors; **Simulator** works on any device (add `?sim` to the URL).
- `/tank/` — **Fish tank**: a procedurally generated aquarium, drawn at full screen resolution. Smooth driving fills a calm
  meter that brings new creatures (fish, pufferfish, snail, crab, shrimp, seahorse, jellyfish, octopus; 8% are shiny), and a
  long smooth streak throws a dance party (heart, conga line, spin). Gentle turns: "wheee!"; lots of turns: dizzy eyes;
  bumps: "boing!". Harsh driving sends everyone hiding — puffers puff up, the octopus inks, crabs dig in, snails say nope.
  Nobody is ever lost. Visitors drop by (turtle, whale, submarine). A rubber duck rides the slosh, a treasure chest burps
  bubbles, and every tank has a surprise prop (sunken car, diver's helmet, castle, anchor). Biome changes daily (reef,
  kelp, arctic in winter) and turns to deep sea at night; fish nap when you're parked. Tap a creature to say hi, tap the
  water to feed, tap the duck or the chest. `?sim` for the simulator.
- `js/tank.js` — the tank: scene generation, creatures (fish use boids flocking), driving reactions, saved on the phone.
- `/sensors/` — the raw sensor test page (v3) for debugging and logging drives.
- `js/motion.js` — motion engine: calibrates to the car (saved on the phone and reused), smooths,
  detects accelerate / brake / turn / bump, and re-calibrates by itself if the phone is moved.
- `js/dog.js`, `js/dog-paths.js` — the dog, traced from Ibaad's own drawing (`art/`).
- `js/buddies.js` — all the buddies (dog, ghost, Santa, sasquatch, dumpling, radish, jellyfish), shared eyes/mouths, the Santa hat.
- `js/ascii.js` — live colored-ASCII renderer and the speed-bump crumble.
- `js/water.js` — the jellyfish's tank: water that sloshes with turns, surges on braking and splashes on bumps.
- `js/sky.js` — weather, Christmas lights, floating notes and hearts (all drawn as text characters).
- `js/senses.js` — vibration, microphone (sing-along and voice commands), and weather lookup.
- `js/sfx.js` — sound effects synthesized with the Web Audio API (no audio files).
- `sim/drive2.csv` — a real drive used by the simulator's replay.
- `sw.js`, `manifest.webmanifest` — works offline after the first visit; "Add to Home screen" for a full-screen app.

## What it does
- Head physics: leans in normal driving; slams into the screen edge on sharp turns, splats on the
  glass on hard braking, clonks the top on bumps, sinks into the seat when you floor it.
- Two styles (⋯ menu → Style): colored ASCII (default) or the drawing.
- Speed bump in ASCII style: every character falls into a pile, then flies back into the dog.
- Tap the nose: BOOP! Tap elsewhere: giggles or winks; poke it too much and it gets annoyed, then furious.
- Idle personality bits every 18–35 s (looks around, winks, hums, yawns…).
- Carsick after several turns in a row (green, woozy); sunglasses after 40 s of smooth cruising.
- Snoozes when parked (sooner at night); night mode (9pm–6am) dims the screen.
- Scratch: rub a finger on him — he leans in, hearts float up, the phone buzzes, and his leg thumps after a few seconds.
- Ears (⋯ menu): **music** — he sings along to what the microphone hears; **voice** — "roll over", "speak",
  "good boy", "dance", "go to sleep", "wake up". One or the other (Android shares the mic with one listener at a time).
- Weather (⋯ menu): auto uses the phone's location (rounded to ~1 km) and the free Open-Meteo service to show
  sun, clear night, wind, rain, storm or snow. Or pick one by hand.
- Santa hat and a string of lights from Nov 25 through December (or force on/off in the menu).
- Buzz: vibration on taps, boops, scratches and crashes (Android only).

No third-party code or libraries. Voice commands use Chrome's built-in speech recognition (needs internet). Character art © Ibaad Jiwani.
