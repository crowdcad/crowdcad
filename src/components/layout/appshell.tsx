'use client';

import { usePathname } from 'next/navigation';
import AppNavbar from '@/components/layout/appnavbar';
import { extensions } from '@/extensions';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLiteRoute = pathname?.startsWith('/lite');
  // An extension pack's pages that draw their own top bar (e.g. a field app).
  const isPackChrome = !!pathname && extensions.some((x) => x.ownsTopBar?.(pathname));
  // A training module (/training/<id>) has its own bar (TrainingPlayer); the catalog keeps the navbar.
  const isTrainingPlayer = !!pathname && /^\/training\/[^/]+/.test(pathname);

  return (
    <>
      {!isLiteRoute && !isPackChrome && !isTrainingPlayer && <AppNavbar />}
      <div>{children}</div>
    </>
  );
}