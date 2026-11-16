"""Tiny genre-flavoured music bed synthesized with numpy + the wave module (no assets)."""
import math
import wave

import numpy as np

SR = 44100

GENRES = {
    "heist": dict(bpm=104, root=45, scale=[0, 3, 5, 7, 10], wave="square", swing=0.12, bass=[0, 0, 3, 5, 7, 5, 3, -2]),
    "zombie": dict(bpm=84, root=38, scale=[0, 1, 5, 6, 8], wave="saw", swing=0.0, bass=[0, 0, 1, 0, 6, 5, 1, 0]),
    "space": dict(bpm=112, root=48, scale=[0, 2, 4, 7, 9, 11], wave="sine", swing=0.0, bass=[0, 7, 4, 9, 0, 7, 11, 9]),
    "romcom": dict(bpm=108, root=50, scale=[0, 2, 4, 7, 9], wave="tri", swing=0.18, bass=[0, 4, 7, 4, 5, 9, 7, 4]),
    "kaiju": dict(bpm=92, root=36, scale=[0, 3, 6, 7, 10], wave="saw", swing=0.0, bass=[0, 0, 0, 6, 0, 0, 3, 6]),
    "fate": dict(bpm=150, root=40, scale=[0, 2, 3, 7, 8, 10], wave="saw", swing=0.0, bass=[0, 0, 8, 8, 5, 5, 7, 7]),
    "mtb": dict(bpm=128, root=40, scale=[0, 3, 5, 7, 10], wave="saw", swing=0.0, bass=[0, 0, 7, 7, 5, 5, 3, 3]),
    "karate": dict(bpm=140, root=42, scale=[0, 1, 5, 7, 8], wave="square", swing=0.0, bass=[0, 0, 5, 5, 7, 7, 1, 1]),
    "western": dict(bpm=120, root=43, scale=[0, 3, 5, 7, 10], wave="square", swing=0.25, bass=[0, 7, 0, 7, 5, 7, 3, 7]),
}


def _osc(kind, freq, t):
    ph = (freq * t) % 1.0
    if kind == "square":
        return np.where(ph < 0.5, 1.0, -1.0) * 0.6
    if kind == "saw":
        return (2 * ph - 1) * 0.7
    if kind == "tri":
        return 1 - 4 * np.abs(ph - 0.5)
    return np.sin(2 * np.pi * freq * t)


def _midi(n):
    return 440.0 * 2 ** ((n - 69) / 12.0)


def _place(buf, start, sig):
    i = int(start * SR)
    if i >= len(buf):
        return
    j = min(len(buf), i + len(sig))
    buf[i:j] += sig[: j - i]


