import type { TakMapAlignment } from '@/features/tak';

export type Post =
  | string
  | {
    name: string;
    x: number | null; // percentage of width
    y: number | null; // percentage of height
    isClinic?: boolean;
    clinicId?: string; // stable id, set once when isClinic first becomes true
    lat?: number | null; // source lat/long from a GIS import, for provenance only — rendering always uses x/y
    lng?: number | null;
  };

export interface Clinic {
  id: string;
  name: string;
}

/** A polygon area drawn on a venue map layer, e.g. "Zone 2" or "North Field". */
export interface Zone {
  id: string; // stable, generated once when the zone is drawn — never reissued on rename/recolor/edit
  name: string;
  color: string; // hex, e.g. "#3b82f6"
  points: { x: number; y: number }[]; // percent-of-image polygon vertices, in order
  isDispatchZone?: boolean; // when true, gets its own "{name} Calls" tab in the dispatch view
}

export interface DispatchZone {
  id: string; // matches a dispatch-zone-flagged Zone.id
  name: string;
}

export interface GeoBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface Layer {
  id: string;
  name: string;
  mapUrl?: string;
  posts: Post[];
  zones?: Zone[];
  geoBounds?: GeoBounds; // present when this layer's mapUrl was georeferenced via a GIS import
  /** TAK (optional, in development): this map's real-world alignment, set in venue setup. Core never reads it. */
  takAlignment?: TakMapAlignment;
}

export interface Venue {
  id: string;
  name: string;
  equipment: Equipment[];
  layers?: Layer[];
  posts?: Post[];
  mapUrl?: string;
  userId: string;
  sharedWith?: string[]; // Array of emails
  isOrgVenue?: boolean; // Visible to all users on this instance, set by an admin
  /** TAK (optional, in development): venue setup shows the TAK alignment step. Core reads it only to show that step. */
  takEnabled?: boolean;
}

export interface Event {
  id: string;
  name: string;
  date: string;
  venue: Venue;
  sharedWith?: string[]; // Array of emails
  isOrgEvent?: boolean; // Visible to every member of the org, set by an admin
  postingTimes: string[];
  staff: Staff[];
  supervisor: Supervisor[];
  userId: string;
  calls: Call[];
  status?: 'draft' | 'active';
  createdAt?: string | number;
  pendingAssignments?: {
    [team: string]: { post: string; time: string };
  };
  eventPosts: Post[];
  eventEquipment: EventEquipment[];
  ended?: boolean;
  /** Epoch ms when the event was ended (manually, or by the 1-hour-no-activity backup) — unset while active. */
  endedAt?: number;
  postAssignments?: PostAssignment;
  clinics?: Clinic[];
  dispatchZones?: DispatchZone[];

  postingStart?: string | number;
  postingEnd?: string | number;
  scheduleStart?: string | number;
  scheduleEnd?: string | number;
  startTime?: string | number;
  endTime?: string | number;
  start?: string | number;
  end?: string | number;

  interactionSessions?: InteractionSession[];

  /** Percent of teams actively on calls at which the surge display turns red. Defaults to 70 when unset. */
  surgeLimitPercent?: number;

  /** Combined count of calls + clinic patients marked pending transport at which a surge alert fires. Defaults to 3 when unset. */
  pendingTransportSurgeThreshold?: number;

  /** Seconds an unassigned ("Pending") call may sit without a team before a surge alert fires. Defaults to 120 (2:00) when unset. */
  unassignedCallSurgeSeconds?: number;

  /** Map mode: unset or 'standard' for a standard event; 'tak' loads the optional TAK live-tracking module. Core reads it only to decide whether to load that module. Owner/admin only. */
  mapMode?: 'standard' | 'tak';

  /** Manually declared "surge" state for the ops team, toggled via the Surge button beside the Calls/Clinic tabs — distinct from the automatic `surgeLimitPercent` threshold indicator. */
  manualSurgeActive?: boolean;
  /** Epoch ms when the current manual surge was started; cleared when surge is turned off. */
  manualSurgeStartedAt?: number;
  /** Every surge period this event has had, oldest first. The last entry's `endedAt` is unset while a surge is currently active (mirrors `manualSurgeActive`/`manualSurgeStartedAt`). */
  surgeLog?: SurgePeriod[];
}

