/**
 * Stable team ids for Staff and Supervisor entries: generated once when a
 * team is created and never reissued on rename. Only the optional TAK module
 * reads them (to link TAK devices to teams); core code just carries the field
 * along. Existing teams without an id are left as they are.
 */
export function newTeamId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') return globalThis.crypto.randomUUID();
  // Fallback for environments without randomUUID (older test runners).
  return 'team-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}