def synth_bed(genre, seconds, cut_times=()):
    """Fallback bed when the plan has no music file: drums, bass and a lead in the genre's flavour (mono)."""
    g = GENRES.get(genre, GENRES["heist"])
    n = int(seconds * SR)
    out = np.zeros(n, dtype=np.float64)
    rng = np.random.default_rng(42)
    beat = 60.0 / g["bpm"]
    t_kick = np.arange(int(0.35 * SR)) / SR
    kick = np.sin(2 * np.pi * (45 + 90 * np.exp(-t_kick * 30)) * t_kick) * np.exp(-t_kick * 9)
    t_hat = np.arange(int(0.06 * SR)) / SR
    hat = rng.uniform(-1, 1, len(t_hat)) * np.exp(-t_hat * 70) * 0.25
    t_snare = np.arange(int(0.2 * SR)) / SR
    snare = (rng.uniform(-1, 1, len(t_snare)) * 0.5 + np.sin(2 * np.pi * 190 * t_snare) * 0.4) * np.exp(-t_snare * 18)
    step = 0
    b = 0.0
    while b < seconds:
        _place(out, b, kick * (0.9 if step % 2 == 0 else 0.6))
        if step % 2 == 1:
            _place(out, b, snare * 0.6)
        _place(out, b + beat * (0.5 + g["swing"]), hat)
        _place(out, b, hat * 0.6)
        note = g["root"] + g["bass"][step % len(g["bass"])]
        t_b = np.arange(int(beat * 0.9 * SR)) / SR
        bass = _osc(g["wave"], _midi(note), t_b) * np.exp(-t_b * 3.0) * 0.35
        _place(out, b, bass)
        if step % 2 == 0:
            m = g["root"] + 24 + g["scale"][int(rng.integers(len(g["scale"])))]
            t_m = np.arange(int(beat * 0.45 * SR)) / SR
            lead = _osc("sine" if g["wave"] == "saw" else g["wave"], _midi(m), t_m) * np.exp(-t_m * 6) * 0.18
            _place(out, b + beat * 0.5, lead)
        b += beat
        step += 1
    if genre == "zombie":
        t = np.arange(n) / SR
        out += np.sin(2 * np.pi * _midi(g["root"] - 12) * t) * 0.15 * (0.6 + 0.4 * np.sin(t * 1.3))
    if genre == "fate":
        t = np.arange(n) / SR
        pad = sum(_osc("saw", _midi(g["root"] + 12 + iv), t) for iv in (0, 3, 7)) / 3
        kernel = np.ones(40) / 40
        out += np.convolve(pad, kernel, mode="same") * 0.12 * (0.6 + 0.4 * np.sin(t * 0.9))
    if genre == "space":
        t = np.arange(n) / SR
        out += np.sin(2 * np.pi * _midi(g["root"] + 7) * t) * 0.06 * (0.5 + 0.5 * np.sin(t * 0.7))
    t_w = np.arange(int(0.5 * SR)) / SR
    whoosh = rng.uniform(-1, 1, len(t_w)) * np.sin(np.pi * t_w / t_w[-1]) ** 2 * 0.35
    for c in cut_times:
        _place(out, max(0.0, c - 0.25), whoosh)
    t_hit = np.arange(int(1.0 * SR)) / SR
    hit = (np.sin(2 * np.pi * 55 * t_hit) * 0.8 + rng.uniform(-1, 1, len(t_hit)) * 0.3) * np.exp(-t_hit * 4)
    _place(out, 0.0, hit * 0.7)
    _place(out, max(0.0, seconds - 1.0), hit * 0.6)
    return out / max(1e-6, np.max(np.abs(out)))


# ---------------------------------------------------------------- loading


def load_audio(path):
    """Decode mp3/wav/m4a to float32 stereo at SR via Blender's audaspace (wave module outside Blender)."""
    try:
        import aud
        snd = aud.Sound(path)
        try:
            snd = snd.resample(SR, True)
        except TypeError:
            snd = snd.resample(SR)
        return np.asarray(snd.rechannel(2).data(), dtype=np.float64)
    except ImportError:
        with wave.open(path, "rb") as w:
            raw = np.frombuffer(w.readframes(w.getnframes()), dtype="<i2").astype(np.float64) / 32768.0
            ch = w.getnchannels()
        x = raw.reshape(-1, ch)
        return x if ch == 2 else np.repeat(x[:, :1], 2, axis=1)


def _rms(x):
    return float(np.sqrt(np.mean(np.square(x)))) if len(x) else 0.0


def _db(v):
    return 20 * math.log10(max(v, 1e-9))


def energetic_offset(x, window=0.5, frac=0.7):
    """Start of the first 0.5s window whose RMS reaches 70% of the loudest window."""
    w = int(window * SR)
    nb = len(x) // w
    if nb < 2:
        return 0
    r = np.sqrt(np.mean(np.square(x[: nb * w].mean(axis=1)).reshape(nb, w), axis=1))
    return int(np.argmax(r >= frac * r.max())) * w


def music_bed(path, n):
    x = load_audio(path)
    x = x[energetic_offset(x):]
    if len(x) < SR:
        raise ValueError(f"music file too short: {path}")
    reps = int(math.ceil(n / len(x)))
    x = np.concatenate([x] * reps)[:n] if reps > 1 else x[:n]
    fi, fo = min(n, int(0.2 * SR)), min(n, int(0.6 * SR))
    x[:fi] *= np.linspace(0, 1, fi)[:, None]
    x[-fo:] *= np.linspace(1, 0, fo)[:, None]
    return x


# ---------------------------------------------------------------- sound effects


def _filt(x, lo=None, hi=None):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    h = np.ones_like(f)
    if hi:
        h /= 1 + (f / hi) ** 4
    if lo:
        h /= 1 + (lo / np.maximum(f, 1.0)) ** 4
    return np.fft.irfft(X * h, len(x))


