'use client';
import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { Post, Staff, Supervisor, Equipment, Layer, Call, Clinic, Vehicle } from '@/app/types';
import { isClinicPost } from '@/lib/clinics';
import { getEquipmentIconType } from '@/lib/equipmentIcon';
import VenueMapZones from '@/components/venue-management/VenueMapZones';
import type { UnitTracking } from '@/lib/unitTracking';
import { fromLocalMeters, latLonToPercent } from '@/lib/geo/affine';
import { layerAlignment } from '@/lib/geo/layers';
import { describeCustody } from '@/lib/equipmentCustody';
import { postSymbol } from '@/components/geo/postIcon';
import { callDisplayNumbers, callSpots, isOpenCall } from '@/lib/callMap';
import { MAP_INK } from '@/lib/colorTokens';
import {
  AnchorDot,
  LeaderLines,
  MapSymbol,
  SYMBOL_BOX,
  equipmentInk,
  fanPoints,
  ringPoints,
  symbolTop,
  unitInk,
  type MapSymbolKind,
  type MapSymbolProps,
} from '@/components/geo/mapSymbol';
import { equipmentLayout, unitGroups, type MapAnchor } from '@/lib/mapLayout';
import { vehicleOfUnit } from '@/lib/vehicles';

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
    <span className="ui-timer !top-0">
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

/** Where a marker's anchor is, in the map's own (unscaled) pixels. On a live-map pin it is 0,0. */
export interface MarkerAt {
  left: number;
  top: number;
}

/** A shift from the anchor in screen pixels, the same at every zoom. */
export interface Offset {
  dx: number;
  dy: number;
}

export const AT_ANCHOR: Offset = { dx: 0, dy: 0 };
export const AT_PIN: MarkerAt = { left: 0, top: 0 };

/** A point on an image given in percent of `rect`. */
export const atPercent = (rect: ImageRect, x: number, y: number): MarkerAt => ({ left: rect.x + (x / 100) * rect.width, top: rect.y + (y / 100) * rect.height });

/**
 * Each kind's corner beside a post or a call's dropped pin, so the post's own
 * pin (drawn above its spot), its units, its equipment and its calls never
 * cover each other.
 */
export const SLOTS = {
  team: { dx: 20, dy: -14 },
  supervisor: { dx: 20, dy: 14 },
  equipment: { dx: -18, dy: 12 },
  call: { dx: -24, dy: -14 },
} satisfies Record<string, Offset>;

const plus = (a: Offset, b: Offset): Offset => ({ dx: a.dx + b.dx, dy: a.dy + b.dy });

/** How much a marker grows on hover, about the spot it marks (a post's tip, anything else's center). */
const MARKER_ENLARGE = 1.3;

const MARKER_BUTTON =
  'rounded-full bg-surface-deepest/95 px-3 py-1 text-xs font-semibold text-surface-light shadow-lg hover:bg-surface-deep disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-surface-deepest/95';

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

function useMarkerState() {
  const [hovered, setHovered] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useCloseOnOutsidePointer(ref, expanded, setExpanded);
  useCloseOnOutsidePointer(ref, hovered, setHovered);
  return { hovered, setHovered, expanded, setExpanded, ref };
}

interface MarkerBoxProps {
  at: MarkerAt;
  scale: number;
  offset?: Offset;
  grow?: boolean;
  z: number;
  boxRef?: React.Ref<HTMLDivElement>;
  onHover?: (hovered: boolean) => void;
  onClick?: () => void;
  testId?: string;
  attrs?: Record<string, string | number | boolean | undefined>;
  children: React.ReactNode;
}

/**
 * A marker's box: a SYMBOL_BOX square centered on its anchor (plus `offset`),
 * counter-scaled against the map's zoom so it stays one size on screen. It
 * grows about its center, the spot it marks. Only the symbol's painted shapes
 * take the pointer, not the empty box around them.
 */
