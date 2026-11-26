/**
 * Public declaration for the optional, read-only Mediabunny adapter.
 * Kept independent of Mediabunny's global WebCodecs type augmentations.
 */
export interface MediabunnyPacket {
  readonly data: Uint8Array;
  readonly type: 'key' | 'delta';
  readonly timestamp: number;
  readonly duration: number;
  readonly sequenceNumber: number;
  readonly byteLength: number;
}

export interface MediabunnyPacketReader {
  getPacket(timestamp: number): Promise<MediabunnyPacket | null>;
  getKeyPacket(timestamp: number): Promise<MediabunnyPacket | null>;
  getNextPacket(packet: MediabunnyPacket): Promise<MediabunnyPacket | null>;
  packets(
    startPacket?: MediabunnyPacket,
    endPacket?: MediabunnyPacket
  ): AsyncGenerator<MediabunnyPacket, void, unknown>;
}

export interface MediabunnyTrack {
  readonly type: 'audio' | 'video';
  readonly codec: string | null;
  readonly decoderConfig: AudioDecoderConfig | VideoDecoderConfig | null;
  readonly canDecode: boolean;
  readonly duration: number | null;
  readonly packets: MediabunnyPacketReader;
  readonly sourceTrack: object;
}

export interface MediabunnyInput {
  readonly mimeType: string;
  readonly tracks: readonly MediabunnyTrack[];
  dispose(): void;
}

export interface OpenMediabunnyInputOptions {
  /** Host-provided Mediabunny ESM module. Runtime structure is validated. */
  mediabunny: object;
  /** URL, File or Blob source. */
  source: string | URL | Blob;
  /** Disposes the input when aborted. */
  signal?: AbortSignal;
}

/**
 * Open MP4 or QuickTime for read-only metadata and encoded packet access.
 * This adapter never decodes, plays, converts, encodes or writes media.
 */
export function openMediabunnyInput(
  options: OpenMediabunnyInputOptions
): Promise<MediabunnyInput>;