def _t(sec):
    return np.arange(int(sec * SR)) / SR


def sfx_whoosh(rng):
    t = _t(0.45)
    return _filt(rng.uniform(-1, 1, len(t)), 500, 4000) * np.sin(np.pi * t / t[-1]) ** 3 * 1.6


def sfx_hit(rng):
    t = _t(0.7)
    body = np.sin(2 * np.pi * (45 + 110 * np.exp(-t * 22)) * t) * np.exp(-t * 5)
    crack = _filt(rng.uniform(-1, 1, len(t)), 800, None) * np.exp(-t * 40) * 0.6
    return body + crack


def sfx_clash(rng):
    t = _t(0.8)
    ring = sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) * np.exp(-t * d) * a
               for f, d, a in ((1870, 7, 0.5), (2950, 9, 0.45), (4130, 11, 0.35), (5560, 14, 0.3), (7020, 18, 0.2)))
    click = rng.uniform(-1, 1, len(t)) * np.exp(-t * 120)
    return ring + click * 0.8


def sfx_crowd(rng, sec):
    t = _t(sec)
    roar = _filt(rng.uniform(-1, 1, len(t)), 250, 1800)
    mod = 0.65 + 0.35 * np.interp(t, np.linspace(0, sec, max(2, int(sec * 6))), rng.uniform(0, 1, max(2, int(sec * 6))))
    env = np.minimum(1, np.minimum(t / 0.35, (sec - t) / 0.35))
    return roar * mod * env * 2.2


def sfx_riser(rng, sec=1.4):
    t = _t(sec)
    k = t / sec
    f = 180 * (8 ** k)
    tone = np.sin(2 * np.pi * np.cumsum(f) / SR) * 0.4 + np.sin(2 * np.pi * np.cumsum(f * 1.5) / SR) * 0.2
    air = _filt(rng.uniform(-1, 1, len(t)), 1500, None) * 0.9
    return (tone + air * k) * k ** 2


def sfx_boom(rng):
    t = _t(3.0)
    sub = np.sin(2 * np.pi * np.cumsum(30 + 60 * np.exp(-t * 6)) / SR) * np.exp(-t * 1.4)
    burst = _filt(rng.uniform(-1, 1, len(t)), None, 2500) * np.exp(-t * 9) * 1.2
    tail = _filt(rng.uniform(-1, 1, len(t)), None, 450) * np.exp(-t * 1.6) * 1.6
    return sub * 1.3 + burst + tail


def sfx_shimmer(rng):
    t = _t(2.4)
    trem = 0.6 + 0.4 * np.sin(2 * np.pi * 9 * t)
    return sum(np.sin(2 * np.pi * f * t + rng.uniform(0, 6)) for f in (1760, 2637, 3520, 5274)) * 0.25 * trem * np.exp(-t * 1.3)


def sfx_wind(rng, sec):
    t = _t(sec)
    gust = 0.55 + 0.45 * np.interp(t, np.linspace(0, sec, max(2, int(sec * 3))), rng.uniform(0, 1, max(2, int(sec * 3))))
    env = np.minimum(1, np.minimum(t / 0.25, (sec - t) / 0.25))
    return _filt(rng.uniform(-1, 1, len(t)), 180, 1400) * gust * env * 2.0


def sfx_dirt(rng):
    t = _t(0.45)
    grit = _filt(rng.uniform(-1, 1, len(t)), 900, 6000) * (rng.uniform(0, 1, len(t)) > 0.55)
    body = _filt(rng.uniform(-1, 1, len(t)), 120, 900)
    return (grit * 1.4 + body) * np.exp(-t * 9)


def sfx_thud(rng):
    t = _t(0.5)
    return np.sin(2 * np.pi * (40 + 70 * np.exp(-t * 30)) * t) * np.exp(-t * 9) + \
        _filt(rng.uniform(-1, 1, len(t)), None, 600) * np.exp(-t * 25) * 0.8


# ---------------------------------------------------------------- mastering


