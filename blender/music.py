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


def write_music(path, genre, seconds, cut_times=(), duck=(), punchy=False):
    """duck: [(start_s, end_s)] ranges where narration plays; music drops to ~30% there.
    punchy: an impact hit on every cut instead of only a whoosh."""
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
    t_imp = np.arange(int(0.6 * SR)) / SR
    impact = (np.sin(2 * np.pi * (40 + 120 * np.exp(-t_imp * 25)) * t_imp) + rng.uniform(-1, 1, len(t_imp)) * 0.4 * np.exp(-t_imp * 30)) * np.exp(-t_imp * 6)
    for c in cut_times:
        _place(out, max(0.0, c - 0.25), whoosh)
        if punchy:
            _place(out, c, impact * 0.8)
    t_hit = np.arange(int(1.0 * SR)) / SR
    hit = (np.sin(2 * np.pi * 55 * t_hit) * 0.8 + rng.uniform(-1, 1, len(t_hit)) * 0.3) * np.exp(-t_hit * 4)
    _place(out, 0.0, hit * 0.7)
    _place(out, max(0.0, seconds - 1.0), hit * 0.6)
    fade = int(0.4 * SR)
    out[-fade:] *= np.linspace(1, 0, fade)
    out /= max(1e-6, np.max(np.abs(out))) / 0.85
    if duck:
        gain = np.ones(n)
        ramp = int(0.08 * SR)
        for a, b in duck:
            i, j = max(0, int(a * SR) - ramp), min(n, int(b * SR) + ramp)
            if j <= i:
                continue
            seg = np.full(j - i, 0.3)
            r = min(ramp, (j - i) // 2)
            if r > 0:
                seg[:r] = np.linspace(1, 0.3, r)
                seg[-r:] = np.linspace(0.3, 1, r)
            gain[i:j] = np.minimum(gain[i:j], seg)
        out *= gain
    left = out
    right = np.roll(out, 220) * 0.95
    stereo = (np.stack([left, right], axis=1) * 32767).astype("<i2")
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(SR)
        w.writeframes(stereo.tobytes())
    return path
