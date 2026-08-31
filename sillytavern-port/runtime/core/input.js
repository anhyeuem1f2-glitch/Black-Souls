const axes = new Map([
  ['ArrowDown', [0, 1]], ['s', [0, 1]],
  ['ArrowLeft', [-1, 0]], ['a', [-1, 0]],
  ['ArrowRight', [1, 0]], ['d', [1, 0]],
  ['ArrowUp', [0, -1]], ['w', [0, -1]],
]);
const keypad = new Map([
  ['1', [-1, 1, 1]], ['3', [1, 1, 3]], ['7', [-1, -1, 7]], ['9', [1, -1, 9]],
  ['2', [0, 1, 2]], ['4', [-1, 0, 4]], ['6', [1, 0, 6]], ['8', [0, -1, 8]],
]);
const directionNumber = new Map([
  ['-1,1', 1], ['0,1', 2], ['1,1', 3], ['-1,0', 4], ['1,0', 6], ['-1,-1', 7], ['0,-1', 8], ['1,-1', 9],
]);

export class InputController {
  constructor(element, { windowRef = window, documentRef = document } = {}) {
    this.element = element;
    this.window = windowRef;
    this.document = documentRef;
    this.queue = [];
    this.held = new Map();
    this.confirmed = false;
    this.cancelled = false;
    this.interacted = false;
    this.dashPressed = false;
    this.onKeyDown = (event) => {
      if (!this.ownsKeyboard(event)) return;
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      if (axes.has(key)) {
        const firstPress = !this.held.has(key);
        this.held.set(key, axes.get(key));
        if (firstPress) this.enqueueHeldDirection();
        this.consume(event);
      } else if (keypad.has(key) && /^Numpad/.test(event.code || '')) {
        this.queue.push(keypad.get(key));
        this.consume(event);
      }
      if (['Enter', ' ', 'z'].includes(key)) {
        this.confirmed = true;
        this.interacted = true;
        this.consume(event);
      }
      if (['Escape', 'x', 'Insert'].includes(key)) {
        if (key === 'Escape' && this.document.fullscreenElement) return;
        this.cancelled = true;
        this.interacted = true;
        this.consume(event);
      }
      if (key === 'Shift') { this.dashPressed = true; this.consume(event); }
    };
    this.onKeyUp = (event) => {
      const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
      this.held.delete(key);
      if (key === 'Shift') this.dashPressed = false;
    };
    this.window.addEventListener('keydown', this.onKeyDown, true);
    this.window.addEventListener('keyup', this.onKeyUp, true);
  }

  ownsKeyboard(event) {
    const active = this.document.activeElement;
    if (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName)) return false;
    return active === this.element || this.element.contains?.(active) || event.target === this.element;
  }

  enqueueHeldDirection() {
    let dx = 0; let dy = 0;
    for (const [x, y] of this.held.values()) { dx += x; dy += y; }
    dx = Math.sign(dx); dy = Math.sign(dy);
    const direction = directionNumber.get(`${dx},${dy}`);
    if (direction) this.queue.push([dx, dy, direction]);
  }

  consume(event) {
    this.interacted = true;
    event.preventDefault();
    event.stopPropagation();
  }

  takeDirection() { return this.queue.shift() ?? null; }
  currentDirection() {
    let dx = 0; let dy = 0;
    for (const [x, y] of this.held.values()) { dx += x; dy += y; }
    dx = Math.sign(dx); dy = Math.sign(dy);
    const direction = directionNumber.get(`${dx},${dy}`);
    return direction ? [dx, dy, direction] : null;
  }
  takeMovementDirection() {
    const held = this.currentDirection();
    if (held) { this.queue.length = 0; return held; }
    return this.takeDirection();
  }
  isDashPressed() { return this.dashPressed; }
  takeConfirm() { const value = this.confirmed; this.confirmed = false; return value; }
  takeCancel() { const value = this.cancelled; this.cancelled = false; return value; }
  takeInteraction() { const value = this.interacted; this.interacted = false; return value; }
  clear() { this.queue.length = 0; this.confirmed = false; this.cancelled = false; this.held.clear(); this.dashPressed = false; }
  destroy() {
    this.window.removeEventListener('keydown', this.onKeyDown, true);
    this.window.removeEventListener('keyup', this.onKeyUp, true);
  }
}
