import type { Anchor, TrainingStep } from './types';

/** The CSS selector for an anchor: `css:` prefix as is, otherwise a `data-testid`. */
export function anchorSelector(anchor: Anchor): string {
  if (anchor.startsWith('css:')) return anchor.slice(4);
  const escaped = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(anchor) : anchor.replace(/"/g, '\\"');
  return `[data-testid="${escaped}"]`;
}

function visible(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** The first visible element for an anchor, or null. */
export function findAnchor(anchor: Anchor): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  let nodes: NodeListOf<Element>;
  try {
    nodes = document.querySelectorAll(anchorSelector(anchor));
  } catch {
    return null;
  }
  for (const el of nodes) if (visible(el)) return el as HTMLElement;
  return null;
}

/** A step's anchors, most specific first. */
export function stepAnchors(step: TrainingStep): Anchor[] {
  return [...(step.anchors ?? []), ...(step.anchor ? [step.anchor] : [])];
}

/** The element a step points at right now, if any. */
export function findStepTarget(step: TrainingStep): HTMLElement | null {
  for (const a of stepAnchors(step)) {
    const el = findAnchor(a);
    if (el) return el;
  }
  return null;
}

/** Waits for an anchor to be on screen, up to `timeoutMs`. */
export async function waitForAnchor(anchor: Anchor, timeoutMs = 2000): Promise<HTMLElement | null> {
  const until = Date.now() + timeoutMs;
  for (;;) {
    const el = findAnchor(anchor);
    if (el || Date.now() > until) return el;
    await new Promise((r) => setTimeout(r, 100));
  }
}

/**
 * Presses an element the way a mouse does. React Aria controls take a plain
 * `click()`; Radix menus (the call row's +) open on pointerdown, so they get
 * the pointer sequence.
 */
export function pressElement(el: HTMLElement) {
  // A Radix menu trigger (aria-haspopup + data-state, even on a HeroUI button) opens on pointerdown alone.
  if (el.getAttribute('aria-haspopup') && el.hasAttribute('data-state')) {
    const Pointer = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Pointer('pointerdown', { bubbles: true, cancelable: true, button: 0, pointerType: 'mouse', isPrimary: true }));
    return;
  }
  // React Aria (HeroUI) handles a plain click as a virtual press; synthetic pointer events would leave it mid-press.
  if (el.closest('[data-react-aria-pressable]') || el.getAttribute('role') === 'option' || el.getAttribute('role') === 'menuitem') {
    el.click();
    return;
  }
  const opts = { bubbles: true, cancelable: true, button: 0, buttons: 1, pointerType: 'mouse', isPrimary: true } as const;
  const Pointer = typeof PointerEvent !== 'undefined' ? PointerEvent : MouseEvent;
  el.dispatchEvent(new Pointer('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new Pointer('pointerup', { ...opts, buttons: 0 }));
  el.dispatchEvent(new MouseEvent('mouseup', { ...opts, buttons: 0 }));
  el.click();
}

/** Clicks each anchor in turn, waiting for it to appear (a menu opening). */
export async function clickSequence(anchors: Anchor[]): Promise<boolean> {
  for (const anchor of anchors) {
    const el = await waitForAnchor(anchor);
    if (!el) return false;
    pressElement(el);
    await new Promise((r) => setTimeout(r, 250));
  }
  return true;
}