function MarkerBox({ at, scale, offset = AT_ANCHOR, grow, z, boxRef, onHover, onClick, testId, attrs, children }: MarkerBoxProps) {
  return (
    <div
      ref={boxRef}
      data-testid={testId}
      {...attrs}
      style={{
        position: 'absolute',
        left: at.left + offset.dx / scale,
        top: at.top + offset.dy / scale,
        width: SYMBOL_BOX,
        height: SYMBOL_BOX,
        marginLeft: -SYMBOL_BOX / 2,
        marginTop: -SYMBOL_BOX / 2,
        transform: `scale(${(grow ? MARKER_ENLARGE : 1) / scale})`,
        transformOrigin: 'center center',
        transition: 'transform 0.15s ease-out',
        zIndex: z,
        pointerEvents: 'none',
        cursor: onClick ? 'pointer' : 'default',
      }}
      onPointerEnter={onHover ? () => onHover(true) : undefined}
      // A press on a marker can start a map pan, which takes the pointer away mid-click: keep the hover through it,
      // so clicking doesn't shrink and regrow the marker.
      onPointerLeave={onHover ? (e) => e.buttons === 0 && onHover(false) : undefined}
      onClick={
        onClick
          ? (e) => {
              e.stopPropagation();
              onClick();
            }
          : undefined
      }
    >
      {children}
    </div>
  );
}

/**
 * A marker's info card, shown while it's hovered (or tapped, on touch). It
 * renders inside the marker, so it moves with the point as the map pans and
 * zooms. `grown` undoes the marker's hover enlarge so the card stays its
 * normal size.
 */
function MarkerCard({ children, grown = true }: { children: React.ReactNode; grown?: boolean }) {
  return (
    <div
      className="pointer-events-none absolute whitespace-nowrap rounded-md bg-surface-deepest/95 px-2 py-1 text-xs text-surface-light shadow-lg"
      style={{ left: '50%', top: '50%', marginLeft: 20, marginTop: -12, transform: `scale(${grown ? 1 / MARKER_ENLARGE : 1})`, transformOrigin: 'left top', zIndex: 2 }}
    >
      {children}
    </div>
  );
}

function MarkerCardTitle({ children }: { children: React.ReactNode }) {
  return <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: 4 }}>{children}</div>;
}

/** Buttons above a marker (Add Call, a call list), clear of the symbol and of the search arrow when it shows. */
function AboveSymbol({ kind, searched, grown, children }: { kind: MapSymbolKind; searched?: boolean; grown?: boolean; children: React.ReactNode }) {
  return (
    <div
      className="pointer-events-auto absolute whitespace-nowrap"
      style={{
        left: '50%',
        bottom: '50%',
        marginBottom: symbolTop(kind) + (searched ? 34 : 8),
        transform: `translateX(-50%) scale(${grown ? 1 / MARKER_ENLARGE : 1})`,
        transformOrigin: 'bottom center',
        zIndex: 2,
      }}
    >
      {children}
    </div>
  );
}

interface PostMarkerProps {
  post: Post;
  at: MarkerAt;
  scale: number;
  /** True when this post was just navigated to (e.g. via the Map tab's location search): brackets and a bouncing arrow. */
  isSelected?: boolean;
  /** Clicking the pin toggles a small "Add Call" button above it; provided only where a Call actually makes sense (the dispatch board). */
  onAddCall?: (postName: string) => void;
}

/** A venue location: a flag whose tip is the spot, so it grows upward on hover and the spot never moves. */
export function PostMarker({ post, at, scale, isSelected, onAddCall }: PostMarkerProps) {
  const m = useMarkerState();
  if (!isPostObject(post)) return null;
  const { kind, glyph } = postSymbol(post, isClinicPost(post));

  return (
    <MarkerBox
      boxRef={m.ref}
      at={at}
      scale={scale}
      grow={m.hovered || m.expanded}
      z={isSelected || m.expanded || m.hovered ? 999 : 12}
      onHover={m.setHovered}
      onClick={onAddCall ? () => m.setExpanded((v) => !v) : undefined}
      testId={`post-marker-${post.name}`}
    >
      <MapSymbol kind={kind} fill={MAP_INK.place} glyph={glyph} searched={isSelected} title={post.name} />
      {m.expanded && onAddCall && (
        <AboveSymbol kind={kind} searched={isSelected} grown>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAddCall(post.name);
              m.setExpanded(false);
            }}
            className={MARKER_BUTTON}
          >
            Add Call
          </button>
        </AboveSymbol>
      )}
      {m.hovered && <MarkerCard>{post.name}</MarkerCard>}
    </MarkerBox>
  );
}

interface CallMarkerProps {
  /** The calls at this place: one, or several stacked into one marker. */
  calls: Call[];
  at: MarkerAt;
  scale: number;
  /** In the calls' corner beside a post (SLOTS.call); a call at its own dropped pin sits on it. */
  offset?: Offset;
  /** "Call #N" numbers, by call id (callDisplayNumbers). */
  numbers: Map<string, number>;
  /** Clicking a call in the marker's list opens it (the dispatch board's Calls tab). */
  onOpenCall?: (callId: string) => void;
}

