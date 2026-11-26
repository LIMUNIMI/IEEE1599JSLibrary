/**
 * Register and configure the optional custom element without a framework.
 * @module examples/embed
 */
import { defineIEEE1599Player } from '../../src/ui/player-element.js';

defineIEEE1599Player();
const player = document.querySelector('ieee1599-player');
const form = document.querySelector('form');
if (!(player instanceof HTMLElement) || !(form instanceof HTMLFormElement)) throw new Error('Missing example elements');
form.addEventListener('submit', (event) => {
  event.preventDefault();
  const input = form.elements.namedItem('document');
  if (input instanceof HTMLInputElement) player.setAttribute('src', new URL(input.value, location.href).href);
});
