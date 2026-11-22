/**
 * The extension contract: how optional feature packs
 * plug into the shared app without shared code naming them.
 *
 * A pack is a CrowdcadExtension. Every member is optional; shared code asks
 * all installed packs (src/extensions/installed.ts) through the helpers in
 * src/extensions/index.ts and works the same with none installed, which is
 * the public build.
 *
 * Keep members generic (a unit card, a right-panel tab, a log row), never
 * shaped after one feature, so a new pack (messaging, scanning, a TAK plugin,
 * an API integration) plugs into the same points. Cross-cutting reactions
 * (send a receipt when counts arrive, push to an integration) subscribe to
 * AppEvents instead of adding a member.
 */
import type { ComponentType, ReactNode } from 'react';
import type { Event, Layer, PostPoint, Staff } from '@/app/types';
import type { TransactionContext as Tx } from '@/lib/services/types';
import type { MapOverlay } from '@/components/modals/event/venuemapmodal';
import type { TrainingModule, TrainingStep, TrainingTrack } from '@/training/types';
import type { UnitTracking } from '@/lib/unitTracking';

/* ------------------------------------------------------------------ events */

/** Things that happen in the shared app. Packs react with `on`. */
export interface AppEvents {
  'event.created': { eventId: string; event: Event };
  'event.ended': { eventId: string; event: Event };
  'unit.statusChanged': { eventId: string; event: Event; unit: string; from: string; to: string };
}
export type AppEventName = keyof AppEvents;
export type AppEventHandlers = { [K in AppEventName]?: (payload: AppEvents[K]) => void | Promise<void> };

/* ---------------------------------------------------------------- data */

/**
 * Data a pack keeps in its own documents beside the event (cloud events on
 * Firebase only; Lite and PocketBase keep everything on the event). Merged
 * into the Event the board sees, and split back out on every write.
 */
export interface EventDataStore<S = unknown> {
  /** Read inside the board's write transaction. */
  readTx(tx: Tx, eventId: string): Promise<S>;
  /** The event with this pack's state merged in. */
  merge(event: Event, state: S): Event;
  /**
   * Plans this pack's part of a write. `patch` was computed against `current` (state merged in). Do every
   * read here; `write` then only writes (Firestore wants all of a transaction's reads before its writes, and
   * every pack plans before any pack writes). Returns the rest of the patch, for the event document.
   */
  planTx(tx: Tx, eventId: string, current: Event, patch: Partial<Event>, state: S): Promise<{ rest: Partial<Event>; write: () => void }>;
  /** One read, outside a transaction (e.g. the summary page). */
  load(eventId: string): Promise<S>;
  /** Sees each event document exactly as the server sent it, before any merge (e.g. to spot data still kept inline). */
  onServerEvent?(eventId: string, event: Event): void;
  /** Live updates: calls `onChange` with a function that merges the latest state into an event. */
  subscribe(eventId: string, onChange: (merge: (event: Event) => Event) => void): () => void;
}

/* ------------------------------------------------------------ dispatch */

/** What the dispatch page gives packs. */
export interface DispatchHost {
  /** Sets a unit's status as if picked on its card (`detail` as the card would pass it). */
  setUnitStatus: (unit: string, status: string, detail?: string) => Promise<void>;
  eventId: string;
  event: Event;
  uid?: string;
  isLite: boolean;
  isMobile: boolean;
  isOwner: boolean;
  venueLayers: Layer[];
  t: (key: string) => string;
  /** The board's write path (transactional; the functional form reads the latest event). */
  updateEvent: (update: Partial<Event> | ((current: Event) => Partial<Event>), options?: { bypassEndedCheck?: boolean }) => Promise<void>;
  /** Replaces the local copy at once (optimistic updates). */
  setLocalEvent: (update: (prev: Event | undefined) => Event | undefined) => void;
  /** Opens a right-panel tab by id (a pack's own or a built-in one). */
  showTab: (id: string) => void;
  /** Live unit positions, when a pack provides them. */
  unitTracking: UnitTracking | null;
  setUnitTracking: (tracking: UnitTracking | null) => void;
  /** Units whose Location comes from live tracking right now. */
  trackedUnits: () => Set<string>;
}

export interface PanelTab {
  id: string;
  label: string;
  testId?: string;
  /** Small count beside the label. */
  badge?: ReactNode;
  /** Opened once by itself, e.g. when its feature becomes active. */
  autoOpen?: boolean;
  /** Desktop right panel only (phones use their own layout). */
  render: () => ReactNode;
}

/** Choosing a status may need a detail first (e.g. which clinic, which zone): picked from a short list. */
export interface StatusDetail {
  /** On the picker button ("Select clinic", "Zone"). */
  label: string;
  /** For screen readers ("Select destination clinic"). */
  ariaLabel: string;
  /** Shown when there are no options. */
  emptyContent?: string;
  options: { key: string; label: string }[];
}

/** A row in the event Log view. */
export interface LogRow {
  key: string;
  t: number;
  source: string;
  kind: string;
  text: string;
  /** When set, the row offers Undo. */
  undo?: () => void;
  /** Shown struck through (an entry that was undone). */
  undone?: boolean;
}