const RESOLVED_FILL = 'rgba(11,14,19,0.62)';
const callRank = (c: Call) => (!isOpenCall(c) ? 2 : c.assignedTeam?.length ? 1 : 0);
const callFill = (c: Call) => (!isOpenCall(c) ? RESOLVED_FILL : c.assignedTeam?.length ? MAP_INK.committed : MAP_INK.pending);

/**
 * A call on the map (#94): a diamond with the call's number. Waiting for a
 * unit it is orange and pulses; with a unit, red; closed, dark with a check.
 * A priority call gets a second frame. Several calls at one place stack, the
 * most urgent on top.
 */
export function CallMarker({ calls, at, scale, offset, numbers, onOpenCall }: CallMarkerProps) {
  const m = useMarkerState();
  if (!calls.length) return null;

  const ordered = [...calls].sort((a, b) => callRank(a) - callRank(b));
  const top = ordered[0]!;
  const open = calls.some(isOpenCall);
  const first = numbers.get(calls[0]!.id);
  const stacked = calls.length > 1;
  const label = (c: Call) => `Call #${numbers.get(c.id) ?? '?'}`;

  return (
    <MarkerBox
      boxRef={m.ref}
      at={at}
      scale={scale}
      offset={offset}
      grow={m.hovered || m.expanded}
      z={m.expanded || m.hovered ? 999 : 20}
      onHover={m.setHovered}
      onClick={() => m.setExpanded((v) => !v)}
      testId={`call-marker-${first ?? calls[0]!.id}`}
      attrs={{
        'data-count': calls.length,
        'data-open': open,
        role: 'button',
        'aria-label': stacked ? `${calls.length} calls: ${calls.map(label).join(', ')}` : `${label(calls[0]!)}, ${calls[0]!.location}`,
      }}
    >
      <MapSymbol
        kind="call"
        fill={callFill(top)}
        resolved={!isOpenCall(top)}
        number={numbers.get(top.id)}
        pending={calls.some((c) => isOpenCall(c) && !c.assignedTeam?.length)}
        priority={calls.some((c) => isOpenCall(c) && c.priority)}
        stack={stacked ? { count: calls.length, fills: ordered.slice(1).map(callFill) } : undefined}
      />
      {m.expanded && onOpenCall ? (
        <AboveSymbol kind="call" grown>
          <div className="flex flex-col items-center gap-1">
            {calls.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenCall(c.id);
                  m.setExpanded(false);
                }}
                className={`${MARKER_BUTTON} text-left`}
                data-testid={`call-marker-open-${numbers.get(c.id) ?? c.id}`}
              >
                Open {label(c)} · {c.location || 'No location'}
              </button>
            ))}
          </div>
        </AboveSymbol>
      ) : (
        (m.hovered || m.expanded) && (
          <MarkerCard>
            <MarkerCardTitle>{stacked ? `${calls.length} calls here` : label(calls[0]!)}</MarkerCardTitle>
            {calls.map((c) => (
              <div key={c.id}>
                {stacked && <strong>#{numbers.get(c.id)} </strong>}
                {c.location || 'No location'} · {c.status}
                {c.assignedTeam?.length ? ` · ${c.assignedTeam.join(', ')}` : ''}
                {c.chiefComplaint ? ` · ${c.chiefComplaint}` : ''}
              </div>
            ))}
          </MarkerCard>
        )
      )}
    </MarkerBox>
  );
}

function EquipmentCardBody({ equipment }: { equipment: Equipment }) {
  return (
    <>
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
    </>
  );
}

interface EquipmentMarkerProps {
  equipment: Equipment;
  at: MarkerAt;
  scale: number;
  offset?: Offset;
  /** True when this equipment item was just navigated to (e.g. via its card's "view on map" button). */
  isSelected?: boolean;
  /** At its own tracker's position, which hasn't been updated for a while. */
  stale?: boolean;
  /** Clicking it shows the item in the board's Equipment list. */
  onOpen?: (equipmentName: string) => void;
}

export function EquipmentMarker({ equipment, at, scale, offset, isSelected, stale, onOpen }: EquipmentMarkerProps) {
  const m = useMarkerState();
  return (
    <MarkerBox
      boxRef={m.ref}
      at={at}
      scale={scale}
      offset={offset}
      grow={m.hovered}
      z={isSelected || m.hovered ? 999 : 15}
      onHover={m.setHovered}
      onClick={onOpen ? () => onOpen(equipment.name) : undefined}
      testId={`equipment-marker-${equipment.name}`}
    >
      <MapSymbol kind="equipment" fill={equipmentInk(equipment.status)} glyph={getEquipmentIconType(equipment.name)} stale={stale} searched={isSelected} title={equipment.name} />
      {m.hovered && (
        <MarkerCard>
          <EquipmentCardBody equipment={equipment} />
        </MarkerCard>
      )}
    </MarkerBox>
  );
}

