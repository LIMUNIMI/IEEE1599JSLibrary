# Synthetic browser fixtures

`synthetic-av.mp4` contains only generated red and blue frames and a 440 Hz
tone. It is used to test cross-origin byte ranges and native H.264/AAC decode,
not shipped in the package or Pages site. To regenerate it from the repository
root with FFmpeg built with `libx264` and the native AAC encoder:

```sh
ffmpeg -f lavfi -i 'color=c=red:s=160x96:r=12:d=0.6' -f lavfi -i 'color=c=blue:s=160x96:r=12:d=0.6' -f lavfi -i 'sine=frequency=440:sample_rate=48000:duration=1.2' -filter_complex '[0:v][1:v]concat=n=2:v=1:a=0[v]' -map '[v]' -map '2:a' -c:v libx264 -profile:v baseline -level:v 3.0 -pix_fmt yuv420p -g 6 -c:a aac -b:a 48k -movflags +faststart tests/fixtures/synthetic-av.mp4
```

Use synthetic inputs only. No test reads or converts a third-party asset
to create this fixture.
