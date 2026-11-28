/**
 * Writes an organization setting (the `settings` collection) straight into the test backend, as an admin would
 * from Profile > Admin: the e2e user isn't an admin. Firebase through the Admin SDK; PocketBase as its superuser.
 */
import path from 'path';
import dotenv from 'dotenv';
import { db } from './admin-firebase';

dotenv.config({ path: path.join(__dirname, '../../.env.test.local') });

export async function setSetting(id: string, data: { key: string; value: unknown }): Promise<void> {
  if (process.env.E2E_BACKEND === 'pocketbase') {
    const url = `http://127.0.0.1:${process.env.E2E_PB_PORT || '8090'}`;
    const auth = await fetch(`${url}/api/collections/_superusers/auth-with-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identity: process.env.PB_E2E_ADMIN_EMAIL ?? 'admin@pbtest.local', password: process.env.PB_E2E_ADMIN_PASSWORD ?? 'Admin1234567890!' }),
    });
    const { token } = (await auth.json()) as { token: string };
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
    const patch = await fetch(`${url}/api/collections/settings/records/${id}`, { method: 'PATCH', headers, body: JSON.stringify(data) });
    if (patch.status === 404) {
      const create = await fetch(`${url}/api/collections/settings/records`, { method: 'POST', headers, body: JSON.stringify({ id, ...data }) });
      if (!create.ok) throw new Error(`Could not save setting ${id}: ${create.status} ${await create.text()}`);
    } else if (!patch.ok) throw new Error(`Could not save setting ${id}: ${patch.status} ${await patch.text()}`);
    return;
  }
  await db.doc(`settings/${id}`).set(data);
}