/** A unit's equipment, fanned out below it on leader lines while the unit is open. */
function CarriedFan({ items, selectedName, onOpen }: { items: Equipment[]; selectedName?: string | null; onOpen?: (equipmentName: string) => void }) {
  const points = fanPoints(items.length);
  return (
    <>
      <LeaderLines points={points} from={15} />
      {items.map((item, i) => (
        <CarriedItem key={item.id} item={item} offset={points[i]!} searched={item.name === selectedName} onOpen={onOpen} />
      ))}
    </>
  );
}

function CarriedItem({ item, offset, searched, onOpen }: { item: Equipment; offset: Offset; searched: boolean; onOpen?: (equipmentName: string) => void }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      data-testid={`carried-equipment-${item.name}`}
      style={{ position: 'absolute', left: offset.dx, top: offset.dy, width: SYMBOL_BOX, height: SYMBOL_BOX, pointerEvents: 'none', cursor: onOpen ? 'pointer' : 'default', zIndex: hovered ? 3 : 1 }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={(e) => {
        e.stopPropagation();
        onOpen?.(item.name);
      }}
    >
      <MapSymbol kind="equipment" fill={equipmentInk(item.status)} glyph={getEquipmentIconType(item.name)} searched={searched} title={item.name} />
      {hovered && (
        <MarkerCard>
          <EquipmentCardBody equipment={item} />
        </MarkerCard>
      )}
    </div>
  );
}

interface UnitMarkerProps {
  at: MarkerAt;
  scale: number;
  offset?: Offset;
  /** True when this unit was just navigated to (e.g. via its card's "view on map" button). */
  isSelected?: boolean;
  /** A live position that hasn't been updated for a while. */
  stale?: boolean;
  /** Direction of travel on screen (degrees clockwise from up), while moving. */
  heading?: number;
  /** The vehicle this unit crews. */
  vehicle?: Vehicle;
  /** Equipment the unit has: a count on its corner, fanned out below it when it's opened. */
  carrying?: Equipment[];
  /** The board's "view on map" target; one the unit has opens its fan. */
  selectedEquipmentName?: string | null;
  /** Clicking a piece of its equipment shows it in the board's Equipment list. */
  onOpenEquipment?: (equipmentName: string) => void;
  /** Show the unit's post in its card. Off when the event has no posting schedule. */
  showPosts?: boolean;
}

interface TeamMarkerProps extends UnitMarkerProps {
  team: Staff;
  teamTimers: { [team: string]: number };
  calls: Call[];
  /** Clicking the unit toggles a small "Add Call" button above it, prefilled with this team already assigned. */
  onAddCall?: (teamName: string) => void;
}

const CLOSED_CALL_STATUSES = ['Resolved', 'Delivered', 'Refusal', 'NMM', 'Treat and Release'];

export function TeamMarker({
  team,
  at,
  scale,
  offset,
  teamTimers,
  calls,
  isSelected,
  onAddCall,
  stale,
  heading,
  vehicle,
  carrying = [],
  selectedEquipmentName,
  onOpenEquipment,
  showPosts = true,
}: TeamMarkerProps) {
  const m = useMarkerState();
  const activeCall = calls.find((c) => c.assignedTeam?.includes(team.team) && !CLOSED_CALL_STATUSES.includes(c.status));
  const hasSearchedItem = carrying.some((e) => e.name === selectedEquipmentName);
  const showFan = carrying.length > 0 && (m.expanded || hasSearchedItem);

  return (
    <MarkerBox
      boxRef={m.ref}
      at={at}
      scale={scale}
      offset={offset}
      grow={m.hovered || m.expanded}
      z={isSelected || m.expanded || m.hovered || hasSearchedItem ? 999 : 25}
      onHover={m.setHovered}
      onClick={onAddCall || carrying.length ? () => m.setExpanded((v) => !v) : undefined}
      testId={`team-marker-${team.team}`}
    >
      <MapSymbol
        kind="unit"
        fill={unitInk(team.status)}
        carrying={carrying.length}
        vehicle={!!vehicle}
        heading={heading}
        stale={stale}
        searched={isSelected}
        title={team.team}
      />
      {showFan && <CarriedFan items={carrying} selectedName={selectedEquipmentName} onOpen={onOpenEquipment} />}
      {m.expanded && onAddCall && (
        <AboveSymbol kind="unit" searched={isSelected} grown>
          <button
            type="button"
            disabled={!!activeCall}
            title={activeCall ? `${team.team} is already on a call` : undefined}
            onClick={(e) => {
              e.stopPropagation();
              if (activeCall) return;
              onAddCall(team.team);
              m.setExpanded(false);
            }}
            className={MARKER_BUTTON}
          >
            Add Call
          </button>
        </AboveSymbol>
      )}
      {m.hovered && (
        <MarkerCard>
          <MarkerCardTitle>{team.team}</MarkerCardTitle>
          <div><strong>Status:</strong> {team.status || 'Unknown'}</div>
          {showPosts && <div><strong>Post:</strong> {team.location || 'Unassigned'}</div>}
          {vehicle && <div><strong>Vehicle:</strong> {vehicle.name}</div>}
          {carrying.length > 0 && <div><strong>Equipment:</strong> {carrying.map((e) => e.name).join(', ')}</div>}
          <div>
            <strong>Status Timer:</strong>{' '}
            {typeof teamTimers[team.team] === 'number' ? <StatusTimer since={teamTimers[team.team]} /> : <span className="ui-timer">00:00</span>}
          </div>
        </MarkerCard>
      )}
    </MarkerBox>
  );
}

