import type { Event, Post } from '@/app/types';
import type { UnitPosition, UnitTracking } from '@/lib/unitTracking';
import { alongRoute, metres, PRACTICE_MAP } from './practiceMap';
import type { TrackingScript } from './types';

/**
 * A scripted stand-in for TAK in training: positions computed from the board
 * itself, so what a trainee does shows up on the map the way it would with
 * real devices. A unit sits at its post; once dispatched it walks from its
 * post to the call over `TRAVEL_SEC`, along its path from the training map
 * when it has one that ends near there; `wandering` units loop near their
 * post; a unit for which `stale` returns true stops reporting (its marker
 * fades and its Location becomes editable again).
 */

const TRAVEL_SEC = 45;
/** A team uses its map path when the path ends this close to where it is going. */
const PATH_END_METRES = 150;

type LatLng = { lat: number; lng: number };

/** The way from home to target: through the team's path when it leads there, otherwise straight. */
export function travelRoute(home: LatLng, target: LatLng, path: LatLng[] | undefined): LatLng[] {
  if (!path?.length || metres(path[path.length - 1], target) > PATH_END_METRES) return [home, target];
  return [home, ...path, target].filter((p, i, all) => i === 0 || metres(all[i - 1], p) > 1);
}

function postCoords(event: Event): Map<string, LatLng> {
  const out = new Map<string, LatLng>();
  const posts: Post[] = [...(event.eventPosts || []), ...(event.venue?.posts || [])];
  for (const p of posts) {
    if (typeof p === 'string' || p.lat == null || p.lng == null) continue;
    out.set(p.name.trim().toLowerCase(), { lat: p.lat, lng: p.lng });
  }
  return out;
}


export interface FeedOptions {
  label?: string;
  /** Show an extension's map panel on practice data, when the build has one. */
  panel?: boolean;
  /** Units that walk a small loop around their post. */
  wandering?: string[];
  /** Whether a unit's device has stopped reporting, from the board's state. */
  stale?: (unit: string, event: Event, elapsedSec: number) => boolean;
  /** Team name to the route it travels along; defaults to the training map's TAK paths. */
  paths?: Record<string, LatLng[]>;
}

export function scriptedTakFeed(options: FeedOptions = {}): TrackingScript {
  const paths = options.paths ?? PRACTICE_MAP.paths;
  return {
    label: options.label ?? 'Practice positions (no real TAK server)',
    tickMs: 1500,
    panel: options.panel,
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
          pos = alongRoute(travelRoute(home, target, paths[unit.team]), f);
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
