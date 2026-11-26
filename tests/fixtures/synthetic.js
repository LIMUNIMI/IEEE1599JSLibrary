/**
 * Generate a tiny in-memory PCM WAV used only by automated browser probes.
 * @param {{duration?: number, sampleRate?: number}} [options]
 * @returns {ArrayBuffer}
 */
export function createSyntheticWav({ duration = 0.1, sampleRate = 24000 } = {}) {
  if (!Number.isFinite(duration) || duration <= 0 || !Number.isInteger(sampleRate) || sampleRate <= 0) {
    throw new RangeError('Invalid synthetic WAV settings');
  }
  const samples = Math.floor(duration * sampleRate);
  const bytes = new ArrayBuffer(44 + samples * 2);
  const view = new DataView(bytes);
  const write = (offset, text) => [...text].forEach((character, i) =>
    view.setUint8(offset + i, character.charCodeAt(0)));
  write(0, 'RIFF'); view.setUint32(4, 36 + samples * 2, true); write(8, 'WAVE');
  write(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  write(36, 'data'); view.setUint32(40, samples * 2, true);
  for (let i = 0; i < samples; i++) view.setInt16(44 + i * 2, Math.sin(i / 10) * 10000, true);
  return bytes;
}