interface SupervisorMarkerProps extends UnitMarkerProps {
  supervisor: Supervisor;
}

export function SupervisorMarker({
  supervisor,
  at,
  scale,
  offset,
  isSelected,
  stale,
  heading,
  vehicle,
  carrying = [],
  selectedEquipmentName,
  onOpenEquipment,
  showPosts = true,
}: SupervisorMarkerProps) {
  const m = useMarkerState();
  const hasSearchedItem = carrying.some((e) => e.name === selectedEquipmentName);
  const showFan = carrying.length > 0 && (m.expanded || hasSearchedItem);

  return (
    <MarkerBox
      boxRef={m.ref}
      at={at}
      scale={scale}
      offset={offset}
      grow={m.hovered || m.expanded}
      z={isSelected || m.expanded || m.hovered || hasSearchedItem ? 999 : 25}
      onHover={m.setHovered}
      onClick={carrying.length ? () => m.setExpanded((v) => !v) : undefined}
      testId={`supervisor-marker-${supervisor.team}`}
    >
      <MapSymbol
        kind="supervisor"
        fill={unitInk(supervisor.status)}
        carrying={carrying.length}
        vehicle={!!vehicle}
        heading={heading}
        stale={stale}
        searched={isSelected}
        title={supervisor.team}
      />
      {showFan && <CarriedFan items={carrying} selectedName={selectedEquipmentName} onOpen={onOpenEquipment} />}
      {m.hovered && (
        <MarkerCard>
          <MarkerCardTitle>{supervisor.team}</MarkerCardTitle>
          <div><strong>Status:</strong> {supervisor.status || 'Unknown'}</div>
          {showPosts && <div><strong>Post:</strong> {supervisor.location || 'Unassigned'}</div>}
          {vehicle && <div><strong>Vehicle:</strong> {vehicle.name}</div>}
          {carrying.length > 0 && <div><strong>Equipment:</strong> {carrying.map((e) => e.name).join(', ')}</div>}
        </MarkerCard>
      )}
    </MarkerBox>
  );
}

interface StackMember {
  key: string;
  name: string;
  status: string;
  fill: string;
  /** The board's "view on map" target: opens the stack. */
  searched?: boolean;
  /** The member's own marker, at `offset` from the stack's anchor. */
  render: (offset: Offset) => React.ReactNode;
}

/**
 * Several units (or pieces of equipment) of one kind in the same spot: the
 * most urgent on top, the next two as frames behind it, and a count. Clicking
 * it spreads them on a ring around the spot, each its own marker again;
 * clicking the spot or anywhere else closes it.
 */
