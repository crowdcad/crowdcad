import { randomString } from './randomString';

/**
 * MCI role logins (#140, #142): accounts made for one event and one role, so
 * anyone handed one can sign in on any device and go straight to that event
 * with only what the role needs.
 *
 * - A login is a real account whose email is `<username>@role.crowdcad.org`
 *   (ROLE_EMAIL_DOMAIN); people only ever see the username, e.g. `treat-7k2q`.
 * - Its record is `events/{eventId}/roleAccounts/{uid}` (RoleAccount), which
 *   the dispatcher can disable at any time; `roleAccountIndex/{uid}` tells a
 *   signed-in login which event it belongs to.
 * - The Firestore rules treat any account with that email domain as a role
 *   login: it is denied everything a normal account gets, and allowed only
 *   what its active record allows. Claiming the domain only ever removes access.
 *
 * Pure helpers here; reads and writes are in roleAccountStore.ts.
 */

export const ROLE_EMAIL_DOMAIN = 'role.crowdcad.org';

/** The roles offered (#144): Responder covers triage and treatment, since people move between them. */
export const EVENT_ROLES = ['responder', 'transport', 'logistics', 'incident_command'] as const;
/** Earlier separate roles, still accepted on existing logins and treated as Responder. */
const LEGACY_ROLES = ['triage', 'treatment'] as const;
export type EventRole = (typeof EVENT_ROLES)[number] | (typeof LEGACY_ROLES)[number];

export const EVENT_ROLE_INFO: Record<EventRole, { label: string; prefix: string }> = {
  responder: { label: 'Responder', prefix: 'resp' },
  transport: { label: 'Transport', prefix: 'trans' },
  logistics: { label: 'Logistics', prefix: 'log' },
  incident_command: { label: 'Incident Command', prefix: 'ic' },
  triage: { label: 'Responder', prefix: 'tri' },
  treatment: { label: 'Responder', prefix: 'treat' },
};

/** The role a login acts as: legacy Triage and Treatment logins act as Responder. */
export function effectiveRole(role: EventRole): (typeof EVENT_ROLES)[number] {
  return role === 'triage' || role === 'treatment' ? 'responder' : role;
}

/** A login's record, at events/{eventId}/roleAccounts/{uid}. */
export interface RoleAccount {
  uid: string;
  eventId: string;
  /** The event's name when the login was made, so the login can show it without reading the event. */
  eventName: string;
  role: EventRole;
  username: string;
  /** The team or supervisor the login belongs to (#152): everything it submits is logged under this name. */
  unitName?: string;
  /** That unit's Staff.id / Supervisor.id, when it has one. */
  unitId?: string;
  /** Optional note, e.g. who it was given to. */
  label?: string;
  disabled: boolean;
  createdBy: string;
  createdAt: number;
  disabledAt?: number;
}

/** roleAccountIndex/{uid}: which event a signed-in login belongs to. */
export interface RoleAccountIndex {
  eventId: string;
  role: EventRole;
}

/** Credentials for a new login. The password is shown once and never stored by CrowdCAD. */
export interface RoleLoginCredentials {
  uid: string;
  username: string;
  password: string;
}

const USERNAME_SUFFIX_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const PASSWORD_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function isEventRole(value: unknown): value is EventRole {
  return typeof value === 'string' && ([...EVENT_ROLES, ...LEGACY_ROLES] as readonly string[]).includes(value);
}

/** A new username for a role, e.g. "treat-7k2q". */
export function newRoleUsername(role: EventRole): string {
  return `${EVENT_ROLE_INFO[role].prefix}-${randomString(4, USERNAME_SUFFIX_ALPHABET)}`;
}

/** A new password: 10 characters, no look-alikes, easy to read out or type on a phone. */
export function newRolePassword(): string {
  return randomString(10, PASSWORD_ALPHABET);
}

const USERNAME_RE = /^[a-z]{2,5}-[a-z0-9]{4}$/;

export function roleLoginEmail(username: string): string {
  return `${username}@${ROLE_EMAIL_DOMAIN}`;
}

/**
 * The account email to sign in with for what someone typed in the sign-in
 * box: a role username ("treat-7k2q", any case) becomes its role email;
 * anything else is returned as typed.
 */
export function signInEmailFor(typed: string): string {
  const t = typed.trim();
  return USERNAME_RE.test(t.toLowerCase()) ? roleLoginEmail(t.toLowerCase()) : t;
}

/** Whether an account email is a role login's. */
export function isRoleLoginEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${ROLE_EMAIL_DOMAIN}`);
}

/** The one-tap sign-in link for a login. The password is in the fragment, which browsers never send to a server. */
export function roleLoginLink(origin: string, username: string, password: string): string {
  return `${origin.replace(/\/$/, '')}/r/${encodeURIComponent(username)}#${encodeURIComponent(password)}`;
}

/** Text to paste into a message for whoever takes the role. */
export function roleLoginMessage(origin: string, eventName: string, role: EventRole, username: string, password: string, unitName?: string): string {
  return [
    `CrowdCAD ${EVENT_ROLE_INFO[role].label} login${unitName ? ` for ${unitName}` : ''} at ${eventName}`,
    `Tap to sign in: ${roleLoginLink(origin, username, password)}`,
    `Or sign in at ${origin.replace(/^https?:\/\//, '').replace(/\/$/, '')} with username ${username} and password ${password}`,
  ].join('\n');
}
