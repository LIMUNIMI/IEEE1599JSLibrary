# Capability evidence

This is an early test record, not a supported-browser guarantee. Results apply
only to the stated environment and synthetic fixtures.

| Environment | Path | Evidence |
| --- | --- | --- |
| Windows 11 Education 10.0.26300, 64-bit; Microsoft Edge 157.0.4341.60 | XML | Native DOMParser parsed the synthetic subset fixture and the referenced DmITE XML; browser tests exercised malformed input, references and URL resolution. |
| Same | Buffered PCM WAV | Browser test decoded a synthetic 24 kHz mono 16-bit WAV with `decodeAudioData`, scheduled two instances, and observed completion. Audible output and drift were not measured. |
| Same | Score/controls | Browser interaction tests covered scaled hit testing, independent highlights, seeking and example playback. |
| All other browsers/devices | All paths | Unverified. Playwright Chromium/Edge does not establish Safari/iOS or Android support. |
| All browsers/devices | MP3, AAC, streaming audio, MP4/WebM video | Unverified or not implemented. No codec support claim. |

WebCodecs, demuxing, AudioWorklet streaming, media range handling, video
presentation and synchronized audio/video have not been verified. No numeric
performance, memory or synchronization budgets have been established.
