#!/usr/bin/env python3
"""Build the bundled CC0 bowed-string banks (developer tool, never run at playback).

Requires Python with numpy/scipy and ffmpeg. Original WAVs are cached locally.
Run: python3 scripts/prepare-string-assets.py [--source-dir /path/to/cache]
"""
import argparse
import hashlib
import json
import re
import subprocess
import tempfile
import urllib.parse
import urllib.request
import warnings
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

import numpy as np
from scipy.io import wavfile

ROOT = Path(__file__).resolve().parents[1]
COMMIT = "440300901dfe9275fd84e0b7763af1f8443ae62e"
SOURCE = f"https://raw.githubusercontent.com/sgossner/VSCO-2-CE/{COMMIT}/"
LOOP_START, LOOP_END, CROSSFADE = 0.9, 4.1, 0.18


def source_bytes(path, cache):
    target = cache / path
    if not target.exists():
        target.parent.mkdir(parents=True, exist_ok=True)
        with urllib.request.urlopen(SOURCE + urllib.parse.quote(path), timeout=45) as response:
            target.write_bytes(response.read())
    return target


def midi(note, octave_offset=0):
    letter, sharp, octave = re.fullmatch(r"([A-G])(#?)(\d)", note).groups()
    return (int(octave) + 1 + octave_offset) * 12 + {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}[letter] + bool(sharp)


def definitions():
    solo = ["G3", "A3", "C4", "E4", "G4", "A4", "C5", "E5", "G5", "A5", "C6", "E6", "A6", "C7"]
    violin = [{"midi": midi(note), "sourceFile": f"Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_{note}_p.wav", "section": "solo-violin", "pan": -0.06} for note in solo]
    strings = []
    for note in ["E0", "G0", "A#0"]:
        articulation = "SusNV" if note == "E0" else "SusVib"
        strings.append({"midi": midi(note, 1), "sourceFile": f"Strings/Solo Contrabass/{articulation}/BKCtbss_{articulation}_{note}_v1_rr1.wav", "section": "contrabass", "pan": 0.28})
    for note in ["C1", "E1", "G1", "B1"]:
        strings.append({"midi": midi(note, 1), "sourceFile": f"Strings/Cello Section/susvib/susvib_{note}_v1_1.wav", "section": "cellos", "pan": 0.18})
    for note in ["C2", "D2", "E2"]:
        strings.append({"midi": midi(note, 1), "sourceFile": f"Strings/Viola Section/susvib/ViolaEns_susvib_{note}_v1_1.wav", "section": "violas", "pan": 0.02})
    for note in ["G2", "A2", "B2", "D3", "F#3", "C4", "E4", "G4", "B4", "D5"]:
        strings.append({"midi": midi(note, 1), "sourceFile": f"Strings/Violin Section/susVib/VlnEns_susVib_{note}_v1.wav", "section": "violins", "pan": -0.2})
    return {"violin": violin, "strings": strings}


def prepare_sample(item, bank, cache):
    source = source_bytes(item["sourceFile"], cache)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", wavfile.WavFileWarning)
        rate, original = wavfile.read(source)
    audio = original.astype(np.float64) / (np.iinfo(original.dtype).max + 1)
    if audio.ndim == 1:
        audio = audio[:, None]
    # Trim recording silence, retaining 15 ms before the bow's audible onset.
    window = max(1, int(rate * 0.01))
    blocks = audio[:len(audio) // window * window].reshape(-1, window, audio.shape[1])
    levels = np.sqrt(np.mean(blocks * blocks, axis=(1, 2)))
    onset = max(0, int(np.argmax(levels > levels.max() * 0.025) * window - rate * 0.015))
    length = round((LOOP_END + 0.15) * rate)
    audio = audio[onset:onset + length].copy()
    if len(audio) < length:
        raise ValueError(f"Source too short for sustain loop: {source}")
    rms = np.sqrt(np.mean(audio[int(rate * LOOP_START):int(rate * LOOP_END)] ** 2))
    audio *= min(0.13 / max(rms, 1e-8), 0.85 / max(np.max(np.abs(audio)), 1e-8))
    # The tail approaches the pre-loop waveform, so wrapping preserves the bow
    # texture and natural vibrato without repeating an attack or inserting a gap.
    cross = round(CROSSFADE * rate)
    start, end = round(LOOP_START * rate), round(LOOP_END * rate)
    mix = (0.5 - 0.5 * np.cos(np.linspace(0, np.pi, cross)))[:, None]
    audio[end - cross:end] = audio[end - cross:end] * (1 - mix) + audio[start - cross:start] * mix
    audio[end:] *= np.linspace(1, 0, len(audio) - end)[:, None]
    filename = f"{item['midi']}.mp3"
    destination = ROOT / "public/audio" / bank / filename
    destination.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(suffix=".wav") as temporary:
        wavfile.write(temporary.name, rate, np.round(np.clip(audio, -1, 1) * 32767).astype(np.int16))
        subprocess.run(["ffmpeg", "-hide_banner", "-loglevel", "error", "-y", "-i", temporary.name, "-codec:a", "libmp3lame", "-b:a", "160k", "-ar", "44100", "-map_metadata", "-1", str(destination)], check=True)
    encoded = destination.read_bytes()
    return {**item, "file": filename, "loopStart": LOOP_START, "loopEnd": LOOP_END,
            "sha256": hashlib.sha256(encoded).hexdigest(), "bytes": len(encoded),
            "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, default=ROOT / ".local/vsco2-source")
    args = parser.parse_args()
    banks = definitions()
    license_text = source_bytes("LICENSE", args.source_dir).read_text()
    for bank, samples in banks.items():
        with ThreadPoolExecutor(max_workers=4) as pool:
            prepared = list(pool.map(lambda item: prepare_sample(item, bank, args.source_dir), samples))
        destination = ROOT / "public/audio" / bank
        manifest = {"version": 1, "id": bank, "label": "VSCO 2 CE · " + ("Solo Violin" if bank == "violin" else "Chamber Strings"),
                    "license": "CC0-1.0", "source": f"https://github.com/sgossner/VSCO-2-CE/tree/{COMMIT}", "commit": COMMIT,
                    "processing": "Trimmed, level matched, 180 ms sustain-loop crossfade, MP3 160 kbps. Solo violin uses scientific pitch; other source filenames use C3=middle C.",
                    "samples": sorted(prepared, key=lambda item: item["midi"])}
        (destination / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")
        (destination / "LICENSE.txt").write_text(license_text)
        (destination / "ATTRIBUTION.txt").write_text(
            "VS Chamber Orchestra 2: Community Edition (VSCO 2 CE)\n"
            "Recorded by Sam Gossner & Simon Dalzell. Sample cutting: Elan Hickler / Soundemote.\n"
            "License: CC0 1.0 Universal — https://creativecommons.org/publicdomain/zero/1.0/\n"
            f"Source: https://github.com/sgossner/VSCO-2-CE/tree/{COMMIT}\n\n"
            "Qinban edits: silence trimming, level matching, crossfaded sustain loops, MP3 encoding.\n"
            "See manifest.json for each original filename and SHA-256. No runtime CDN is used.\n"
            "Strings combines recorded violin, viola and cello sections with solo contrabass by register.\n")
        print(f"{bank}: {len(prepared)} samples, {sum(item['bytes'] for item in prepared):,} bytes")


if __name__ == "__main__":
    main()