def _limit(x, ceil):
    """Look-ahead block peak limiter: gain never lets a sample exceed ceil; ~60ms release."""
    blk = 256
    n = len(x)
    nb = (n + blk - 1) // blk
    pk = np.zeros(nb * blk)
    pk[:n] = np.abs(x).max(axis=1)
    g = np.minimum(1.0, ceil / np.maximum(pk.reshape(nb, blk).max(axis=1), 1e-9))
    g = np.minimum(g, np.minimum(np.concatenate([g[:1], g[:-1]]), np.concatenate([g[1:], g[-1:]])))
    rel, att = blk / (0.06 * SR), blk / (0.004 * SR)
    for i in range(1, nb):
        g[i] = min(g[i], g[i - 1] + rel)
    for i in range(nb - 2, -1, -1):
        g[i] = min(g[i], g[i + 1] + att)
    gs = np.interp(np.arange(n), np.arange(nb) * blk + blk / 2, g)
    return np.clip(x * gs[:, None], -ceil, ceil)


def loudness_lufs(x):
    """Approximate integrated loudness (BS.1770 K-weighting via FFT, 400ms blocks, absolute and relative gates)."""
    f = np.fft.rfftfreq(len(x), 1.0 / SR)
    shelf = 10 ** (4.0 / 20 * (1 / (1 + (1680 / np.maximum(f, 1.0)) ** 2)))
    hp = 1 / np.sqrt(1 + (38 / np.maximum(f, 1.0)) ** 4)
    k = np.stack([np.fft.irfft(np.fft.rfft(x[:, c]) * shelf * hp, len(x)) for c in range(2)], axis=1)
    w, hop = int(0.4 * SR), int(0.1 * SR)
    pw = np.array([np.mean(np.square(k[i:i + w])) * 2 for i in range(0, len(k) - w, hop)])
    if not len(pw):
        return -70.0
    lk = -0.691 + 10 * np.log10(np.maximum(pw, 1e-12))
    pw = pw[lk > -70]
    if not len(pw):
        return -70.0
    rel = -0.691 + 10 * math.log10(np.mean(pw)) - 10
    pw = pw[-0.691 + 10 * np.log10(pw) > rel]
    return -0.691 + 10 * math.log10(np.mean(pw))


VOICE_RMS = 0.25
VOICE_OVER_MUSIC_DB = 10.0


