import js from '@eslint/js';

export default [
  js.configs.recommended,
  {
    files: ['**/*.js'],
    languageOptions: {
      globals: {
        AbortController: 'readonly',
        AudioContext: 'readonly',
        Blob: 'readonly',
        clearTimeout: 'readonly',
        cancelAnimationFrame: 'readonly',
        console: 'readonly',
        CustomEvent: 'readonly',
        DOMParser: 'readonly',
        document: 'readonly',
        Event: 'readonly',
        EventTarget: 'readonly',
        fetch: 'readonly',
        HTMLButtonElement: 'readonly',
        HTMLCanvasElement: 'readonly',
        HTMLElement: 'readonly',
        HTMLOutputElement: 'readonly',
        HTMLSelectElement: 'readonly',
        Image: 'readonly',
        location: 'readonly',
        Option: 'readonly',
        process: 'readonly',
        requestAnimationFrame: 'readonly',
        setTimeout: 'readonly',
        URL: 'readonly',
        VideoDecoder: 'readonly',
        window: 'readonly'
      }
    }
  }
];
