import js from '@eslint/js';

export default [
  { ignores: ['_site/', 'examples/dmite/assets/', 'examples/assets/', 'corpus-report/'] },
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        AudioContext: 'readonly',
        AudioDecoder: 'readonly',
        AudioWorkletNode: 'readonly',
        EncodedAudioChunk: 'readonly',
        Blob: 'readonly',
        Buffer: 'readonly',
        createImageBitmap: 'readonly',
        clearTimeout: 'readonly',
        cancelAnimationFrame: 'readonly',
        console: 'readonly',
        CustomEvent: 'readonly',
        DOMParser: 'readonly',
        document: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        Element: 'readonly',
        fetch: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLDialogElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLInputElement: 'readonly',
        HTMLFormElement: 'readonly',
        HTMLOutputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        Image: 'readonly',
        location: 'readonly',
        OfflineAudioContext: 'readonly',
        Option: 'readonly',
        process: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        ShadowRoot: 'readonly',
        URL: 'readonly',
        VideoDecoder: 'readonly',
        window: 'readonly'
      }
    }
  },
  {
    files: ['src/adapters/**/*.js'],
    rules: {
      'no-restricted-imports': ['error', {
        paths: [{ name: 'mediabunny', message: 'Inject the optional module; do not make a static import.' }]
      }],
      'no-restricted-properties': ['error',
        ...['Conversion', 'Output', 'AudioBufferSink', 'AudioSampleSink', 'VideoSampleSink',
          'CanvasSink', 'AudioBufferSource', 'AudioSampleSource', 'VideoSampleSource',
          'CanvasSource', 'registerEncoder', 'registerDecoder', 'canEncode', 'canEncodeAudio',
          'canEncodeVideo'].map((property) => ({
          object: 'mediabunny',
          property,
          message: 'The adapter is read-only and must not decode, encode, convert, play or write media.'
        }))
      ]
    }
  }
];
