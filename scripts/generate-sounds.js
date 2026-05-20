// generate-sounds.js — run with: node scripts/generate-sounds.js
// Generates 5 distinct WAV sound effects for the trivia game using PCM sine waves.

const fs = require('fs');
const path = require('path');

const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'sounds');

/**
 * Generate a WAV file with a sine wave at the given frequency and duration.
 * An exponential fade-out is applied to avoid audio clicks.
 *
 * @param {string} filename  - Output file path
 * @param {number} frequencyHz - Fundamental frequency in Hz
 * @param {number} durationMs  - Duration in milliseconds
 * @param {number} [sampleRate=44100] - Sample rate in Hz
 */
function generateWav(filename, frequencyHz, durationMs, sampleRate = 44100) {
  const numSamples = Math.floor(sampleRate * durationMs / 1000);
  const dataBytes = numSamples * 2; // 16-bit PCM = 2 bytes per sample

  const buf = Buffer.alloc(44 + dataBytes);

  // RIFF chunk descriptor
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + dataBytes, 4);
  buf.write('WAVE', 8);

  // fmt sub-chunk
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);        // sub-chunk size
  buf.writeUInt16LE(1, 20);         // PCM = 1
  buf.writeUInt16LE(1, 22);         // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32);         // block align
  buf.writeUInt16LE(16, 34);        // bits per sample

  // data sub-chunk
  buf.write('data', 36);
  buf.writeUInt32LE(dataBytes, 40);

  const durationSec = durationMs / 1000;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const envelope = 0.5 * Math.exp(-3 * t / durationSec);
    const sample = Math.round(envelope * 32767 * Math.sin(2 * Math.PI * frequencyHz * t));
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, sample)), 44 + i * 2);
  }

  fs.writeFileSync(filename, buf);
  const kb = ((44 + dataBytes) / 1024).toFixed(1);
  console.log(`  Written ${path.basename(filename)}  (${frequencyHz} Hz, ${durationMs} ms, ${kb} KB)`);
}

console.log(`Generating WAV files → ${OUTPUT_DIR}\n`);
fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Each sound has a distinct frequency AND duration so file sizes differ.
generateWav(path.join(OUTPUT_DIR, 'correct.wav'),    880,  300);  // A5  — bright ding
generateWav(path.join(OUTPUT_DIR, 'wrong.wav'),      220,  500);  // A3  — low buzz
generateWav(path.join(OUTPUT_DIR, 'tick.wav'),      1200,   80);  // ~D6 — short click
generateWav(path.join(OUTPUT_DIR, 'game-start.wav'), 660,  600);  // E5  — upbeat start
generateWav(path.join(OUTPUT_DIR, 'game-over.wav'),  330,  800);  // E4  — lower, longer end

console.log('\nDone. Verify distinct file sizes:');
['correct.wav', 'wrong.wav', 'tick.wav', 'game-start.wav', 'game-over.wav'].forEach(f => {
  const size = fs.statSync(path.join(OUTPUT_DIR, f)).size;
  console.log(`  ${f}: ${size} bytes`);
});
