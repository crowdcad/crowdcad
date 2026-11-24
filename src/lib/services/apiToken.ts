import { isPocketbaseBackend } from './factory';

/** The signed-in account's token, for calling this app's own API routes; null when signed out. */
export async function currentAuthToken(): Promise<string | null> {
  if (isPocketbaseBackend) {
    const { pb } = await import('./pocketbase/client');
    return pb.authStore.isValid ? pb.authStore.token : null;
  }
  const { currentIdToken } = await import('./firebase/provisionUser');
  return currentIdToken();
}