function StackMarker({ at, scale, offset = AT_ANCHOR, symbol, members, z }: { at: MarkerAt; scale: number; offset?: Offset; symbol: MapSymbolProps; members: StackMember[]; z: number }) {
  const [hovered, setHovered] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  useCloseOnOutsidePointer(wrapRef, open, setOpen);
  useCloseOnOutsidePointer(wrapRef, hovered, setHovered);
  const spread = open || members.some((mb) => mb.searched);
  const ring = ringPoints(members.length, symbol.kind === 'equipment' ? 30 : 38);
  const testKind = symbol.kind === 'equipment' ? 'equipment' : 'unit';

  return (
    <div ref={wrapRef} className="pointer-events-none absolute inset-0" style={{ zIndex: spread || hovered ? 999 : z }}>
      {spread ? (
        <>
          <MarkerBox at={at} scale={scale} offset={offset} z={0} onClick={() => setOpen(false)} testId={`${testKind}-stack-open`}>
            <LeaderLines points={ring} />
            <AnchorDot />
          </MarkerBox>
          {members.map((mb, i) => (
            <React.Fragment key={mb.key}>{mb.render(plus(offset, ring[i]!))}</React.Fragment>
          ))}
        </>
      ) : (
        <MarkerBox
          at={at}
          scale={scale}
          offset={offset}
          grow={hovered}
          z={0}
          onHover={setHovered}
          onClick={() => setOpen(true)}
          testId={`${testKind}-stack`}
          attrs={{ 'data-count': members.length }}
        >
          <MapSymbol {...symbol} stack={{ count: members.length, fills: members.slice(1).map((mb) => mb.fill) }} />
          {hovered && (
            <MarkerCard>
              <MarkerCardTitle>{members.length} here</MarkerCardTitle>
              {members.map((mb) => (
                <div key={mb.key}>
                  {mb.name} · {mb.status}
                </div>
              ))}
            </MarkerCard>
          )}
        </MarkerBox>
      )}
    </div>
  );
}

/** Everything a map needs to lay out its unit and equipment markers (layoutMarkers). */
export interface MarkerContext {
  scale: number;
  staff: Staff[];
  supervisor: Supervisor[];
  equipment: Equipment[];
  calls: Call[];
  teamTimers: { [team: string]: number };
  tracking?: UnitTracking | null;
  vehicles?: Vehicle[];
  showPosts?: boolean;
  selectedTeamName?: string | null;
  selectedSupervisorName?: string | null;
  selectedEquipmentName?: string | null;
  onAddCallForTeam?: (teamName: string) => void;
  onOpenEquipment?: (equipmentName: string) => void;
  /** Whether this map can show a point. */
  canShow: (lat: number, lon: number) => boolean;
  /** Where an anchor is on this map (null when it can't show it); `lat`/`lng` for a live map's pin. */
  place: (anchor: MapAnchor) => { at: MarkerAt; lat?: number; lng?: number } | null;
  /** A live position's heading (degrees from north) turned into a screen direction. */
  headingOnScreen: (lat: number, lon: number, heading: number) => number;
}

export interface PlacedMarker {
  key: string;
  /** Set on a live map: the marker's pin. */
  lat?: number;
  lng?: number;
  node: React.ReactNode;
}

/**
 * The unit and equipment markers for one map (src/lib/mapLayout.ts): each
 * kind in its corner beside a post or a call's pin, stacked when several
 * share it; units at their live positions; equipment with the unit that has
 * it. Used by the image map and the live map alike.
 */
