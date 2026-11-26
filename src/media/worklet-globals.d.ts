/** Minimal AudioWorklet scope declarations, absent from TypeScript's DOM lib. */
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}
declare const currentTime: number;
declare const sampleRate: number;
declare function registerProcessor(
  name: string,
  processor: new (options: { processorOptions: { capacity: number } }) => AudioWorkletProcessor
): void;
