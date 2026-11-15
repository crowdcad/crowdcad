'use client';

import { usePathname } from 'next/navigation';
import AppNavbar from '@/components/layout/appnavbar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLiteRoute = pathname?.startsWith('/lite');
  // MCI role logins (/role, /r/<username>) have their own top bar (RoleShell).
  const isRoleRoute = !!pathname && /^\/(?:role|r)(?:$|\/)/.test(pathname);
  // A training module (/training/<id>) has its own bar (TrainingPlayer); the catalog keeps the navbar.
  const isTrainingPlayer = !!pathname && /^\/training\/[^/]+/.test(pathname);

  return (
    <>
      {!isLiteRoute && !isRoleRoute && !isTrainingPlayer && <AppNavbar />}
      <div>{children}</div>
    </>
  );
}