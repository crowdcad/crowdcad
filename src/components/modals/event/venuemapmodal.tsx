'use client';
import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { MapPin, ShieldPlus, ShieldUser, Briefcase, HousePlus, ArrowBigDown } from 'lucide-react';
import { Post, Staff, Supervisor, Equipment, Layer, Call, Clinic } from '@/app/types';
import { isClinicPost } from '@/lib/clinics';
import { getEquipmentIconType } from '@/lib/equipmentIcon';
import { getStatusColor } from '@/lib/statusColors';
import { STATUS_COLORS_HEX } from '@/lib/colorTokens';
import VenueMapZones from '@/components/venue-management/VenueMapZones';
import type { UnitTracking } from '@/lib/unitTracking';
import { latLonToPercent } from '@/lib/geo/affine';
import { layerAlignment } from '@/lib/geo/layers';
import { equipmentAnchor } from '@/lib/equipmentPlacement';
import { describeCustody } from '@/lib/equipmentCustody';

function StatusTimer({ since }: { since: number }) {
  const [elapsed, setElapsed] = React.useState(0);

  React.useEffect(() => {
    setElapsed(Math.floor((Date.now() - since) / 1000));
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - since) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [since]);

  const minutes = Math.floor(elapsed / 60);
  const seconds = elapsed % 60;
  return (
    <span className="ui-timer">
      {minutes.toString().padStart(2, '0')}:{seconds.toString().padStart(2, '0')}
    </span>
  );
}

function isPostObject(post: unknown): post is { name: string; x: number; y: number } {
  return (
    typeof post === "object" &&
    post !== null &&
    "name" in post &&
    "x" in post &&
    "y" in post
  );
}

export interface ImageRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PostMarkerProps {
  post: Post;
  rect: ImageRect;
  staff: Staff[];
  scale: number;
  /** True when this post was just navigated to (e.g. via the Map tab's location search) — draws a brief attention ring around it. */
  isSelected?: boolean;
  /** Clicking the pin toggles a small "Add Call" button beneath it; provided only where a Call actually makes sense (the dispatch board). */
  onAddCall?: (postName: string) => void;
}

/** How much a marker grows on hover or selection. */
const MARKER_ENLARGE = 1.15;

/**
 * Closes something a marker has open (its info card or Add Call popup) on any
 * pointer-down outside it: a click or tap elsewhere, or starting to pan the
 * map. Pointer events, so a touch pan closes it too.
 */
function useCloseOnOutsidePointer(ref: React.RefObject<HTMLElement | null>, open: boolean, setOpen: (open: boolean) => void) {
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [ref, open, setOpen]);
}

/**
 * A marker's info card, shown while it's hovered (or tapped, on touch). It
 * renders inside the marker, so it moves with the point as the map pans and
 * zooms, and closes like the Add Call popup (useCloseOnOutsidePointer).
 */
function MarkerCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-none absolute whitespace-nowrap rounded-md bg-surface-deepest/95 px-2 py-1 text-xs text-surface-light shadow-lg"
      // Beside the marker; undoes the marker's hover enlarge so the card stays its normal size.
      style={{ left: '100%', top: 0, marginLeft: 10, transform: `scale(${1 / MARKER_ENLARGE})`, transformOrigin: 'left top' }}
    >
      {children}
    </div>
  );
}

function MarkerCardTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: 4 }}>{children}</div>;
}

