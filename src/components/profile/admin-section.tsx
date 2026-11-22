'use client';

import { useAdmin } from '@/hooks/useAdmin';
import type { ServiceUser } from '@/lib/services';
import AdminCertificationsSection from './admin-certifications-section';
import AdminUsersSection from './admin-users-section';
import AdminVenuesSection from './admin-venues-section';
import AdminAuditSection from './admin-audit-section';
import AdminSecuritySection from './admin-security-section';
import { extensions } from '@/extensions';


export default function AdminSection({ currentUser }: { currentUser: ServiceUser }) {
  const { isAdmin, loading } = useAdmin();

  if (loading || !isAdmin) return null;

  return (
    <div className="space-y-6 w-full">
      <h2 className="text-3xl font-bold">Admin</h2>
      <AdminCertificationsSection />
      <AdminVenuesSection currentUser={currentUser} />
      <AdminUsersSection currentUser={currentUser} />
      <AdminSecuritySection />
      <AdminAuditSection />
      {/* Extension packs' own admin sections (e.g. TAK server setup). */}
      {extensions.flatMap((x) => x.adminSections ?? []).map((Section, i) => (
        <Section key={i} uid={currentUser.uid} />
      ))}
    </div>
  );
}
