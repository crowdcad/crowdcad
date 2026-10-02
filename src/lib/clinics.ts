import type { Call, Clinic, Post, Venue } from '@/app/types';

export const DEFAULT_CLINICS: Clinic[] = [{ id: 'clinic', name: 'Clinic' }];

/** Resolves an event's clinics, falling back to a single default "Clinic" for events/venues with no clinic-flagged posts. */
export function getEventClinics(clinics: Clinic[] | undefined): Clinic[] {
  return clinics && clinics.length > 0 ? clinics : DEFAULT_CLINICS;
}

type ClinicPost = Extract<Post, object> & { isClinic: true };

export function isClinicPost(post: Post): post is ClinicPost {
  return typeof post === 'object' && post !== null && post.isClinic === true;
}

/** Minimal shape accepted by getVenuePosts — matches both Venue and LiteVenueSetup. */
type PostsSource = { posts?: Post[]; layers?: { posts: Post[] }[] };

/**
 * Flattens a venue's posts, preferring the flattened `venue.posts` cache
 * (written by venue-management on save) and falling back to layer posts
 * for venues that haven't been re-saved since layers were introduced.
 */
export function getVenuePosts(venue: PostsSource | Venue | undefined | null): Post[] {
  if (!venue) return [];
  if (venue.posts && venue.posts.length > 0) return venue.posts;
  return (venue.layers || []).flatMap(layer => layer.posts || []);
}

/** Every post name placed on the venue's map, deduplicated — offered as autocomplete suggestions for free-text location fields (a call's Location, quick-call creation), never an exclusive/enum choice. */
export function getVenueLocationOptions(venue: PostsSource | Venue | undefined | null): string[] {
  return Array.from(new Set(getVenuePosts(venue).map(p => (typeof p === 'string' ? p : p.name))));
}

/**
 * Additively merges clinic-flagged venue posts into an event's existing
 * clinics list, matched by the post's stable `clinicId`. Never removes an
 * entry whose backing post disappeared, so existing calls' `clinicId`
 * references are never orphaned.
 */
export function syncClinicsFromVenue(
  venue: PostsSource | Venue | undefined | null,
  existingClinics: Clinic[] | undefined
): Clinic[] {
  const clinicPosts = getVenuePosts(venue).filter(isClinicPost).filter(p => !!p.clinicId);

  const byId = new Map((existingClinics || []).map(c => [c.id, c]));

  for (const post of clinicPosts) {
    const id = post.clinicId!;
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, name: post.name });
    } else if (existing.name !== post.name) {
      byId.set(id, { ...existing, name: post.name });
    }
  }

  return Array.from(byId.values());
}

/**
 * True if `name` matches another clinic-flagged post in `allPosts`
 * (case-insensitive), excluding the post currently being edited. Two
 * clinics sharing a name would render two identically-labeled dispatch
 * tabs, so this is scoped to clinic-flagged posts only — regular posts
 * may still share names.
 */
export function hasDuplicateClinicName(
  name: string,
  allPosts: { post: Post; layerIdx: number; postIdx: number }[],
  exclude?: { layerIdx: number; postIdx: number }
): boolean {
  const trimmed = name.trim().toLowerCase();
  if (!trimmed) return false;
  return allPosts.some(({ post, layerIdx, postIdx }) => {
    if (exclude && layerIdx === exclude.layerIdx && postIdx === exclude.postIdx) return false;
    if (!isClinicPost(post)) return false;
    return post.name.trim().toLowerCase() === trimmed;
  });
}

/**
 * True once a clinic call has a terminal outcome (Discharged, AMA, Rolled
 * from Clinic, Transported). "Pending Transport" is deliberately excluded —
 * it's a waiting-room status like "In Clinic", not a resolution, so a call
 * marked Pending Transport stays in the active/unresolved list.
 */
export function isClinicCallResolved(call: Call): boolean {
  return call.status === 'Delivered' && !!call.outcome && call.outcome !== 'Pending Transport';
}

/**
 * Resolves a clinic's display name by id, but only when more than one
 * clinic exists — single-clinic events have nothing worth naming.
 */
export function getClinicName(clinics: Clinic[], clinicId: string | undefined): string | undefined {
  if (clinics.length <= 1) return undefined;
  return clinics.find(c => c.id === clinicId)?.name;
}

/**
 * Clinic a "Delivered" status should reuse without asking the dispatcher to
 * pick again — the destination already chosen when the team (or call) was
 * marked Transporting. Undefined means no destination has been chosen yet,
 * so a multi-clinic event still needs the picker.
 */
export function getTransportClinicId(
  call: Pick<Call, 'status' | 'clinicId'>,
  teamStatus: string | undefined,
  clinics: Clinic[]
): string | undefined {
  const wasTransporting = teamStatus === 'Transporting' || call.status === 'Transporting';
  if (!wasTransporting || !call.clinicId) return undefined;
  return clinics.some(c => c.id === call.clinicId) ? call.clinicId : undefined;
}

/**
 * Call.status values that mean the call itself is fully closed out — every
 * team/supervisor/equipment still on it has been auto-returned to post (see
 * the resolving cascade in dispatch/page.tsx's handleTeamStatusChange). A
 * call resolved via "Transferred to ambulance" (Rolled from Scene) ends up
 * with status 'Resolved' here, same as any other non-Delivered/Refusal/NMM/
 * Unable-to-Locate resolution — see the note on totalTransports in
 * summary/page.tsx for how that specific case is still distinguished when
 * needed via `detachedTeams`.
 */
export const RESOLVED_CALL_STATUSES = ['Delivered', 'Refusal', 'NMM', 'Treat and Release', 'Rolled', 'Resolved', 'Unable to Locate'];

/** True once a call's status is one of RESOLVED_CALL_STATUSES. */
export function isCallResolved(call: Call): boolean {
  return RESOLVED_CALL_STATUSES.includes(call.status);
}