export function PostMarker({ post, rect, scale, isSelected, onAddCall }: PostMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const markerRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsidePointer(markerRef, expanded, setExpanded);
  useCloseOnOutsidePointer(markerRef, hovered, setHovered);

  if (!isPostObject(post)) return null;

  const { x, y, width, height } = rect;
  const left = x + (post.x / 100) * width;
  const top = y + (post.y / 100) * height;

  // Check if this is a clinic location
  const isClinic = isClinicPost(post);
  const Icon = isClinic ? HousePlus : MapPin;
  const iconSize = isClinic ? 26 : 22;
  const emphasis = (hovered ? MARKER_ENLARGE : 1) / scale;

  return (
    <div
      ref={markerRef}
      style={{
        position: "absolute",
        left: `${left}px`,
        top: `${top}px`,
        // Counter-scale against the map's ambient zoom so the pin stays a
        // constant on-screen size instead of growing/shrinking with it —
        // the position offset above still tracks the zoomed map correctly
        // since it's computed pre-scale, same as every other marker here.
        transform: `translate(-50%, -50%) scale(${emphasis})`,
        transformOrigin: 'center center',
        // A selected/expanded post needs to clear every other marker on the
        // map regardless of DOM order, not just sit above its own
        // immediate neighbors.
        zIndex: isSelected || expanded || hovered ? 999 : 12,
        cursor: "pointer",
        transition: 'transform 0.15s ease-out',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (onAddCall) setExpanded((v) => !v);
      }}
    >
      {isSelected && (
        // Centering (-translate-x-1/2) and the bounce both animate `transform`,
        // so they can't share one element — Tailwind's animate-bounce keyframes
        // only set translateY and would silently replace the centering
        // translateX for the whole time it runs. The wrapper centers; only the
        // icon inside it bounces.
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: '100%', marginBottom: 2 }}>
          <ArrowBigDown
            className="animate-bounce"
            size={40}
            strokeWidth={1.5}
            fill="#f97316"
            stroke="white"
            style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.6))' }}
          />
        </div>
      )}
      <Icon
        size={iconSize}
        strokeWidth={1.5}
        stroke="white"
        fill="hsl(var(--map-marker))"
        style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.6))' }}
      />

      {expanded && onAddCall && (
        // marginBottom clears the bouncing attention arrow above (see
        // isSelected below) when both happen to be showing at once — it sits
        // in this same bottom:100% spot, just further out.
        <div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
          style={{ bottom: '100%', marginBottom: isSelected ? 48 : 6 }}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddCall(post.name);
              setExpanded(false);
            }}
            className="rounded-full bg-surface-deepest/95 px-3 py-1 text-xs font-semibold text-surface-light shadow-lg hover:bg-surface-deep"
          >
            Add Call
          </button>
        </div>
      )}

            {hovered && (
        <MarkerCard>
          {post.name}
        </MarkerCard>
      )}
    </div>
  );
}

function getEquipmentIcon(equipment: Equipment) {
  return getEquipmentIconType(equipment.name);
}

// 'wheelchair'/'stretcher' are separate raster assets (not lucide icons), so
// unlike every other marker on the map they can't take a fill/stroke prop —
// recoloring them to match would mean editing those SVG files directly.
// They keep their original white-on-transparent look; the status color and
// white border now live on the circular badge these sit inside of
// (EquipmentMarker), not on the icon itself.
function EquipmentIcon({ type, size = 16 }: { type: string; size?: number }) {
  if (type === 'wheelchair') {
    return <Image src="/map/wheelchair.svg" alt="Wheelchair" width={size} height={size} draggable={false} />;
  }
  if (type === 'stretcher') {
    return <Image src="/map/gurney.svg" alt="Gurney" width={size} height={size} draggable={false} />;
  }
  // 'aed' and the default case: plain white glyph, same as the raster icons above.
  return <Briefcase size={size} strokeWidth={1.75} stroke="white" fill="none" />;
}

function getContainedImageRect(containerW: number, containerH: number, naturalW: number, naturalH: number) {
  if (!containerW || !containerH || !naturalW || !naturalH) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }
  const containerAR = containerW / containerH;
  const imageAR = naturalW / naturalH;

  if (imageAR > containerAR) {
    const width = containerW;
    const height = width / imageAR;
    const x = 0;
    const y = (containerH - height) / 2;
    return { x, y, width, height };
  } else {
    const height = containerH;
    const width = height * imageAR;
    const x = (containerW - width) / 2;
    const y = 0;
    return { x, y, width, height };
  }
}

// Equipment marker - static display only
interface EquipmentMarkerProps {
  equipment: Equipment;
  post: Post;
  rect: ImageRect;
  scale: number;
  /** True when this equipment item was just navigated to (e.g. via its card's "view on map" button) — draws the same attention arrow/enlarge a selected post gets. */
  isSelected?: boolean;
  /** Position among the equipment at this post (equipmentStaggerIndices); each one after the first steps a little to the right. */
  staggerIndex?: number;
  /** Drawn faded: the unit carrying it has a stale live position. */
  faded?: boolean;
}

/** Each equipment item's place among the items at the same location, so markers sharing a post can be staggered. */
export function equipmentStaggerIndices(equipment: Equipment[]): Map<string, number> {
  const seen: Record<string, number> = {};
  const out = new Map<string, number>();
  for (const equip of equipment) {
    if (!equip.location) continue;
    const i = seen[equip.location] ?? 0;
    seen[equip.location] = i + 1;
    out.set(equip.id, i);
  }
  return out;
}

