/**
 * Optional, framework-free play/pause button, position slider and status for
 * a buffered audio player.
 * @module ieee1599/ui/transport-controls
 */

/**
 * @typedef {object} TransportPlayer
 * @property {import('../media/buffered-audio.js').PlayerState} state
 * @property {number} currentTime
 * @property {number} duration
 * @property {() => Promise<void>} play
 * @property {() => void} pause
 * @property {(seconds: number) => void | Promise<void>} seek
 * @property {EventTarget['addEventListener']} addEventListener
 * @property {EventTarget['removeEventListener']} removeEventListener
 */

/**
 * Render accessible transport controls bound to `player`. The controls
 * follow `statechange`/`positionchange` events and never own a clock.
 * @param {object} options
 * @param {HTMLElement} options.container Element the controls are appended to.
 * @param {TransportPlayer} options.player Player to drive.
 * @returns {{dispose: () => void}} Handle; `dispose()` removes the DOM and listeners
 *   without disposing the player.
 */
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
      reportError(reason);
    }
  };
  /** @param {unknown} reason */
  const reportError = (reason) => {
    error.textContent = reason instanceof Error ? reason.message : String(reason);
  };
  const seek = () => {
    error.textContent = '';
    try {
      const result = player.seek(Number(position.value));
      if (result && typeof result.then === 'function') result.catch(reportError);
    } catch (reason) {
      reportError(reason);
    }
  };
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
