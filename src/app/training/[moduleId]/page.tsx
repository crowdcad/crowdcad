'use client';

import { use } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import TrainingPlayer from '@/components/training/TrainingPlayer';
import { findModule } from '@/training/registry';

/**
 * /training/<moduleId>[?step=<step id or number>]: one training module.
 * `?step=` lands on that step's section (the Help search links here). `?embed=phone` is the module inside a
 * phone module's frame (TrainingPlayer): no header or card, its state posted to the page around it.
 */
export default function TrainingModulePage({ params }: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = use(params);
  const search = useSearchParams();
  const trainingModule = findModule(moduleId);

  if (!trainingModule) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-3 bg-surface-deepest p-6 text-surface-light">
        <p>That training module doesn&apos;t exist.</p>
        <Link href="/training" className="text-accent hover:underline">
          See all training modules
        </Link>
      </main>
    );
  }

  const stepParam = search?.get('step');
  const byId = stepParam ? trainingModule.steps.findIndex((s) => s.id === stepParam) : -1;
  const byNumber = stepParam && /^\d+$/.test(stepParam) ? Number(stepParam) - 1 : -1;
  const start = byId >= 0 ? byId : byNumber >= 0 ? byNumber : 0;

  // Keyed so a different module or ?step= link starts a fresh session.
  const embed = search?.get('embed') === 'phone';
  return <TrainingPlayer key={`${trainingModule.id}:${start}`} module={trainingModule} startIndex={start} embed={embed} />;
}