export function EquipmentMarker({
  equipment,
  post,
  rect,
  scale,
  isSelected,
  staggerIndex = 0,
  faded = false,
}: EquipmentMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const markerRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsidePointer(markerRef, hovered, setHovered);

  const postIsValid = isPostObject(post);
  if (!postIsValid) return null;

  // Position equipment marker. Like TeamMarker's own offset, this is in the
  // map's pre-zoom coordinate space, which the ambient container transform
  // (scale(scale), see VenueMapWithPosts) then multiplies by `scale` again —
  // dividing by `scale` here cancels that out, so the on-screen distance
  // from the post stays constant across zoom levels instead of growing the
  // more you zoom in (a flat pixel offset would, since it wasn't
  // compensating for the ambient scale at all).
  const equipmentOffset = 12 / scale;
  // More equipment at the same post steps right one at a time, counter-scaled like TeamMarker's stagger.
  const staggerStep = (14 * staggerIndex) / scale;
  const left = rect.x + (post.x / 100) * rect.width - equipmentOffset + staggerStep;
  const top = rect.y + (post.y / 100) * rect.height + equipmentOffset;

  const iconType = getEquipmentIcon(equipment);
  const badgeColor = getEquipmentMarkerColor(equipment);
  // Same hover/selected enlarge as every other marker (see PostMarker).
  const emphasis = (hovered || isSelected ? MARKER_ENLARGE : 1) / scale;


  return (
    <div
      ref={markerRef}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        // Counter-scale against ambient map zoom so the icon stays a
        // constant on-screen size, same treatment as PostMarker/TeamMarker.
        transform: `translate(-50%, -50%) scale(${emphasis})`,
        transformOrigin: 'center center',
        zIndex: isSelected || hovered ? 999 : 15,
        cursor: 'pointer',
        transition: 'transform 0.15s ease-out',
        opacity: faded ? 0.45 : 1,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {isSelected && (
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: '100%', marginBottom: 2 }}>
          <ArrowBigDown
            className="animate-bounce"
            size={40}
            strokeWidth={1.5}
            fill="#f97316"
            stroke="white"
            style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.6))' }}
          />
        </div>
      )}
      <div
        style={{
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: badgeColor,
          border: '2px solid white',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.6))',
        }}
      >
        <EquipmentIcon type={iconType} />
      </div>
            {hovered && (
        <MarkerCard>
          <MarkerCardTitle>{equipment.name}</MarkerCardTitle>
          <div><strong>Status:</strong> {equipment.status}</div>
          {equipment.phase && equipment.holder ? (
            <div>{describeCustody({ phase: equipment.phase, holder: equipment.holder }, equipment.assignedTeam)}</div>
          ) : (
            <>
              <div><strong>Assigned Team:</strong> {equipment.assignedTeam || 'None'}</div>
              <div><strong>Location:</strong> {equipment.location || 'Unknown'}</div>
            </>
          )}
        </MarkerCard>
      )}
    </div>
  );
}

// Shared by TeamMarker and SupervisorMarker — Staff and Supervisor both
// carry a plain `status` string, so one status→color mapping covers both.
function getTeamMarkerColors(team: { status: string }) {
  let color = '#2300a1ff';
  const outline = '2px solid white';

  // Same "carrying/delivering equipment" convention calltracking.tsx's
  // status chips use (getStatusColor's 'text-status-orange' group: En Route
  // Eq, Assisting, Delivered Eq) — checked first since e.g. 'Assisting'
  // isn't in any of the other buckets below and would otherwise fall
  // through to the default color.
  if (getStatusColor(team.status).textClass === 'text-status-orange') {
    color = STATUS_COLORS_HEX.orange;
  } else if (team.status === 'Available') {
    color = '#4cb600ff';
  } else if (team.status === 'On Break') {
    color = 'grey';
  } else if (
    team.status === 'En Route' ||
    team.status === 'On Scene' ||
    team.status === 'Transporting'
  ) {
    color = 'red';
  }

  return { color, outline };
}

/** Same green/grey/orange/red/default convention as team markers, applied to an equipment item's own status. */
function getEquipmentMarkerColor(equipment: Equipment): string {
  const status = equipment.status || '';
  if (status.startsWith('Call ') || status === 'In Use') return 'red';
  if (status === 'In Clinic') return 'grey';
  if (status === 'Available') return '#4cb600ff';
  return '#2300a1ff';
}

// function getTeamMarkerText(team: Staff) {
//   if (team.sam && /^SAM\d+$/.test(team.team)) {
//     const number = team.team.replace('SAM', '');
//     return `S${number}`;
//   }
//   return team.team.slice(-1);
// }