export function layoutMarkers(ctx: MarkerContext): PlacedMarker[] {
  const { scale } = ctx;
  const vehicles = ctx.vehicles ?? [];
  const units = [...ctx.staff, ...ctx.supervisor];
  const equipment = equipmentLayout(ctx.equipment, units, ctx.tracking, vehicles);
  const out: PlacedMarker[] = [];

  for (const g of equipment.groups) {
    const p = ctx.place(g.anchor);
    if (!p) continue;
    const offset = g.beside ? SLOTS.equipment : AT_ANCHOR;
    const one = (item: Equipment, o: Offset) => (
      <EquipmentMarker
        key={item.id}
        equipment={item}
        at={p.at}
        scale={scale}
        offset={o}
        isSelected={item.name === ctx.selectedEquipmentName}
        stale={g.stale}
        onOpen={ctx.onOpenEquipment}
      />
    );
    const top = g.items[0]!;
    out.push({
      key: `${g.key}:equipment`,
      lat: p.lat,
      lng: p.lng,
      node:
        g.items.length === 1 ? (
          one(top, offset)
        ) : (
          <StackMarker
            at={p.at}
            scale={scale}
            offset={offset}
            z={15}
            symbol={{ kind: 'equipment', fill: equipmentInk(top.status), glyph: getEquipmentIconType(top.name) }}
            members={g.items.map((item) => ({
              key: item.id,
              name: item.name,
              status: item.status,
              fill: equipmentInk(item.status),
              searched: item.name === ctx.selectedEquipmentName,
              render: (o) => one(item, o),
            }))}
          />
        ),
    });
  }

  const unitProps = (name: string, g: { stale?: boolean; heading?: number; anchor: MapAnchor }) => ({
    scale,
    stale: g.stale,
    heading: g.heading != null && g.anchor.kind === 'point' ? ctx.headingOnScreen(g.anchor.lat, g.anchor.lon, g.heading) : undefined,
    vehicle: vehicleOfUnit(name, vehicles),
    carrying: equipment.carried.get(name),
    selectedEquipmentName: ctx.selectedEquipmentName,
    onOpenEquipment: ctx.onOpenEquipment,
    showPosts: ctx.showPosts,
  });
  const unitSymbol = (kind: 'unit' | 'supervisor', u: { team: string; status: string }): MapSymbolProps => ({
    kind,
    fill: unitInk(u.status),
    carrying: equipment.carried.get(u.team)?.length,
    vehicle: !!vehicleOfUnit(u.team, vehicles),
  });

  for (const g of unitGroups(ctx.staff, ctx.tracking, ctx.canShow)) {
    const p = ctx.place(g.anchor);
    if (!p) continue;
    const offset = g.beside ? SLOTS.team : AT_ANCHOR;
    const one = (team: Staff, o: Offset) => (
      <TeamMarker
        key={team.team}
        team={team}
        at={p.at}
        offset={o}
        teamTimers={ctx.teamTimers}
        calls={ctx.calls}
        isSelected={team.team === ctx.selectedTeamName}
        onAddCall={ctx.onAddCallForTeam}
        {...unitProps(team.team, g)}
      />
    );
    out.push({
      key: `${g.key}:team`,
      lat: p.lat,
      lng: p.lng,
      node:
        g.units.length === 1 ? (
          one(g.units[0]!, offset)
        ) : (
          <StackMarker
            at={p.at}
            scale={scale}
            offset={offset}
            z={25}
            symbol={unitSymbol('unit', g.units[0]!)}
            members={g.units.map((team) => ({
              key: team.team,
              name: team.team,
              status: team.status,
              fill: unitInk(team.status),
              searched: team.team === ctx.selectedTeamName || !!equipment.carried.get(team.team)?.some((e) => e.name === ctx.selectedEquipmentName),
              render: (o) => one(team, o),
            }))}
          />
        ),
    });
  }

  for (const g of unitGroups(ctx.supervisor, ctx.tracking, ctx.canShow)) {
    const p = ctx.place(g.anchor);
    if (!p) continue;
    const offset = g.beside ? SLOTS.supervisor : AT_ANCHOR;
    const one = (sup: Supervisor, o: Offset) => (
      <SupervisorMarker key={sup.team} supervisor={sup} at={p.at} offset={o} isSelected={sup.team === ctx.selectedSupervisorName} {...unitProps(sup.team, g)} />
    );
    out.push({
      key: `${g.key}:supervisor`,
      lat: p.lat,
      lng: p.lng,
      node:
        g.units.length === 1 ? (
          one(g.units[0]!, offset)
        ) : (
          <StackMarker
            at={p.at}
            scale={scale}
            offset={offset}
            z={25}
            symbol={unitSymbol('supervisor', g.units[0]!)}
            members={g.units.map((sup) => ({
              key: sup.team,
              name: sup.team,
              status: sup.status,
              fill: unitInk(sup.status),
              searched: sup.team === ctx.selectedSupervisorName || !!equipment.carried.get(sup.team)?.some((e) => e.name === ctx.selectedEquipmentName),
              render: (o) => one(sup, o),
            }))}
          />
        ),
    });
  }
  return out;
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
  /** The event's (or venue's) vehicles: equipment on one is drawn where the vehicle is, and a unit crewing one shows it. */
  vehicles?: Vehicle[];
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
  /** Name of a post on the current layer to point out — e.g. the dispatch Map tab's location search jumping to a result. */
  selectedPostName?: string | null;
  /** Name of a team on the current layer to point out — e.g. a team card's "view on map" button. */
  selectedTeamName?: string | null;
  /** Same, for a supervisor's "view on map" button. */
  selectedSupervisorName?: string | null;
  /** Same, for an equipment item's "view on map" button (matched by name, same identity equipment cards use elsewhere). */
  selectedEquipmentName?: string | null;
  /** Clicking a post pin shows a small "Add Call" button above it prefilled with that location; omit to disable (event creation/venue management have no Calls). */
  onAddCallAtPost?: (postName: string) => void;
  /** Same, but from clicking a team marker — prefills the assigned team instead of the location. */
  onAddCallForTeam?: (teamName: string) => void;
  /** Clicking a piece of equipment shows it in the board's Equipment list. */
  onOpenEquipment?: (equipmentName: string) => void;
  /** Show posts in team and supervisor cards. Off when the event has no posting schedule. */
  showPosts?: boolean;
  /** Draw the posts' own pins (the Map tab's Layers menu can hide them; units at posts are still placed). */
  showPostPins?: boolean;
  /** Optional add-on layer (see MapOverlay). */
  overlay?: MapOverlay;
  /** Draw call markers (#94): open calls, or every call (the event summary's map). Off by default. */
  showCalls?: 'open' | 'all' | false;
  /** "Call #N" numbers when `calls` is only some of the event's (the summary's team filter); counted from `calls` otherwise. */
  callNumbers?: Map<string, number>;
  /** Clicking a call in a call marker's list opens it. */
  onOpenCall?: (callId: string) => void;
}

