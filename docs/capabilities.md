# Capability evidence

This is an early test record, not a supported-browser guarantee. Results apply
only to the stated environment and synthetic fixtures.

| Environment | Path | Evidence |
| --- | --- | --- |
| Windows 11 Education 10.0.26300, 64-bit; Microsoft Edge 157.0.4341.60 | XML | Native DOMParser parsed the synthetic subset fixture and the referenced DmITE XML; browser tests exercised malformed input, references and URL resolution. |
| Same | Buffered PCM WAV | Browser test decoded a synthetic 24 kHz mono 16-bit WAV with `decodeAudioData`, scheduled two instances, and observed completion. Audible output and drift were not measured. |
| Same | Score/controls | Browser interaction tests covered scaled hit testing, independent highlights, seeking and example playback. |
| Same | La Catedral local derivatives | Browser tests decoded the supplied MP3 recordings through Web Audio and the converted H.264 MP4 through native WebCodecs, verified clock-relative frame presentation and tested canvas following and seek. This is not a measurement of speaker-to-display synchronization. |
| All other browsers/devices | All paths | Unverified. Playwright Chromium/Edge does not establish Safari/iOS or Android support. |
| All browsers/devices | AAC, streaming audio, WebM video | Unverified or not implemented. No codec support claim. |

AudioWorklet streaming, media range handling, video-only clocks and
general-purpose mixed-media synchronization have not been verified. No numeric
performance, memory or synchronization budgets have been established.