interface TeamMarkerProps {
  team: Staff;
  post: Post;
  rect: ImageRect;
  teamTimers: { [team: string]: number };
  calls: Call[];
  clinics: Clinic[];
  scale: number;
  /** True when this team was just navigated to (e.g. via a team card's "view on map" button) — draws the same attention arrow a selected post gets. */
  isSelected?: boolean;
  /** Clicking the icon toggles a small "Add Call" button beneath it, prefilled with this team already assigned. */
  onAddCall?: (teamName: string) => void;
  /** How many other teams at this same post were already placed before this one (0 for the first) — staggers each additional team a bit further right so a shared post/call doesn't stack their pins on top of each other. */
  staggerIndex?: number;
  /** Drawn exactly at `post`'s position (a live position, D66) rather than offset beside a post pin. */
  exact?: boolean;
  /** Drawn faded (a live position that hasn't been updated for a while). */
  faded?: boolean;
  /** Show the team's post in its card. Off when the event has no posting schedule. */
  showPosts?: boolean;
}

export function TeamMarker({
  team,
  post,
  rect,
  teamTimers,
  calls,
  scale,
  isSelected,
  onAddCall,
  staggerIndex = 0,
  exact = false,
  faded = false,
  showPosts = true,
}: TeamMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const markerRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsidePointer(markerRef, expanded, setExpanded);
  useCloseOnOutsidePointer(markerRef, hovered, setHovered);

  const postIsValid = isPostObject(post);
  if (!postIsValid) return null;

  // Stagger the team marker from its post's center. This offset is in the
  // map's pre-zoom coordinate space, which the ambient container transform
  // (scale(scale), see VenueMapWithPosts) then multiplies by `scale` again —
  // dividing by `scale` here cancels that back out, so the on-screen gap
  // between a team and its post stays a constant size across zoom levels
  // (same treatment as the icon's own counter-scale below), instead of
  // growing when zoomed out and shrinking when zoomed in.
  const teamOffset = exact ? 0 : 10 / scale;
  // Extra teams sharing this exact post (e.g. several teams attached to the
  // same call) step further right one at a time, also counter-scaled so the
  // on-screen spacing between them stays constant too.
  const staggerStep = (20 * staggerIndex) / scale;
  const left = rect.x + (post.x / 100) * rect.width + teamOffset + staggerStep;
  const top = rect.y + (post.y / 100) * rect.height - teamOffset;

  const { color } = getTeamMarkerColors(team);

  const activeCall = calls.find(c =>
    c.assignedTeam?.includes(team.team) && !['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release'].includes(c.status)
  );
  const statusLabel = team.status || 'Unknown';

  // Same hover/selected enlarge as every other marker (see PostMarker).
  const emphasis = (hovered || isSelected ? MARKER_ENLARGE : 1) / scale;


  return (
    <div
      ref={markerRef}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        // Counter-scale against ambient map zoom so the icon stays a
        // constant on-screen size, same treatment as PostMarker/EquipmentMarker.
        transform: `translate(-50%, -50%) scale(${emphasis})`,
        transformOrigin: 'center center',
        zIndex: isSelected || expanded || hovered ? 999 : 25,
        opacity: faded ? 0.45 : 1,
        cursor: 'pointer',
        transition: 'transform 0.15s ease-out',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        if (onAddCall) setExpanded((v) => !v);
      }}
    >
      {isSelected && (
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: '100%', marginBottom: 2 }}>
          <ArrowBigDown
            className="animate-bounce"
            size={40}
            strokeWidth={1.5}
            fill="#f97316"
            stroke="white"
            style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.6))' }}
          />
        </div>
      )}
      <ShieldPlus
        size={26}
        strokeWidth={1.5}
        stroke="white"
        fill={color}
        style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.6))' }}
      />
      {expanded && onAddCall && (
        // marginBottom clears the bouncing attention arrow above (see
        // isSelected below) when both happen to be showing at once — it sits
        // in this same bottom:100% spot, just further out.
        <div
          className="absolute left-1/2 -translate-x-1/2 whitespace-nowrap"
          style={{ bottom: '100%', marginBottom: isSelected ? 48 : 6 }}
        >
          <button
            type="button"
            disabled={!!activeCall}
            title={activeCall ? `${team.team} is already on a call` : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (activeCall) return;
              onAddCall(team.team);
              setExpanded(false);
            }}
            className="rounded-full bg-surface-deepest/95 px-3 py-1 text-xs font-semibold text-surface-light shadow-lg hover:bg-surface-deep disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface-deepest/95"
          >
            Add Call
          </button>
        </div>
      )}
            {hovered && (
        <MarkerCard>
          <MarkerCardTitle>{team.team}</MarkerCardTitle>
          <div><strong>Status:</strong> {statusLabel}</div>
          {showPosts && <div><strong>Post:</strong> {team.location || 'Unassigned'}</div>}
          <div>
            <strong>Status Timer:</strong>{' '}
            {typeof teamTimers[team.team] === 'number' ? <StatusTimer since={teamTimers[team.team]} /> : <span className="ui-timer">00:00</span>}
          </div>
        </MarkerCard>
      )}
    </div>
  );
}

