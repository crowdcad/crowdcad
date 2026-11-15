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
