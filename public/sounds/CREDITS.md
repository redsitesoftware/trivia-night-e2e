# Sound Credits

All sound files in this directory are synthetic tones generated programmatically
using Python's `wave` standard-library module (sine-wave synthesis with ADSR
envelopes). No third-party audio was sampled or adapted.

| File | Source | License | Author |
|------|--------|---------|--------|
| tick.wav | Procedurally generated (sine wave, 1200 Hz, 80 ms) | CC0 / Public Domain | trivia-night-e2e project |
| round-start.wav | Procedurally generated (ascending arpeggio C5→E5→G5→C6 + chord, ~1 s) | CC0 / Public Domain | trivia-night-e2e project |
| game-over.wav | Procedurally generated (4-note fanfare C5→E5→G5→C6 + chord, ~1 s) | CC0 / Public Domain | trivia-night-e2e project |

## Technical Specification

- Sample rate: 22050 Hz
- Channels: 1 (mono)
- Bit depth: 16-bit PCM
- Format: WAV (RIFF/PCM)
- All files ≤ 50 KB