/** What a pack adds to one render of the dispatch page (from its `useDispatch` hook). */
export interface DispatchContribution {
  /** Right-panel tabs, after the built-in ones. */
  tabs?: PanelTab[];
  /** Replaces the availability strip while non-null. */
  strip?: ReactNode;
  /** Buttons in the right panel's tab bar. */
  toolbar?: ReactNode;
  /** Modals and other always-mounted UI. */
  mounted?: ReactNode;
  /** Map additions (underlay, toolbar, side panel). */
  mapOverlay?: MapOverlay;
  /** Work that runs while the page is open, rendering nothing (e.g. a tracking agent). */
  background?: ReactNode;
  /** Rows for the Log view. */
  logRows?: LogRow[];
  /** Status options for a unit, replacing the default free statuses. */
  statusOptions?: (unit: Staff) => string[] | null;
  /** A detail to pick with a status (null: none needed). */
  statusDetail?: (status: string) => StatusDetail | null;
  /** Fields and a log line written with a status change; `detail` is the picked option key. */
  statusPatch?: (event: Event, unit: Staff, status: string, detail?: string) => { patch: Partial<Staff>; logMessage?: string } | null;
  /** A chip on a unit's card. */
  UnitChip?: ComponentType<{ unit: Staff; event: Event; compact?: boolean }>;
  /** Extra location names to suggest. */
  locations?: string[];
}

/* ------------------------------------------------------------- summary */

/** A step chart over time (each point holds until the next), drawn like the built-in summary charts. */
export interface StepChartSpec {
  id: string;
  title: string;
  data: ({ t: number } & Record<string, number>)[];
  lines: { key: string; name: string; color: string }[];
}

export interface SummaryContribution {
  /** Sections after the built-in ones (lay them out with `sectionClassName`). */
  sections?: ReactNode;
  /** Charts after the built-in charts. */
  charts?: StepChartSpec[];
  /** Extra CSV export lines, already formatted (see the summary page's export). */
  csvLines?: string[];
}

/* ---------------------------------------------------------------- pack */

export interface CrowdcadExtension {
  id: string;
  /** Event fields the pack owns (copied as they are wherever the app stores a copy of the event, e.g. Lite drafts). */
  eventFields?: string[];
  /** How a venue location's map pin looks, when the pack marks it (e.g. a treatment location): undefined leaves it as is. */
  postMarker?: (post: PostPoint) => 'medical' | undefined;
  /** Pages of the pack that draw their own top bar, so the app's navbar stays off them. */
  ownsTopBar?: (pathname: string) => boolean;
  /** Kinds the pack's Log rows use, offered in the Log filter. */
  logKinds?: { key: string; label: string }[];
  on?: AppEventHandlers;
  /** Own documents beside the event (cloud events on Firebase). */
  eventData?: EventDataStore;
  /** Lets a pack keep its local copy of an incoming snapshot while its own writes are still saving (stops echoes stepping back). */
  freshen?: (prev: Event | undefined, incoming: Event) => Event;
  /** Automatic alerts (e.g. surge) stay off while this returns true. */
  alertsMuted?: (event: Event) => boolean;
  /** Called on every render of the dispatch page; may use hooks (packs are fixed per build, so order is stable). */
  useDispatch?: (host: DispatchHost) => DispatchContribution;
  /** Called on every render of the summary page. `sectionClassName` lays a section out like the built-in ones. */
  useSummary?: (eventId: string, event: Event | null, ui: { sectionClassName: string; formatTimestamp: (t: number) => string }) => SummaryContribution;
  /** Event creation: extra settings on the basics step, and what to save once the event exists. */
  eventCreate?: {
    Settings?: ComponentType<{
      /** null while the event doesn't exist yet. */
      eventId: string | null;
      uid: string;
      event: Partial<Event>;
      setEvent: (update: (prev: Partial<Event>) => Partial<Event>) => void;
      layers: Layer[];
      /** Settings to hand to afterCreate once the event exists. */
      onPendingChange: (pending: unknown) => void;
    }>;
    afterCreate?: (eventId: string, event: Partial<Event>, pending: unknown) => Promise<void>;
  };
  auth?: {
    /** A hint under the sign-in box's email field (e.g. that another kind of username works too). */
    signInHint?: string;
    /** The account email for what was typed in the sign-in box (e.g. a field login's username), or null to use it as typed. */
    signInEmail?: (typed: string) => string | null;
    /** For an account confined to its own pages (e.g. a field login): where it lands and which paths it may stay on. */
    confinedTo?: (email: string | null | undefined) => { home: string; allows: (pathname: string) => boolean } | null;
  };
  /** Sections in Profile > Admin. */
  adminSections?: ComponentType<{ uid: string }>[];
  training?: {
    tracks?: TrainingTrack[];
    modules?: TrainingModule[];
    /** A module whose `surface` is set shows this instead of the dispatch page. */
    PracticeSurface?: ComponentType<{ module: TrainingModule; store: unknown; eventId: string }>;
    /** Wraps the training player (e.g. a practice login backend). */
    Provider?: ComponentType<{ children: ReactNode }>;
    /** The map panel for a module whose tracking script asks for one (`tracking.panel`), on practice data. */
    TrackingPanel?: ComponentType<{ event: Event; layers: Layer[]; tracking: UnitTracking | null }>;
    /** Steps that point into the TrackingPanel (checked by the module tests like any module's steps). */
    panelSteps?: TrainingStep[];
  };
}
