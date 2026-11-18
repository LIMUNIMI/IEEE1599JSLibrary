/** @typedef {import('../media/buffered-audio.js').BufferedAudioPlayer} BufferedAudioPlayer */

/** @param {{container: HTMLElement, player: BufferedAudioPlayer}} options */
export function createTransportControls({ container, player }) {
  const wrapper = document.createElement('div');
  const button = document.createElement('button');
  button.type = 'button';
  const position = document.createElement('input');
  position.type = 'range';
  position.min = '0';
  position.step = 'any';
  position.setAttribute('aria-label', 'Playback position');
  const status = document.createElement('span');
  status.setAttribute('role', 'status');
  const error = document.createElement('span');
  error.setAttribute('role', 'alert');
  wrapper.append(button, position, status, error);
  container.append(wrapper);
  let frame = 0;
  let disposed = false;
  const update = () => {
    if (disposed) return;
    button.textContent = player.state === 'playing' || player.state === 'buffering' ? 'Pause' : 'Play';
    button.disabled = player.state === 'disposed';
    position.max = String(player.duration);
    position.value = String(player.currentTime);
    position.disabled = player.duration === 0 || player.state === 'disposed';
    status.textContent = player.state;
    if (frame) cancelAnimationFrame(frame);
    frame = player.state === 'playing' ? requestAnimationFrame(update) : 0;
  };
  const click = async () => {
    error.textContent = '';
    try {
      if (player.state === 'playing' || player.state === 'buffering') player.pause();
      else await player.play();
    } catch (reason) {
      error.textContent = reason instanceof Error ? reason.message : String(reason);
    }
  };
  const seek = () => player.seek(Number(position.value));
  const onError = () => { error.textContent = 'Playback failed'; };
  button.addEventListener('click', click);
  position.addEventListener('input', seek);
  player.addEventListener('statechange', update);
  player.addEventListener('positionchange', update);
  player.addEventListener('error', onError);
  update();
  return {
    dispose() {
      disposed = true;
      if (frame) cancelAnimationFrame(frame);
      button.removeEventListener('click', click);
      position.removeEventListener('input', seek);
      player.removeEventListener('statechange', update);
      player.removeEventListener('positionchange', update);
      player.removeEventListener('error', onError);
      wrapper.remove();
    }
  };
}
