import type { MapAlignment, MapArea } from '@/lib/geo/types';

export type Post =
  | string
  | {
    name: string;
    x: number | null; // percentage of width
    y: number | null; // percentage of height
    isClinic?: boolean;
    clinicId?: string; // stable id, set once when isClinic first becomes true
    // Real coordinates. On a geo layer (aligned image or drawn area, see src/lib/geo/layers.ts) they are the
    // post's position, and x/y are set only when the post is inside the image. On an image layer they are
    // provenance from a GIS import and rendering uses x/y.
    lat?: number | null;
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
  coords?: { lat: number; lng: number }[]; // the same polygon in real coordinates, on a geo layer
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
  /** The image's real-world alignment (venue setup's Map alignment step). Makes this a geo layer. */
  alignment?: MapAlignment;
  /** The same, from venues aligned while this was a TAK-only step; still read. */
  takAlignment?: MapAlignment;
  /** A drawn area of interest for a layer with no image; makes this a geo layer centered on it. */
  area?: MapArea;
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

  /** Mass casualty incident (MCI) mode. Unset on events that never declared one. See src/lib/mci.ts. */
  mci?: MciState;
}

export type MciColor = 'red' | 'yellow' | 'green' | 'black';

/** A zone patients are found in. Zones hold counts only; patient details live in treatment locations (`MciState.patients`). */
export interface MciZone {
  id: string; // stable; the venue zone's id when created from one
  name: string;
  venueZoneId?: string;
  /** Set while the zone is cleared, unset when reopened. Kept in step with the log by appendMciEntries. */
  clearedAt?: number;
}

/** A place patients are moved to: an event clinic or an MCI-only treatment area. */
export interface MciTreatmentArea {
  id: string;
  name: string;
  /** Set when this area is an existing event clinic. */
  clinicId?: string;
  /** The map zone drawn for this area, in the event venue's layers. */
  venueZoneId?: string;
}

export type MciLogKind = 'tagged' | 'moved' | 'arrived' | 'reassigned' | 'transported' | 'zone_cleared' | 'zone_reopened' | 'undo';

export interface MciLogEntry {
  id: string;
  /** Epoch ms at entry time. */
  t: number;
  kind: MciLogKind;
  color?: MciColor;
  /** Signed for 'tagged', positive for 'moved', 'arrived' and 'transported', 1 for 'reassigned'. */
  n?: number;
  zoneId?: string;
  /** Destination for 'moved' and 'arrived'; where the patient was for 'reassigned'; the treatment location the patients left for 'transported'. */
  areaId?: string;
  /** The one patient a 'reassigned' or per-patient 'transported' entry is about (see `mciPatientId` in src/lib/mci.ts). */
  patientId?: string;
  /** New tag color, for 'reassigned'. */
  toColor?: MciColor;
  /** New treatment location, for 'reassigned'. */
  toAreaId?: string;
  /** Optional free text, for 'reassigned'. */
  note?: string;
  /** Ambulance number as typed, for 'transported'. A unit label, never patient data. */
  unit?: string;
  /** Where the ambulance took them (free text, optional), for 'transported'. */
  destination?: string;
  /** The entry an 'undo' reverses. */
  undoes?: string;
  /** Auth uid when signed in. */
  by?: string;
}

/** Where a unit in Triage (a zone) or Treatment (a treatment area) is working. */
export interface MciAssignment {
  kind: 'zone' | 'area';
  id: string;
}

export interface MciState {
  active: boolean;
  periods: { startedAt: number; endedAt?: number }[];
  zones: MciZone[];
  areas: MciTreatmentArea[];
  /** The only source of counts. Entries are appended, never edited or removed. */
  log: MciLogEntry[];
  /** Show a box per patient in each treatment location. Only changes what is shown: patients always come from the log. */
  trackPatients?: boolean;
  /** What the treatment leader typed about each patient, keyed by patient id. Never names or tag numbers. */
  patients?: Record<string, MciPatientDetails>;
}

/** Details typed for one patient in a treatment location. Every field is optional. */
export interface MciPatientDetails {
  /** As typed, up to 5 characters ("34", "6mo"). */
  age?: string;
  /** One capital letter. */
  sex?: string;
  /** Chief complaint, a word or two. */
  complaint?: string;
  /** The team that brought the patient in. */
  team?: string;
  /** Transport order in the patient's treatment location. Shown as a rank, so a transport moves everyone after it up one. */
  priority?: number;
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
  /** Where this unit is working during an MCI (status Triage or Treatment). Cleared on Available, Unavailable and stand down. */
  mciAssignment?: MciAssignment;
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
  /** Where this unit is working during an MCI (status Triage or Treatment). Cleared on Available, Unavailable and stand down. */
  mciAssignment?: MciAssignment;
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

/**
 * Where a piece of equipment is in its run (src/lib/equipmentCustody.ts):
 * waiting at a post, being fetched, carried by a team, left with the care
 * team on scene, on its way back, or in a clinic.
 */
export type EquipmentPhase = 'staged' | 'retrieving' | 'carried' | 'with_care_team' | 'returning' | 'in_clinic';

/** Who or what has the equipment right now. Its map position follows this. */
export interface EquipmentHolder {
  kind: 'post' | 'team' | 'clinic';
  /** Post or location name, unit name (Staff.team / Supervisor.team), or clinic name. */
  name: string;
}

export interface EquipmentCustodyEntry {
  /** Epoch ms. */
  t: number;
  phase: EquipmentPhase;
  holder: EquipmentHolder;
  /** The unit sent to fetch it, while `phase` is 'retrieving'. */
  team?: string;
  /** What caused the change: a unit's status, a dispatcher's manual edit, or a live-tracking suggestion they confirmed. */
  by: 'status' | 'dispatcher' | 'tracking';
}

export interface Equipment {
  id: string;
  name: string;
  status: EquipmentStatus;
  assignedTeam?: string | null;
  location?: string;
  /** Absent on equipment from before custody tracking; custodyOf() derives it from status, assignedTeam and location. */
  phase?: EquipmentPhase;
  holder?: EquipmentHolder;
  /** Most recent custody changes, oldest first (capped). */
  custodyLog?: EquipmentCustodyEntry[];
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
  phase?: EquipmentPhase;
  holder?: EquipmentHolder;
  /** Unit sent to fetch it (phase 'retrieving') or holding it. */
  assignedTeam?: string | null;
};

export type Role = {
  name: string;
  fullName: string;
}