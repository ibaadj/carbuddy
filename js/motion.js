/* Car Buddy motion engine
 * Turns phone sensor data (or simulated car data) into smoothed car-frame
 * values and discrete events. Same logic as sensor test v3.
 *
 *   const m = CarMotion.create({ onState, onStatus });
 *   m.startSensors()  m.calibrate()  m.relearnForward()      // real phone
 *   m.feed(fwd, lat, yawDegPerSec, vert)                     // simulator
 *
 * onState(s): { fwd, lat, yaw, event, ready, activity, heading }
 *   fwd: +accelerating / −braking (m/s²)   lat: +right / −left (m/s²)
 *   yaw: +left / −right (°/s)               event: cruising | ACCELERATING |
 *   BRAKING | TURNING LEFT | TURNING RIGHT | BUMP | learning
 */
(function () {
  "use strict";

  const TH = {
    accel: 0.9, accelStay: 0.4, brake: -1.0, brakeStay: -0.5, yaw: 8, yawStay: 4,
    headDeg: 10, headWin: 1.5, bumpV: 4.0, bumpH: 6.5, bumpMs: 800,
  };
  const ENTER_MS = 250, HOLD_MS = 600, TAU = 0.35, TAU_LEARN = 0.3, TAU_ACT = 2.0;
  const FWD_MIN = 0.8, FWD_SAMPLES = 30, TURN_MIN = 6, FLIP_EVIDENCE = 600;
  const G = 9.80665;

  const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
  const add = (a, b) => [a[0]+b[0], a[1]+b[1], a[2]+b[2]];
  const sub = (a, b) => [a[0]-b[0], a[1]-b[1], a[2]-b[2]];
  const scale = (a, k) => [a[0]*k, a[1]*k, a[2]*k];
  const len = (a) => Math.hypot(a[0], a[1], a[2]);
  const unit = (a) => { const l = len(a) || 1; return scale(a, 1 / l); };
  const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function create(opts) {
    const onState = opts.onState || function () {};
    const onStatus = opts.onStatus || function () {};

    let up = null, fwd = null, right = null;
    let calibrating = false, gravSamples = [];
    let hLearn = [0, 0, 0], fwdAccum = [0, 0, 0], fwdCount = 0;
    let turnEvidence = 0, dirChecked = false;
    let sm = { fwd: 0, lat: 0, yaw: 0 };
    let heading = 0, headHist = [], bumpUntil = 0, activity = 0;
    let current = "cruising", candidate = "cruising", candidateSince = 0, eventSince = 0;
    let lastT = 0, simMode = false, wakeLock = null, listening = false, gotEvents = false;

    function resetForward() {
      fwd = null; right = null; hLearn = [0, 0, 0]; fwdAccum = [0, 0, 0]; fwdCount = 0;
      turnEvidence = 0; dirChecked = false; sm.fwd = 0; sm.lat = 0;
      current = candidate = "cruising"; bumpUntil = 0;
    }

    // Core: smoothed values + events. fwdA/latA may be null while forward is unknown.
    function process(now, fwdA, latA, yaw, vert, hMag) {
      const dt = lastT ? clamp((now - lastT) / 1000, 0.001, 0.2) : 0.016;
      lastT = now;
      const k = 1 - Math.exp(-dt / TAU);

      sm.yaw += k * (yaw - sm.yaw);
      heading += yaw * dt;
      headHist.push([now, heading]);
      while (headHist.length && now - headHist[0][0] > TH.headWin * 1000) headHist.shift();
      activity += (1 - Math.exp(-dt / TAU_ACT)) * (hMag - activity);

      if (Math.abs(vert) > TH.bumpV || hMag > TH.bumpH) bumpUntil = now + TH.bumpMs;

      if (fwdA != null) {
        sm.fwd += k * (fwdA - sm.fwd);
        sm.lat += k * (latA - sm.lat);
        updateEvent(now);
      }
      emit();
    }

    function classify(v, prev, now) {
      if (now < bumpUntil) return "BUMP";
      if (v.fwd < TH.brake || (prev === "BRAKING" && v.fwd < TH.brakeStay)) return "BRAKING";
      if (v.fwd > TH.accel || (prev === "ACCELERATING" && v.fwd > TH.accelStay)) return "ACCELERATING";
      const dHead = headHist.length ? heading - headHist[0][1] : 0;
      if (v.yaw > TH.yaw || dHead > TH.headDeg || (prev === "TURNING LEFT" && v.yaw > TH.yawStay)) return "TURNING LEFT";
      if (v.yaw < -TH.yaw || dHead < -TH.headDeg || (prev === "TURNING RIGHT" && v.yaw < -TH.yawStay)) return "TURNING RIGHT";
      return "cruising";
    }

    function updateEvent(now) {
      const c = classify(sm, current, now);
      if (c === "BUMP" && current !== "BUMP") { current = candidate = "BUMP"; eventSince = candidateSince = now; return; }
      if (c !== candidate) { candidate = c; candidateSince = now; }
      if (candidate !== current && now - candidateSince >= ENTER_MS && now - eventSince >= HOLD_MS) {
        current = candidate; eventSince = now;
      }
    }

    function emit() {
      const ready = simMode || !!fwd;
      onState({ fwd: sm.fwd, lat: sm.lat, yaw: sm.yaw, event: ready ? current : "learning",
                ready, activity, heading, calibrated: simMode || !!up });
    }

    // ---- Real sensors -------------------------------------------------------
    function onMotion(e) {
      if (simMode) return;
      const ag = e.accelerationIncludingGravity || {};
      const a = e.acceleration;
      const r = e.rotationRate || {};
      if (ag.x == null && (!a || a.x == null)) {
        onStatus("Chrome is blocking sensor data. Open the https:// github.io address.", "warn");
        return;
      }
      gotEvents = true;
      const now = performance.now();
      const grav = [ag.x || 0, ag.y || 0, ag.z || 0];
      const lin = (a && a.x != null) ? [a.x || 0, a.y || 0, a.z || 0] : (up ? sub(grav, scale(up, G)) : [0, 0, 0]);
      const omega = [r.beta || 0, r.gamma || 0, r.alpha || 0];
      if (calibrating) gravSamples.push(grav);
      if (!up) return;

      const h = sub(lin, scale(up, dot(lin, up)));
      const yaw = dot(omega, up);
      const vert = dot(lin, up);

      if (!fwd) {
        process(now, null, null, yaw, vert, len(h));
        const kL = 1 - Math.exp(-0.016 / TAU_LEARN);
        hLearn = add(hLearn, scale(sub(h, hLearn), kL));
        if (len(hLearn) > FWD_MIN && Math.abs(sm.yaw) < TURN_MIN) { fwdAccum = add(fwdAccum, hLearn); fwdCount++; }
        if (fwdCount >= FWD_SAMPLES) {
          fwd = unit(fwdAccum); right = cross(fwd, up);
          onStatus("Ready — forward learned.", "ok");
        }
        return;
      }

      process(now, dot(h, fwd), dot(h, right), yaw, vert, len(h));

      if (Math.abs(sm.yaw) > TURN_MIN) {
        turnEvidence += sm.yaw * sm.lat;
        if (turnEvidence > FLIP_EVIDENCE) {
          fwd = scale(fwd, -1); right = scale(right, -1);
          sm.fwd = -sm.fwd; sm.lat = -sm.lat; turnEvidence = 0; dirChecked = true;
          onStatus("Forward was backwards — fixed automatically.", "ok");
        } else if (turnEvidence < -FLIP_EVIDENCE && !dirChecked) {
          dirChecked = true; onStatus("Direction confirmed.", "ok");
        }
      }
    }

    async function requestWakeLock() {
      try {
        if ("wakeLock" in navigator) {
          wakeLock = await navigator.wakeLock.request("screen");
          wakeLock.addEventListener("release", () => { wakeLock = null; });
        }
      } catch (err) { /* optional */ }
    }
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible" && !wakeLock && listening) requestWakeLock();
    });

    async function startSensors() {
      if (!window.isSecureContext) { onStatus("Needs the https:// address for sensors.", "warn"); return false; }
      if (typeof DeviceMotionEvent === "undefined") { onStatus("No motion sensors in this browser.", "warn"); return false; }
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        try { if (await DeviceMotionEvent.requestPermission() !== "granted") { onStatus("Motion permission denied.", "warn"); return false; } }
        catch (err) { onStatus("Motion permission error.", "warn"); return false; }
      }
      simMode = false;
      if (!listening) { window.addEventListener("devicemotion", onMotion); listening = true; }
      await requestWakeLock();
      setTimeout(() => { if (!gotEvents) onStatus("No sensor data. Check Chrome site settings → Motion sensors.", "warn"); }, 2000);
      onStatus("Sensors on. Park facing forward, then tap Calibrate.");
      return true;
    }

    function calibrate() {
      gravSamples = []; calibrating = true; up = null; resetForward(); sm.yaw = 0;
      onStatus("Calibrating — hold still…");
      setTimeout(() => {
        calibrating = false;
        if (gravSamples.length < 10) { onStatus("Not enough sensor data — try again.", "warn"); return; }
        up = unit(scale(gravSamples.reduce(add, [0, 0, 0]), 1 / gravSamples.length));
        onStatus("Calibrated. Just drive — forward is learned on your first pull-away.", "ok");
      }, 1500);
    }

    function relearnForward() { resetForward(); onStatus("Re-learning forward — pull away in a straight line."); }

    // ---- Simulator ----------------------------------------------------------
    // tMs: optional timestamp (ms) — the replay passes the log's own clock
    function feed(fwdA, latA, yaw, vert, tMs) {
      simMode = true;
      const hMag = Math.hypot(fwdA, latA);
      process(tMs != null ? tMs : performance.now(), fwdA, latA, yaw, vert || 0, hMag);
    }
    function resetSim() {
      sm = { fwd: 0, lat: 0, yaw: 0 }; current = candidate = "cruising"; headHist = [];
      bumpUntil = 0; activity = 0; lastT = 0; candidateSince = eventSince = 0; heading = 0;
    }

    return { startSensors, calibrate, relearnForward, feed, resetSim,
             hasWakeLock: () => !!wakeLock, isSim: () => simMode, TH };
  }

  window.CarMotion = { create };
})();