interface SupervisorMarkerProps {
  supervisor: Supervisor;
  post: Post;
  rect: ImageRect;
  scale: number;
  /** True when this supervisor was just navigated to (e.g. via their card's "view on map" button) — draws the same attention arrow/enlarge a selected post gets. */
  isSelected?: boolean;
  /** Drawn exactly at `post`'s position (a live position, D66) rather than offset beside a post pin. */
  exact?: boolean;
  faded?: boolean;
  /** Show the supervisor's post in their card. Off when the event has no posting schedule. */
  showPosts?: boolean;
}

export function SupervisorMarker({ supervisor, post, rect, scale, isSelected, exact = false, faded = false, showPosts = true }: SupervisorMarkerProps) {
  const [hovered, setHovered] = useState(false);
  const markerRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsidePointer(markerRef, hovered, setHovered);

  const postIsValid = isPostObject(post);
  if (!postIsValid) return null;

  // Offset down-right from the post — the opposite corner from TeamMarker's
  // up-right and EquipmentMarker's down-left — so a team, supervisor, and
  // equipment item sharing the exact same post don't stack on top of each
  // other. Counter-scaled the same way as the other markers' offsets so the
  // on-screen gap stays constant across zoom levels.
  const supervisorOffset = exact ? 0 : 10 / scale;
  const left = rect.x + (post.x / 100) * rect.width + supervisorOffset;
  const top = rect.y + (post.y / 100) * rect.height + supervisorOffset;

  const { color } = getTeamMarkerColors(supervisor);
  // Same hover/selected enlarge as every other marker (see PostMarker).
  const emphasis = (hovered || isSelected ? MARKER_ENLARGE : 1) / scale;


  return (
    <div
      ref={markerRef}
      style={{
        position: 'absolute',
        left: `${left}px`,
        top: `${top}px`,
        // Counter-scale against ambient map zoom so the icon stays a
        // constant on-screen size, same treatment as every other marker.
        transform: `translate(-50%, -50%) scale(${emphasis})`,
        transformOrigin: 'center center',
        zIndex: isSelected || hovered ? 999 : 25,
        opacity: faded ? 0.45 : 1,
        cursor: 'default',
        transition: 'transform 0.15s ease-out',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {isSelected && (
        <div className="absolute left-1/2 -translate-x-1/2" style={{ bottom: '100%', marginBottom: 2 }}>
          <ArrowBigDown
            className="animate-bounce"
            size={40}
            strokeWidth={1.5}
            fill="#f97316"
            stroke="white"
            style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.6))' }}
          />
        </div>
      )}
      <ShieldUser
        size={26}
        strokeWidth={1.5}
        stroke="white"
        fill={color}
        style={{ filter: 'drop-shadow(0 1px 3px rgb(0 0 0 / 0.6))' }}
      />
            {hovered && (
        <MarkerCard>
          <MarkerCardTitle>{supervisor.team}</MarkerCardTitle>
          <div><strong>Status:</strong> {supervisor.status || 'Unknown'}</div>
          {showPosts && <div><strong>Post:</strong> {supervisor.location || 'Unassigned'}</div>}
        </MarkerCard>
      )}
    </div>
  );
}

/** Optional add-on layer for the map, e.g. TAK live tracking. Omitted, the map renders exactly as before. */
export interface MapOverlay {
  /** Rendered inside the zoomed/panned map, like the built-in markers. `rect` is the image's contained rect in container pixels. */
  markers?: (ctx: { layer: Layer | undefined; layerIndex: number; rect: { x: number; y: number; width: number; height: number }; scale: number }) => React.ReactNode;
  /** Rendered above the map, unscaled (panels, badges). */
  chrome?: React.ReactNode;
  /** On the dispatch Map tab, compact controls for an image layer, shown in the top bar beside the location search. */
  toolbar?: (ctx: { layer: Layer | undefined; layerIndex: number }) => React.ReactNode;
  /**
   * Live unit positions (a TAK event, D66). When given, team and supervisor markers are drawn only at these
   * positions, never beside the post named by their Location; post pins are unchanged.
   */
  unitTracking?: UnitTracking;
  /**
   * On the live map of a geo layer (P8, D64), content rendered inside the map, where it can add its own pins with
   * GeoPins (src/components/geo/BasemapView.tsx). Image layers use `markers` instead.
   */
  geoMarkers?: (ctx: { layer: Layer | undefined; layerIndex: number }) => React.ReactNode;
  /**
   * Rendered beneath the map image, inside the zoomed/panned map (e.g. a basemap). `container` is the map box in
   * unscaled pixels. `setImageOpacity` lets it fade the image so what is beneath shows through; the image returns to
   * fully opaque when no underlay is given.
   */
  underlay?: (ctx: {
    layer: Layer | undefined;
    layerIndex: number;
    rect: { x: number; y: number; width: number; height: number };
    container: { width: number; height: number };
    scale: number;
    setImageOpacity: (opacity: number) => void;
  }) => React.ReactNode;
}

