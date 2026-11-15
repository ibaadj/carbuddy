/* Car Buddy senses — everything here uses features built into the browser (no libraries).
 *
 *   Senses.haptic.buzz(ms | [pattern])      vibration (Android; iPhones don't support it)
 *   Senses.haptic.setOn(bool) / isOn() / supported
 *
 *   const ears = Senses.createEars({ onHeard(text), onStatus(msg, kind) });
 *   ears.setMode("off" | "music" | "voice")  music: listens to loudness and "sings";  voice: speech → onHeard()
 *   ears.update(nowMs, dtSeconds) → { singing, open: 0..1, beat }     call every frame
 *   ears.fake(true)                          simulator: pretend music is playing
 *   (Android gives the microphone to one listener at a time, so it is music OR voice, not both.)
 *
 *   Senses.weather() → Promise<{ kind, label }>   kind: sunny | night | windy | rainy | stormy | snowy | null
 *       Uses the phone's location (rounded to ~1 km) and the free Open-Meteo service (no account or key).
 */
(function () {
  "use strict";
  const store = {
    get(k, d) { try { return localStorage.getItem(k) || d; } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
  };

  // ---------------------------------------------------------------- Haptics
  const canBuzz = typeof navigator.vibrate === "function";
  let buzzOn = store.get("carbuddy.buzz", "on") !== "off";
  const haptic = {
    supported: canBuzz,
    isOn: () => buzzOn,
    setOn(v) { buzzOn = !!v; store.set("carbuddy.buzz", buzzOn ? "on" : "off"); },
    buzz(p) { if (canBuzz && buzzOn) { try { navigator.vibrate(p); } catch (e) { /* ignore */ } } },
  };

  // ---------------------------------------------------------------- Ears (microphone)
  function createEars(cb) {
    cb = cb || {};
    const say = (m, k) => cb.onStatus && cb.onStatus(m, k);
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    let mode = "off", stream = null, actx = null, analyser = null, buf = null, src = null;
    let rec = null, recWanted = false, lastHeardAt = 0, faking = false;
    // loudness tracking
    let lv = 0, peak = 0.05, hot = 0, singing = false, open = 0, lastBeat = 0, avg = 0;
    let mins = [], bucketMin = Infinity, bucketAt = 0, started = false;

    async function startMusic() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("This browser has no microphone access.");
      // no echo cancelling / noise suppression: they are tuned for speech and squash music
      stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
      actx = new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") { try { await actx.resume(); } catch (e) { /* ignore */ } }
      src = actx.createMediaStreamSource(stream);
      const hp = actx.createBiquadFilter(); hp.type = "highpass"; hp.frequency.value = 180;      // ignore engine and road rumble
      analyser = actx.createAnalyser(); analyser.fftSize = 1024;
      buf = new Float32Array(analyser.fftSize);
      src.connect(hp); hp.connect(analyser);                                                        // never to the speakers
      started = false; hot = 0; singing = false;
    }
    function stopMusic() {
      if (stream) stream.getTracks().forEach((t) => t.stop());
      if (actx) { try { actx.close(); } catch (e) { /* ignore */ } }
      stream = actx = analyser = src = null; singing = false; hot = 0; open = 0;
    }

    function startVoice() {
      if (!SR) throw new Error("Voice commands need Chrome (not supported in this browser).");
      recWanted = true;
      rec = new SR();
      rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
      rec.onresult = (ev) => {
        let text = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) text += " " + ev.results[i][0].transcript;
        text = text.trim().toLowerCase();
        if (text && cb.onHeard) {
          const now = performance.now();
          if (cb.onHeard(text, now - lastHeardAt > 2500)) lastHeardAt = now;      // returns true when it acted
        }
      };
      rec.onerror = (ev) => {
        if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { recWanted = false; mode = "off"; say("Microphone not allowed — voice commands are off.", "warn"); if (cb.onMode) cb.onMode(mode); }
        else if (ev.error === "network") say("Voice commands need an internet connection.", "warn");
      };
      rec.onend = () => { if (recWanted) setTimeout(() => { if (recWanted) { try { rec.start(); } catch (e) { /* already started */ } } }, 500); };
      rec.start();
    }
    function stopVoice() { recWanted = false; if (rec) { try { rec.abort(); } catch (e) { /* ignore */ } } rec = null; }

    async function setMode(m) {
      stopMusic(); stopVoice(); faking = false;
      mode = m;
      try {
        if (m === "music") { await startMusic(); say("Listening for music — he'll sing along.", "ok"); }
        if (m === "voice") { startVoice(); say('Listening — try "roll over", "speak", "good boy", "dance", "go to sleep", "wake up".', "ok"); }
      } catch (e) {
        mode = "off";
        say(e && e.name === "NotAllowedError" ? "Microphone not allowed. Allow it in the browser's site settings." : (e && e.message) || "Couldn't start the microphone.", "warn");
      }
      if (cb.onMode) cb.onMode(mode);
      return mode;
    }

    function update(now, dt) {
      let level;
      if (faking) {                                        // a pretend song at 120 beats a minute
        const ph = (now / 500) % 1;
        level = 0.03 + 0.2 * Math.exp(-ph * 4) + 0.03 * Math.sin(now / 170);
      } else if (analyser) {
        analyser.getFloatTimeDomainData(buf);
        let s = 0; for (let i = 0; i < buf.length; i++) s += buf[i] * buf[i];
        level = Math.sqrt(s / buf.length);
      } else return { singing: false, open: 0, beat: false };

      if (!started) { started = true; lv = level; bucketAt = now; bucketMin = Infinity; mins = []; }   // start clean, or silence looks "loud"
      lv += (level - lv) * Math.min(1, dt / 0.05);
      // background level = the quietest moment of the last ~8 s (steady road noise raises it; music doesn't)
      bucketMin = Math.min(bucketMin, lv);
      if (now - bucketAt > 500) { mins.push(bucketMin); if (mins.length > 16) mins.shift(); bucketMin = Infinity; bucketAt = now; }
      const floor = mins.length ? Math.min.apply(null, mins) : Infinity;
      let loud = lv > floor * 1.8 + 0.008;
      if (window.Sfx && now - (window.Sfx.lastAt || -1e9) < 600) loud = false;    // don't sing along to his own noises
      hot = Math.max(0, Math.min(1.2, hot + (loud ? dt : -dt * 0.6)));
      if (!singing && hot > 0.35) singing = true; else if (singing && hot < 0.05) singing = false;

      peak = Math.max(peak * Math.exp(-dt / 6), lv, 0.03);
      const target = singing && isFinite(floor) ? Math.max(0, Math.min(1, (lv - floor) / Math.max(0.02, (peak - floor) * 0.8))) : 0;
      open += (target - open) * Math.min(1, dt / 0.06);

      avg += (lv - avg) * Math.min(1, dt / 0.4);
      const beat = singing && lv > avg * 1.25 && now - lastBeat > 240;
      if (beat) lastBeat = now;
      return { singing, open, beat };
    }

    return { setMode, update, mode: () => mode, voiceSupported: !!SR, fake(v) { faking = !!v; started = false; hot = 0; singing = false; }, isFaking: () => faking };
  }

  // ---------------------------------------------------------------- Weather
  function locate() {
    return new Promise((ok, fail) => {
      if (!navigator.geolocation) return fail(new Error("no location on this device"));
      navigator.geolocation.getCurrentPosition((p) => ok(p.coords), (e) => fail(new Error(e.code === 1 ? "location not allowed" : "couldn't find location")),
        { enableHighAccuracy: false, maximumAge: 30 * 60000, timeout: 20000 });
    });
  }
  function classify(c) {
    const code = c.weather_code, wind = c.wind_speed_10m || 0, gust = c.wind_gusts_10m || 0;
    const temp = c.temperature_2m == null ? "" : `, ${Math.round(c.temperature_2m)}°F`;
    let kind = null, name = "cloudy";
    if ((code >= 71 && code <= 77) || code === 85 || code === 86) { kind = "snowy"; name = "snowy"; }
    else if (code >= 95) { kind = "stormy"; name = "stormy"; }
    else if ((code >= 51 && code <= 67) || (code >= 80 && code <= 82)) { kind = "rainy"; name = "rainy"; }
    else if (wind >= 20 || gust >= 32) { kind = "windy"; name = "windy"; }
    else if (code <= 1) { kind = c.is_day ? "sunny" : "night"; name = c.is_day ? "sunny" : "clear night"; }
    else if (code === 45 || code === 48) name = "foggy";
    return { kind, label: name + temp };
  }
  async function weather() {
    const pos = await locate();
    const url = "https://api.open-meteo.com/v1/forecast?latitude=" + pos.latitude.toFixed(2) + "&longitude=" + pos.longitude.toFixed(2) +
      "&current=temperature_2m,weather_code,wind_speed_10m,wind_gusts_10m,is_day&temperature_unit=fahrenheit&wind_speed_unit=mph";
    const res = await fetch(url);
    if (!res.ok) throw new Error("weather service error");
    const data = await res.json();
    if (!data.current) throw new Error("weather service error");
    return classify(data.current);
  }

  window.Senses = { haptic, createEars, weather, classify, store };
})();