def write_mix(path, genre, seconds, cut_times=(), narration=(), events=None, punchy=False, music_path=None,
              duck_to=0.55, target_rms_db=-13.0, ceiling_db=-2.0):
    """Full mastered soundtrack: music bed (file or synth fallback) ducked under narration, SFX, voice on top.

    narration: [(start_s, audio_path, max_s)]; events: dict(impacts=[s], clashes=[s], army=[(a, b)], thuds=[s], dirt=[s], wind=[(a, b)]).
    Returns measured levels of the written file."""
    events = events or {}
    n = int(seconds * SR)
    rng = np.random.default_rng(7)
    bed = None
    used_file = False
    if music_path:
        try:
            bed = music_bed(music_path, n)
            used_file = True
        except Exception as e:
            print(f"[cast] music_path {music_path} unusable ({e}); using synth bed", flush=True)
    if bed is None:
        mono = synth_bed(genre, seconds, cut_times)
        bed = np.stack([mono, np.roll(mono, 220) * 0.95], axis=1)
    voice = np.zeros(n)
    spans = []
    for start, apath, max_s in narration:
        try:
            v = load_audio(apath).mean(axis=1)
        except Exception as e:
            print(f"[cast] narration {apath} skipped: {e}", flush=True)
            continue
        v = v[: int(max_s * SR)]
        fr = int(0.05 * SR)
        frames = v[: len(v) // fr * fr].reshape(-1, fr)
        fr_rms = np.sqrt(np.mean(np.square(frames), axis=1)) if len(frames) else np.zeros(1)
        active = fr_rms[fr_rms > fr_rms.max() * 0.1]
        v *= VOICE_RMS / max(1e-6, float(np.sqrt(np.mean(np.square(active)))) if len(active) else 1.0)
        tail = min(len(v), int(0.03 * SR))
        v[-tail:] *= np.linspace(1, 0, tail)
        i = int(start * SR)
        j = min(n, i + len(v))
        if j > i:
            voice[i:j] += v[: j - i]
            spans.append((i, j))
    bed *= VOICE_RMS * 10 ** (-VOICE_OVER_MUSIC_DB / 20) / duck_to / max(1e-6, _rms(bed.mean(axis=1)))
    sfx = np.zeros(n)
    crowd = np.zeros(n)
    for a, b in events.get("army", ()):
        _place(crowd, a, sfx_crowd(rng, b - a) * VOICE_RMS * 0.9)
    for a, b in events.get("wind", ()):
        _place(crowd, a, sfx_wind(rng, b - a) * VOICE_RMS * 0.8)
    for c in events.get("dirt", ()):
        _place(sfx, c, sfx_dirt(rng) * VOICE_RMS * 1.6 * 0.7)
    unit = VOICE_RMS * 1.6
    for c in cut_times:
        _place(sfx, max(0.0, c - 0.3), sfx_whoosh(rng) * unit * 0.6)
        if punchy:
            _place(sfx, c, sfx_hit(rng) * unit * 0.8)
    for c in events.get("clashes", ()):
        _place(sfx, c, sfx_clash(rng) * unit * 0.9)
    for c in events.get("thuds", ()):
        _place(sfx, c, sfx_thud(rng) * unit * 1.2)
    for c in events.get("impacts", ()):
        _place(sfx, max(0.0, c - 1.4), sfx_riser(rng) * unit * 0.8)
        _place(sfx, c, sfx_boom(rng) * unit * 1.5)
        _place(sfx, c + 0.05, sfx_shimmer(rng) * unit * 0.9)
    shape = np.ones(n)
    for a, b, g in events.get("energy", ()):
        shape[int(a * SR):int(b * SR)] = g
    shape = np.convolve(shape, np.ones(int(0.25 * SR)) / int(0.25 * SR), mode="same")
    hero = events.get("hero")
    if hero is not None:
        hi = int(hero * SR)
        gap = int(0.4 * SR)
        shape[max(0, hi - gap):hi] *= 0.06
        swell = int(2.8 * SR)
        shape[hi:hi + swell] *= 1.0 + 0.45 * np.linspace(1, 0, len(shape[hi:hi + swell]))
        if hero not in events.get("impacts", ()):
            _place(sfx, max(0.0, hero - 1.4), sfx_riser(rng) * unit * 0.8)
            _place(sfx, hero, sfx_boom(rng) * unit * 1.3)
    gain = np.ones(n)
    ramp = int(0.08 * SR)
    for i, j in spans:
        a, b = max(0, i - ramp), min(n, j + ramp)
        seg = np.full(b - a, duck_to)
        r = min(ramp, (b - a) // 2)
        if r > 0:
            seg[:r] = np.linspace(1, duck_to, r)
            seg[-r:] = np.linspace(duck_to, 1, r)
        gain[a:b] = np.minimum(gain[a:b], seg)
    bed *= (gain * shape)[:, None]
    crowd *= gain * shape
    if spans:
        idx = np.concatenate([np.arange(i, j) for i, j in spans])
        over = _db(_rms(voice[idx])) - _db(_rms(bed[idx].mean(axis=1)))
        bed *= 10 ** ((over - VOICE_OVER_MUSIC_DB) / 20)
    wide = np.stack([sfx + crowd, np.roll(sfx, 90) + np.roll(crowd, 300)], axis=1)
    mix = bed + wide + voice[:, None]
    ceil = 10 ** (ceiling_db / 20)
    g = 10 ** (target_rms_db / 20) / max(1e-6, _rms(mix))
    for _ in range(4):
        out = _limit(mix * g, ceil)
        g *= 10 ** ((target_rms_db - _db(_rms(out))) / 20)
    out = _limit(mix * g, ceil)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes((out * 32767).astype("<i2").tobytes())
    stats = {"peak_dbfs": round(_db(float(np.abs(out).max())), 2), "rms_dbfs": round(_db(_rms(out)), 2),
             "lufs": round(loudness_lufs(out), 1), "music_file": used_file}
    if spans:
        idx = np.concatenate([np.arange(i, j) for i, j in spans])
        stats["voice_over_music_db"] = round(_db(_rms(voice[idx])) - _db(_rms(bed[idx].mean(axis=1))), 1)
    return stats
