import type { Event, Post } from '@/app/types';
import type { UnitPosition, UnitTracking } from '@/lib/unitTracking';
import type { TrackingScript } from './types';

/**
 * A scripted stand-in for TAK in training: positions computed from the board
 * itself, so what a trainee does shows up on the map the way it would with
 * real devices. A unit sits at its post; once dispatched it walks from its
 * post to the call over `TRAVEL_SEC`; `wandering` units loop near their
 * post; a unit for which `stale` returns true stops reporting (its marker
 * fades and its Location becomes editable again).
 */

const TRAVEL_SEC = 45;

type LatLng = { lat: number; lng: number };

function postCoords(event: Event): Map<string, LatLng> {
  const out = new Map<string, LatLng>();
  const posts: Post[] = [...(event.eventPosts || []), ...(event.venue?.posts || [])];
  for (const p of posts) {
    if (typeof p === 'string' || p.lat == null || p.lng == null) continue;
    out.set(p.name.trim().toLowerCase(), { lat: p.lat, lng: p.lng });
  }
  return out;
}

const lerp = (a: LatLng, b: LatLng, f: number): LatLng => ({ lat: a.lat + (b.lat - a.lat) * f, lng: a.lng + (b.lng - a.lng) * f });

export interface FeedOptions {
  label?: string;
  /** Show the TAK module's map panel on practice data (builds with TAK only). */
  takPanel?: boolean;
  /** Units that walk a small loop around their post. */
  wandering?: string[];
  /** Whether a unit's device has stopped reporting, from the board's state. */
  stale?: (unit: string, event: Event, elapsedSec: number) => boolean;
}

export function scriptedTakFeed(options: FeedOptions = {}): TrackingScript {
  return {
    label: options.label ?? 'Practice positions (no real TAK server)',
    tickMs: 1500,
    takPanel: options.takPanel,
    at(elapsedSec: number, event: Event): UnitTracking {
      const coords = postCoords(event);
      const find = (name?: string) => (name ? coords.get(name.trim().toLowerCase()) : undefined);
      const positions: Record<string, UnitPosition> = {};
      const atPost: Record<string, string> = {};
      const now = Date.now();

      for (const unit of [...(event.staff || []), ...(event.supervisor || [])]) {
        const home = find(unit.originalPost) ?? find(unit.location);
        const target = find(unit.location);
        let pos = target ?? home;
        if (!pos) continue;
        const moving = ['En Route', 'On Scene', 'Transporting', 'En Route Eq', 'Assisting'].includes(unit.status);
        if (moving && home && target) {
          const since = unit.statusSince ?? now;
          const f = unit.status === 'En Route' ? Math.min(1, (now - since) / 1000 / TRAVEL_SEC) : 1;
          pos = lerp(home, target, f);
        } else if (options.wandering?.includes(unit.team)) {
          const a = (elapsedSec / 40) * Math.PI * 2;
          pos = { lat: pos.lat + Math.sin(a) * 0.00025, lng: pos.lng + Math.cos(a) * 0.00035 };
          if (Math.abs(Math.sin(a)) < 0.3) atPost[unit.team] = unit.location;
        } else if (!moving && unit.location) {
          atPost[unit.team] = unit.location;
        }
        positions[unit.team] = { lat: pos.lat, lon: pos.lng, stale: !!options.stale?.(unit.team, event, elapsedSec) };
      }
      return { positions, alignments: {}, atPost };
    },
  };
}
