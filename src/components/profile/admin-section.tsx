'use client';

import { useAdmin } from '@/hooks/useAdmin';
import type { ServiceUser } from '@/lib/services';
import AdminCertificationsSection from './admin-certifications-section';
import AdminUsersSection from './admin-users-section';
import AdminVenuesSection from './admin-venues-section';
import { lazy, Suspense } from 'react';

// TAK live tracking (optional, in development): admins set up TAK servers
// here. Compiled out entirely unless NEXT_PUBLIC_TAK is exactly "on".
const TakAdminSection =
  process.env.NEXT_PUBLIC_TAK === 'on' ? lazy(() => import('@/features/tak').then((m) => ({ default: m.TakAdminSection }))) : null;

export default function AdminSection({ currentUser }: { currentUser: ServiceUser }) {
  const { isAdmin, loading } = useAdmin();

  if (loading || !isAdmin) return null;

  return (
    <div className="space-y-6 w-full">
      <h2 className="text-3xl font-bold">Admin</h2>
      <AdminCertificationsSection />
      <AdminVenuesSection currentUser={currentUser} />
      <AdminUsersSection currentUser={currentUser} />
      {TakAdminSection && (
        <Suspense fallback={null}>
          <TakAdminSection adminUid={currentUser.uid} />
        </Suspense>
      )}
    </div>
  );
}