export interface VenueMapWithPostsProps {
  layers: Layer[];
  currentLayer: number;
  staff: Staff[];
  supervisor?: Supervisor[];
  equipment?: Equipment[];
  teamTimers: { [team: string]: number };
  calls?: Call[];
  clinics?: Clinic[];
  onNaturalSize?: (w: number, h: number) => void;
  isOpen?: boolean;
  scale: number;
  position: { x: number; y: number };
  isPanning: boolean;
  onMouseDown: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseMove: (e: React.MouseEvent<HTMLDivElement>) => void;
  onMouseUp: () => void;
  onWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  /** Touch counterpart of the mouse handlers above — one finger pans, two
   *  fingers pinch to zoom. Optional since not every caller (e.g. event
   *  creation's own hand-rolled pan/zoom state) wires these up. */
  onTouchStart?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onTouchMove?: (e: React.TouchEvent<HTMLDivElement>) => void;
  onTouchEnd?: (e: React.TouchEvent<HTMLDivElement>) => void;
  imgRef: React.RefObject<HTMLImageElement | null>;
  /** Overrides the image container's default rounded-2xl corners — for a
   *  caller (e.g. event creation) whose map merges flush with UI beneath it. */
  imageRadiusClassName?: string;
  /** Name of a post on the current layer to draw a brief attention ring around — e.g. the dispatch Map tab's location search jumping to a result. */
  selectedPostName?: string | null;
  /** Name of a team on the current layer to draw the same attention arrow around — e.g. a team card's "view on map" button. */
  selectedTeamName?: string | null;
  /** Same, for a supervisor's "view on map" button. */
  selectedSupervisorName?: string | null;
  /** Same, for an equipment item's "view on map" button (matched by name, same identity equipment cards use elsewhere). */
  selectedEquipmentName?: string | null;
  /** Clicking a post pin shows a small "Add Call" button under it prefilled with that location; omit to disable (event creation/venue management have no Calls). */
  onAddCallAtPost?: (postName: string) => void;
  /** Same, but from clicking a team marker — prefills the assigned team instead of the location. */
  onAddCallForTeam?: (teamName: string) => void;
  /** Show posts in team and supervisor cards. Off when the event has no posting schedule. */
  showPosts?: boolean;
  /** Optional add-on layer (see MapOverlay). */
  overlay?: MapOverlay;
}

