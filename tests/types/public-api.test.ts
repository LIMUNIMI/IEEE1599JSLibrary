import {
  createBufferedAudioPlayer,
  createSynchronizedMediaPlayer,
  createTimeline
} from 'ieee1599jslibrary';
import { openMediabunnyInput } from 'ieee1599jslibrary/adapters/mediabunny';

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
void openMediabunnyInput({ mediabunny: {}, source: 'recording.mp4' });
