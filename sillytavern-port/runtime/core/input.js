const directions = new Map([
  ['ArrowDown', [0, 1, 2]], ['s', [0, 1, 2]],
  ['ArrowLeft', [-1, 0, 4]], ['a', [-1, 0, 4]],
  ['ArrowRight', [1, 0, 6]], ['d', [1, 0, 6]],
  ['ArrowUp', [0, -1, 8]], ['w', [0, -1, 8]],
  ['q', [-1, -1, 7]], ['e', [1, -1, 9]], ['z', [-1, 1, 1]], ['c', [1, 1, 3]],
]);

export class InputController {
  constructor(element) {
    this.element = element;
    this.queue = [];
    this.confirmed = false;
    this.onKeyDown = (event) => {
      if (document.activeElement !== this.element) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (directions.has(key)) {
        this.queue.push(directions.get(key));
        event.preventDefault();
      }
      if (['Enter', ' ', 'x'].includes(key)) {
        this.confirmed = true;
        event.preventDefault();
      }
    };
    window.addEventListener('keydown', this.onKeyDown);
  }

  takeDirection() { return this.queue.shift() ?? null; }
  takeConfirm() { const value = this.confirmed; this.confirmed = false; return value; }
  destroy() { window.removeEventListener('keydown', this.onKeyDown); }
}
