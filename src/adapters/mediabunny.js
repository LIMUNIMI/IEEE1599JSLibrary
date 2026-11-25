/**
 * Optional, read-only MP4 and QuickTime demuxing through Mediabunny.
 *
 * The module is injected by the host so importing the library core never
 * imports or requires Mediabunny. This adapter exposes encoded packets and
 * native WebCodecs decoder configuration; it does not decode, play, convert,
 * encode or write media.
 * @module ieee1599/adapters/mediabunny
 */

/**
 * The subset of Mediabunny used by this adapter.
 * @typedef {Pick<typeof import('mediabunny'),
 *   'Input' | 'UrlSource' | 'BlobSource' | 'MP4' | 'QTFF' | 'EncodedPacketSink'>} MediabunnyReadModule
 */
/** @typedef {import('mediabunny').EncodedPacket} EncodedPacket */
/** @typedef {import('mediabunny').InputTrack} InputTrack */
/** @typedef {import('mediabunny').InputAudioTrack | import('mediabunny').InputVideoTrack} MediaTrack */

/** @param {InputTrack} track @returns {track is MediaTrack} */
function isMediaTrack(track) {
  return track.type === 'audio' || track.type === 'video';
}

/**
 * Read-only encoded-packet access for a track.
 * @typedef {object} MediabunnyPacketReader
 * @property {(timestamp: number) => Promise<EncodedPacket | null>} getPacket
 * @property {(timestamp: number) => Promise<EncodedPacket | null>} getKeyPacket
 * @property {(packet: EncodedPacket) => Promise<EncodedPacket | null>} getNextPacket
 * @property {(startPacket?: EncodedPacket, endPacket?: EncodedPacket) => AsyncGenerator<EncodedPacket, void, unknown>} packets
 */

/**
 * Track data needed to configure a native WebCodecs decoder.
 * @typedef {object} MediabunnyTrack
 * @property {'audio' | 'video'} type
 * @property {string | null} codec
 * @property {AudioDecoderConfig | VideoDecoderConfig | null} decoderConfig
 * @property {boolean} canDecode Whether this browser reports native WebCodecs support.
 * @property {number | null} duration Estimated track duration in seconds, when available.
 * @property {MediabunnyPacketReader} packets Encoded packets in decode order.
 * @property {MediaTrack} sourceTrack Read-only Mediabunny track handle for application-specific native sinks.
 */

/**
 * Open an MP4 or QuickTime input for read-only demuxing.
 *
 * Pass the Mediabunny module from the host, e.g.
 * `openMediabunnyInput({ mediabunny: await import('mediabunny'), source })`.
 * URL sources use range reads where supported by the server; Blob sources
 * include local `File` objects. Dispose the returned input when finished.
 *
 * @param {object} options
 * @param {MediabunnyReadModule} options.mediabunny Host-provided Mediabunny module.
 * @param {string | URL | Blob} options.source URL or local Blob/File.
 * @param {AbortSignal} [options.signal] Disposes the input when aborted.
 * @returns {Promise<{mimeType: string, tracks: readonly MediabunnyTrack[], dispose: () => void}>}
 * @throws {TypeError} If the module or media source is invalid.
 * @throws {Error} If input parsing, metadata access, or track inspection fails.
 */
export async function openMediabunnyInput({ mediabunny, source, signal }) {
  if (!mediabunny || typeof mediabunny.Input !== 'function'
    || typeof mediabunny.UrlSource !== 'function' || typeof mediabunny.BlobSource !== 'function'
    || typeof mediabunny.EncodedPacketSink !== 'function' || !mediabunny.MP4 || !mediabunny.QTFF) {
    throw new TypeError('A compatible Mediabunny module is required');
  }
  let mediaSource;
  if (typeof source === 'string' || source instanceof URL) {
    mediaSource = new mediabunny.UrlSource(source);
  } else if (typeof Blob !== 'undefined' && source instanceof Blob) {
    mediaSource = new mediabunny.BlobSource(source);
  } else {
    throw new TypeError('Media source must be a URL or Blob');
  }
  signal?.throwIfAborted();

  const input = new mediabunny.Input({
    source: mediaSource,
    formats: [mediabunny.MP4, mediabunny.QTFF]
  });
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    signal?.removeEventListener('abort', dispose);
    input.dispose();
  };
  signal?.addEventListener('abort', dispose, { once: true });

  try {
    const [mimeType, sourceTracks] = await Promise.all([input.getMimeType(), input.getTracks()]);
    signal?.throwIfAborted();
    const tracks = await Promise.all(sourceTracks.filter(isMediaTrack).map(async (mediaTrack) => {
      const [codec, decoderConfig, canDecode, duration] = await Promise.all([
        mediaTrack.getCodec(),
        mediaTrack.getDecoderConfig(),
        mediaTrack.canDecode(),
        mediaTrack.getDurationFromMetadata()
      ]);
      const sink = new mediabunny.EncodedPacketSink(mediaTrack);
      const assertOpen = () => {
        if (disposed) throw new Error('Mediabunny input is disposed');
      };
      /** @type {MediabunnyPacketReader} */
      const packets = Object.freeze({
        async getPacket(timestamp) {
          assertOpen();
          return await sink.getPacket(timestamp);
        },
        async getKeyPacket(timestamp) {
          assertOpen();
          return await sink.getKeyPacket(timestamp);
        },
        async getNextPacket(packet) {
          assertOpen();
          return await sink.getNextPacket(packet);
        },
        async *packets(startPacket, endPacket) {
          assertOpen();
          for await (const packet of sink.packets(startPacket, endPacket)) {
            assertOpen();
            yield packet;
          }
        }
      });
      const type = mediaTrack.type === 'video' ? 'video' : 'audio';
      return Object.freeze({ type, codec, decoderConfig, canDecode, duration, packets, sourceTrack: mediaTrack });
    }));
    signal?.throwIfAborted();
    return Object.freeze({ mimeType, tracks: Object.freeze(tracks), dispose });
  } catch (error) {
    dispose();
    throw error;
  }
}