export function VenueMapWithPosts({
  layers,
  currentLayer,
  staff,
  supervisor = [],
  equipment = [],
  teamTimers,
  calls = [],
  clinics = [],
  onNaturalSize,
  isOpen,
  imageRadiusClassName = 'rounded-2xl',
  scale,
  position,
  isPanning,
  onMouseDown,
  onMouseMove,
  onMouseUp,
  onWheel,
  onTouchStart,
  onTouchMove,
  onTouchEnd,
  imgRef,
  selectedPostName,
  selectedTeamName,
  selectedSupervisorName,
  selectedEquipmentName,
  onAddCallAtPost,
  onAddCallForTeam,
  showPosts = true,
  overlay,
}: VenueMapWithPostsProps) {
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });
  const [naturalSize, setNaturalSize] = useState({ width: 0, height: 0 });
  const [imageLoaded, setImageLoaded] = useState(false);
  const [underlayImageOpacity, setUnderlayImageOpacity] = useState(1);
  const imageOpacity = overlay?.underlay ? underlayImageOpacity : 1;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const imgContainerRef = useRef<HTMLDivElement | null>(null);

  const mapUrl = layers[currentLayer]?.mapUrl || '';
  const posts = layers[currentLayer]?.posts || [];
  const equipmentStagger = equipmentStaggerIndices(equipment);

  // Update container size when component mounts and on resize
  useEffect(() => {
    function updateContainerSize() {
      if (containerRef.current) {
        const newSize = {
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        };
        setContainerSize(newSize);
      }
    }
    
    const updateWithDelay = () => {
      updateContainerSize();
      requestAnimationFrame(() => {
        updateContainerSize();
        setTimeout(updateContainerSize, 10);
        setTimeout(updateContainerSize, 50);
      });
    };
    
    updateWithDelay();
    
    window.addEventListener("resize", updateContainerSize);
    return () => window.removeEventListener("resize", updateContainerSize);
  }, []);

  // Re-measure container when modal opens (for initial render)
  useEffect(() => {
    if (!isOpen) return;
    
    const measureContainer = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    
    const timers = [
      setTimeout(measureContainer, 0),
      setTimeout(measureContainer, 10),
      setTimeout(measureContainer, 50),
      setTimeout(measureContainer, 100),
    ];
    
    return () => timers.forEach(clearTimeout);
  }, [isOpen, mapUrl]);

  function handleImageLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const img = e.currentTarget;
    setNaturalSize({ width: img.naturalWidth, height: img.naturalHeight });
    setImageLoaded(true);
    onNaturalSize?.(img.naturalWidth, img.naturalHeight);
    
    const measureAfterImageLoad = () => {
      if (containerRef.current) {
        const newSize = {
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        };
        setContainerSize(newSize);
      }
    };
    
    measureAfterImageLoad();
    
    requestAnimationFrame(() => {
      measureAfterImageLoad();
      setTimeout(measureAfterImageLoad, 10);
      setTimeout(measureAfterImageLoad, 50);
    });
  }

  const rect = getContainedImageRect(
    containerSize.width,
    containerSize.height,
    naturalSize.width,
    naturalSize.height
  );

  const shouldRenderMarkers = imageLoaded && 
    rect.width > 0 && 
    rect.height > 0 && 
    containerSize.width > 0 && 
    containerSize.height > 0 &&
    naturalSize.width > 0 && 
    naturalSize.height > 0;

  useEffect(() => {
    if (shouldRenderMarkers && containerRef.current) {
      const measureOnce = () => {
        if (containerRef.current) {
          setContainerSize({
            width: containerRef.current.clientWidth,
            height: containerRef.current.clientHeight,
          });
        }
      };
      
      setTimeout(measureOnce, 5);
    }
  }, [shouldRenderMarkers]);

  return (
    <div 
      className="relative h-full w-full"
      style={{
        height: '100%',
        width: '100%',
      }}
    >
      <div
        ref={imgContainerRef}
        className={`relative overflow-hidden h-full w-full ${imageRadiusClassName}`}
        onWheel={onWheel}
        style={{
          cursor: isPanning ? 'grabbing' : 'grab',
          height: '100%',
          width: '100%',
        }}
      >
      <div
        ref={containerRef}
        className="relative"
        style={{
          transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          transition: isPanning ? 'none' : 'transform 0.1s ease-out',
          width: '100%',
          height: '100%',
          touchAction: onTouchStart ? 'none' : undefined,
          userSelect: 'none',
        }}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
        // A press anywhere on the map pans it. Without this, the browser can start its own drag of an image on
        // the map (or a text selection) instead, most often just beside the map image.
        onDragStart={(e) => e.preventDefault()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {/* An add-on underlay (see MapOverlay) sits beneath the image: z-index -1 within this transformed container. */}
        {overlay?.underlay && shouldRenderMarkers && (
          <div style={{ position: 'absolute', inset: 0, zIndex: -1, pointerEvents: 'none' }}>
            {overlay.underlay({
              layer: layers[currentLayer],
              layerIndex: currentLayer,
              rect,
              container: containerSize,
              scale,
              setImageOpacity: setUnderlayImageOpacity,
            })}
          </div>
        )}
        <Image
          ref={imgRef}
          src={mapUrl}
          alt="Venue Map"
          width={1200}
          height={800}
          style={{ width: '100%', height: '100%', objectFit: 'contain', userSelect: 'none', opacity: imageOpacity }}
          unoptimized
          onLoad={handleImageLoad}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
        />
        {/* Zone polygons render in their own rect-matched overlay, before
            (and beneath, via plain DOM order — no explicit z-index needed
            since post/team/supervisor/equipment markers below all carry
            their own) every marker layer. */}
        <div
          style={{
            position: 'absolute',
            left: rect.x,
            top: rect.y,
            width: rect.width,
            height: rect.height,
            pointerEvents: 'none',
          }}
        >
          <VenueMapZones zones={layers[currentLayer]?.zones || []} opacity={0.2} />
        </div>
        {shouldRenderMarkers && (
          <>
            {posts.map((post, i) => (
              <PostMarker
                key={i}
                post={post}
                rect={rect}
                staff={staff}
                scale={scale}
                isSelected={!!selectedPostName && typeof post === 'object' && post !== null && post.name === selectedPostName}
                onAddCall={onAddCallAtPost}
              />
            ))}
            {equipment.map((equip) => {
              // Drawn with its holder: a post, or beside the unit carrying it.
              const anchor = equipmentAnchor(equip, [...staff, ...supervisor], overlay?.unitTracking);
              let post: Post | undefined;
              let faded = false;
              if (anchor?.kind === 'post') {
                post = posts.find(p => (typeof p === "string" ? p : p.name) === anchor.post);
              } else if (anchor?.kind === 'point') {
                const layer = layers[currentLayer];
                const alignment = layer ? overlay?.unitTracking?.alignments[layer.id] ?? layerAlignment(layer) : undefined;
                const at = alignment && latLonToPercent(alignment, { lat: anchor.lat, lon: anchor.lon });
                if (at && at.x >= 0 && at.x <= 100 && at.y >= 0 && at.y <= 100) post = { name: equip.name, x: at.x, y: at.y };
                faded = anchor.faded;
              }
              if (!post || typeof post === "string") {
                return null;
              }

              return (
                <EquipmentMarker
                  key={equip.id}
                  equipment={equip}
                  post={post}
                  rect={rect}
                  scale={scale}
                  isSelected={!!selectedEquipmentName && equip.name === selectedEquipmentName}
                  staggerIndex={equipmentStagger.get(equip.id)}
                  faded={faded}
                />
              );
            })}
            {overlay?.unitTracking ? (() => {
              // Live tracking: each unit at its own position, or not at all (D66).
              const tracking = overlay.unitTracking;
              const layer = layers[currentLayer];
              const alignment = layer ? tracking.alignments[layer.id] ?? layerAlignment(layer) : undefined;
              if (!alignment) return null;
              const at = (name: string) => {
                const p = tracking.positions[name];
                if (!p) return null;
                const { x, y } = latLonToPercent(alignment, { lat: p.lat, lon: p.lon });
                return x < 0 || x > 100 || y < 0 || y > 100 ? null : { post: { name, x, y }, faded: p.stale };
              };
              return (
                <>
                  {staff.map((team) => {
                    const pos = at(team.team);
                    return pos && (
                      <TeamMarker
                        showPosts={showPosts}
                        key={team.team}
                        team={team}
                        post={pos.post}
                        rect={rect}
                        teamTimers={teamTimers}
                        calls={calls}
                        clinics={clinics}
                        scale={scale}
                        isSelected={!!selectedTeamName && team.team === selectedTeamName}
                        onAddCall={onAddCallForTeam}
                        exact
                        faded={pos.faded}
                      />
                    );
                  })}
                  {supervisor.map((sup) => {
                    const pos = at(sup.team);
                    return pos && (
                      <SupervisorMarker
                        showPosts={showPosts}
                        key={sup.team}
                        supervisor={sup}
                        post={pos.post}
                        rect={rect}
                        scale={scale}
                        isSelected={!!selectedSupervisorName && sup.team === selectedSupervisorName}
                        exact
                        faded={pos.faded}
                      />
                    );
                  })}
                </>
              );
            })() : (() => {
              // Teams sharing the exact same post (e.g. several teams
              // attached to the same call, all still logged at that post)
              // get staggered further right one at a time instead of
              // stacking on top of each other — see TeamMarker's staggerStep.
              const postOccupancy: { [postName: string]: number } = {};
              return staff.map((team) => {
                const postObj = posts.find(p => (typeof p === "string" ? p : p.name) === team.location);
                if (!postObj || typeof postObj === "string") return null;

                const staggerIndex = postOccupancy[team.location] ?? 0;
                postOccupancy[team.location] = staggerIndex + 1;

                return (
                  <TeamMarker
                    showPosts={showPosts}
                    key={team.team}
                    team={team}
                    post={postObj}
                    rect={rect}
                    teamTimers={teamTimers}
                    calls={calls}
                    clinics={clinics}
                    scale={scale}
                    isSelected={!!selectedTeamName && team.team === selectedTeamName}
                    onAddCall={onAddCallForTeam}
                    staggerIndex={staggerIndex}
                  />
                );
              });
            })()}
            {!overlay?.unitTracking && supervisor.map((sup) => {
              const postObj = posts.find(p => (typeof p === "string" ? p : p.name) === sup.location);
              if (!postObj || typeof postObj === "string") return null;

              return (
                <SupervisorMarker
                  showPosts={showPosts}
                  key={sup.team}
                  supervisor={sup}
                  post={postObj}
                  rect={rect}
                  scale={scale}
                  isSelected={!!selectedSupervisorName && sup.team === selectedSupervisorName}
                />
              );
            })}
          </>
        )}
        {overlay?.markers && shouldRenderMarkers &&
          overlay.markers({ layer: layers[currentLayer], layerIndex: currentLayer, rect, scale })}
      </div>
      </div>
      {overlay?.chrome}
    </div>
  );
}
