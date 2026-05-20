# Sound Credits

All audio files in this directory are synthetically generated programmatically
using Python's standard `wave` library (pure sine-wave synthesis). No third-party
audio assets are used. All files are original works and are released under the
**Creative Commons Zero v1.0 Universal (CC0 1.0)** public domain dedication.

---

## File Inventory

| File | Description | Source | License |
|---|---|---|---|
| `correct.wav` | Ascending C-E-G chime for correct answers | Synthetically generated (sine-wave, Python stdlib) | CC0 1.0 |
| `wrong.wav` | Descending low-frequency buzzer for wrong answers | Synthetically generated (sine-wave, Python stdlib) | CC0 1.0 |
| `tick.wav` | Short high-frequency tick for countdown (last 5 s) | Synthetically generated (sine-wave, Python stdlib) | CC0 1.0 |
| `round-start.wav` | Ascending upbeat jingle for round/game start | Synthetically generated (sine-wave, Python stdlib) | CC0 1.0 |
| `game-over.wav` | Fanfare sequence for end of game | Synthetically generated (sine-wave, Python stdlib) | CC0 1.0 |

---

## Technical Specifications

All files meet the following requirements (per issue #411 / #413):

- **Format:** PCM WAV (RIFF)
- **Sample rate:** 22 050 Hz
- **Channels:** 1 (mono)
- **Bit depth:** 16-bit signed integer
- **Maximum file size:** each file ≤ 50 KB (hard limit ≤ 100 KB)

---

## Generation

Files were created with the Python standard library `wave` + `struct` + `math`
modules via pure sine-wave synthesis with linear attack/release envelopes.
No external tools, libraries, or proprietary assets were required.
The generation script is self-contained and reproducible.