export interface SurgePeriod {
  startedAt: number;
  /** Unset while this surge is still active. */
  endedAt?: number;
}

export interface TeamLogEntry {
  timestamp: number;
  message: string;
}

export interface Staff {
  /** Stable id, generated at creation and kept across renames (src/lib/teamId.ts). Read only by the optional TAK module; older teams may lack it. */
  id?: string;
  team: string;
  location: string;
  status: string;
  members: string[];
  log?: TeamLogEntry[];
  originalPost?: string;
  /** Epoch ms when the unit entered its current status/location — drives its timer. Stamped by the dispatch page on every status or location change. */
  statusSince?: number;
}

export interface Supervisor {
  /** Stable id, generated at creation and kept across renames (src/lib/teamId.ts). Read only by the optional TAK module; older entries may lack it. */
  id?: string;
  team: string;
  location: string;
  status: string;
  member: string;
  log?: TeamLogEntry[];
  originalPost?: string;
  /** Epoch ms when the unit entered its current status/location — drives its timer. Stamped by the dispatch page on every status or location change. */
  statusSince?: number;
}

export type PostAssignment = {
  [time: string]: {
    [post: string]: string;
  };
};

export interface CallLogEntry {
  timestamp: number;
  message: string;
}

export interface DetachedTeam {
  team: string;
  reason: string;
  /** What kind of assignment this was, so a revert knows how to restore it. Defaults to 'team' when absent (legacy data). */
  kind?: 'team' | 'supervisor' | 'equipment';
  /** Status the team/supervisor held immediately before this detachment, used to revert. */
  previousStatus?: string;
  /** Location the team/supervisor held immediately before this detachment, used to revert. */
  previousLocation?: string;
  /** Names of equipment items that moved off this team at detach time (kind === 'equipment' only), used to revert. */
  equipmentNames?: string[];
}

export type ClinicOutcome = "Discharged" | "AMA" | "Rolled from Clinic" | "Transported" | "Pending Transport";

export interface Call {
  id: string;
  order: number;
  status: string;
  location: string;
  assignedTeam: string[];
  chiefComplaint: string;
  source?: string;
  age?: string;
  gender?: string;
  priority?: boolean;
  /** Pins this call to the top of its list (below Priority calls). Never logged, and cleared automatically once the call resolves. */
  pin?: boolean;
  duplicate?: boolean;
  duplicateOf?: string;
  log?: CallLogEntry[];
  notes?: string;
  detachedTeams?: DetachedTeam[];
  equipmentTeams?: string[];
  equipment?: string[];
  clinic?: boolean;
  clinicId?: string;
  outcome?: ClinicOutcome;
  /** Ambulance/transport unit number captured when outcome is set to 'Transported'. */
  transportUnit?: string;
}

export interface CallLogEntry {
  timestamp: number;
  message: string;
}

export type EquipmentStatus = string;

export interface Equipment {
  id: string;
  name: string;
  status: EquipmentStatus;
  assignedTeam?: string | null;
  location?: string;
}

export type EventEquipment = Equipment & { locationId?: string; defaultLocation?: string; notes?: string };

export interface Area {
  id: string;
  shape: "circle" | "rect" | "poly";
  coords: number[];
  preFillColor: string;
  fillColor: string;
  strokeColor: string;
  lineWidth: number;
  active: boolean;
  disabled: boolean;
}

export interface ImgMap {
  name: string;
  areas: Area[];
}

export interface MouseClickLog {
  timestamp: number;
}

export interface KeyStrokeLog {
  timestamp: number;
}

export interface InteractionSession {
  sessionId: string;
  eventId: string;
  startTime: number;
  endTime?: number;
  mouseClicks: MouseClickLog[];
  keyStrokes: KeyStrokeLog[];
}

export type EquipmentItem = {
  name: string;
  stagingLocation: string; // Default/designated staging location
  currentLocation?: string; // Current location override
  status: string; // 'Available' or 'Call X'
  callId?: string; // Associated call ID if on a call
  deliveryTeam?: string; // Team delivering the equipment
  needsRefresh?: boolean; // Whether equipment needs to be marked ready after clinic delivery
  notes?: string; // Additional details/notes about the equipment
};

export type Role = {
  name: string;
  fullName: string;
}