export function VenueMapWithPosts({
  layers,
  currentLayer,
  staff,
  supervisor = [],
  equipment = [],
  vehicles,
  teamTimers,
  calls = [],
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
  onOpenEquipment,
  showPosts = true,
  showPostPins = true,
  overlay,
  showCalls = false,
  onOpenCall,
  callNumbers: givenNumbers,
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
  const callNumbers = givenNumbers ?? callDisplayNumbers(calls);
  const shownLayer = layers[currentLayer];
  const callMarkers = showCalls && shownLayer ? callSpots(showCalls === 'all' ? calls : calls.filter(isOpenCall), shownLayer, false) : [];

  // Units with a position (a live one, D66, or a call's dropped pin) are drawn there; positions this layer can't
  // show are left off, and a unit at a call's pin it can't show falls back to its post (mapLayout.ts).
  const tracking = overlay?.unitTracking;
  const alignment = shownLayer ? tracking?.alignments[shownLayer.id] ?? layerAlignment(shownLayer) : undefined;
  const percentOf = (lat: number, lon: number) => {
    if (!alignment) return null;
    const p = latLonToPercent(alignment, { lat, lon });
    return p.x < 0 || p.x > 100 || p.y < 0 || p.y > 100 ? null : p;
  };

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

  const postByName = (name: string) => {
    const post = posts.find((p) => typeof p !== 'string' && p.name === name);
    return post && isPostObject(post) ? post : undefined;
  };
  const markers = shouldRenderMarkers
    ? layoutMarkers({
        scale,
        staff,
        supervisor,
        equipment,
        calls,
        teamTimers,
        tracking,
        vehicles,
        showPosts,
        selectedTeamName,
        selectedSupervisorName,
        selectedEquipmentName,
        onAddCallForTeam,
        onOpenEquipment,
        canShow: (lat, lon) => !!percentOf(lat, lon),
        place: (anchor) => {
          if (anchor.kind === 'post') {
            const post = postByName(anchor.post);
            return post ? { at: atPercent(rect, post.x, post.y) } : null;
          }
          const p = percentOf(anchor.lat, anchor.lon);
          return p ? { at: atPercent(rect, p.x, p.y) } : null;
        },
        headingOnScreen: (lat, lon, heading) => {
          // A short step along the heading, through the image's alignment: the image may be turned or skewed.
          const rad = (heading * Math.PI) / 180;
          const ahead = fromLocalMeters({ lat, lon }, 20 * Math.sin(rad), 20 * Math.cos(rad));
          if (!alignment) return heading;
          const a = latLonToPercent(alignment, { lat, lon });
          const b = latLonToPercent(alignment, ahead);
          const dx = ((b.x - a.x) / 100) * rect.width;
          const dy = ((b.y - a.y) / 100) * rect.height;
          return (Math.atan2(dx, -dy) * 180) / Math.PI;
        },
      })
    : [];

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
            {showPostPins && posts.map((post, i) => (
              isPostObject(post) && (
                <PostMarker
                  key={i}
                  post={post}
                  at={atPercent(rect, post.x, post.y)}
                  scale={scale}
                  isSelected={!!selectedPostName && post.name === selectedPostName}
                  onAddCall={onAddCallAtPost}
                />
              )
            ))}
            {callMarkers.map((spot) => (
              <CallMarker
                key={spot.key}
                calls={spot.calls}
                at={atPercent(rect, spot.x!, spot.y!)}
                offset={spot.atPost ? SLOTS.call : AT_ANCHOR}
                scale={scale}
                numbers={callNumbers}
                onOpenCall={onOpenCall}
              />
            ))}
            {markers.map((marker) => (
              <React.Fragment key={marker.key}>{marker.node}</React.Fragment>
            ))}
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
