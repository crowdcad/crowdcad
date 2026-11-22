'use client';
import { useEffect, useState } from 'react';
import { useAuth } from './useauth';
import { DEFAULT_SECURITY_SETTINGS, subscribeSecuritySettings, type SecuritySettings } from '@/lib/securitySettings';

/** The organization's security settings, live. `loading` until the first read for a signed-in account. */
export function useSecuritySettings(): { settings: SecuritySettings; loading: boolean } {
  const { user, ready } = useAuth();
  const [settings, setSettings] = useState<SecuritySettings>(DEFAULT_SECURITY_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setSettings(DEFAULT_SECURITY_SETTINGS);
      setLoading(false);
      return;
    }
    setLoading(true);
    return subscribeSecuritySettings((next) => {
      setSettings(next);
      setLoading(false);
    });
  }, [user, ready]);

  return { settings, loading };
}
