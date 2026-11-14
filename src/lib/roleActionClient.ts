import type { RoleAction } from './mciRoleActions';

/**
 * Sends a role view's change to /api/mci-role (#144), which applies it with
 * the login's unit and role stamped on. Throws with a plain message when the
 * server refuses (a disabled login, an ended event, a stale zone).
 */
export async function sendRoleAction(action: RoleAction): Promise<void> {
  const { currentIdToken } = await import('@/lib/services/firebase/provisionUser');
  const token = await currentIdToken();
  if (!token) throw new Error('Sign in again.');
  let res: Response;
  try {
    res = await fetch('/api/mci-role', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action }),
    });
  } catch {
    throw new Error('No connection. Your change was not sent; try again.');
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || `Could not save (${res.status}).`);
  }
}
