import {
  createBufferedAudioPlayer,
  createStreamingAudioPlayer,
  createSynchronizedMediaPlayer,
  createTimeline
} from 'ieee1599jslibrary';
import { openMediabunnyInput } from 'ieee1599jslibrary/adapters/mediabunny';
import { loadIIIFImage } from 'ieee1599jslibrary/adapters/iiif';
import { createScorePager } from 'ieee1599jslibrary/ui/score-pager.js';
import { defineIEEE1599Player } from 'ieee1599jslibrary/ui/player-element.js';

const audio = createBufferedAudioPlayer();
const state: string = audio.state;
console.log(state);

const player = createSynchronizedMediaPlayer({
  audio,
  videos: [{
    async seek(seconds) { console.log(seconds); },
    async present(seconds) { console.log(seconds); }
  }]
});
const time: number = player.currentTime;
void player.seek(time);
void player.present();
const timeline = createTimeline(['event-1'], [{ eventRef: 'event-1', time: 0 }]);
const mappedTime: number = timeline.resolve('event-1').time;
void mappedTime;
void openMediabunnyInput({ mediabunny: {}, source: 'recording.mp4' }).then((input) => {
  const track = input.tracks.find((track) => track.type === 'audio');
  if (!track?.decoderConfig || !track.duration) return;
  return createStreamingAudioPlayer({
    track: { decoderConfig: track.decoderConfig, duration: track.duration, async *chunks() {} }
  });
});
void loadIIIFImage('https://example.org/iiif/score/info.json');
const PlayerElement = defineIEEE1599Player();
const embedded = new PlayerElement();
embedded.src = 'score.xml';
void embedded.play();
embedded.pause();
const pager = createScorePager({ container: document.body, pages: [{ url: 'score.png', events: [] }], onSeek(ref) { console.log(ref); } });
pager.highlight(['event-1']);
pager.setZoom(2);
void createStreamingAudioPlayer({
  track: {
    duration: 10,
    decoderConfig: { codec: 'pcm-f32', sampleRate: 48000, numberOfChannels: 1 },
    async *chunks(_time, signal) {
      signal.throwIfAborted();
      yield new EncodedAudioChunk({ type: 'key', timestamp: 0, data: new Float32Array(1024) });
    }
  }
}).then((streaming) => createSynchronizedMediaPlayer({ audio: streaming }));
