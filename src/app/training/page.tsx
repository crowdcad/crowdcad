import type { Metadata } from 'next';
import TrainingCatalog from '@/components/training/TrainingCatalog';

export const metadata: Metadata = {
  title: 'CrowdCAD Training',
  description: 'Interactive, step-by-step dispatcher training on the real CrowdCAD board with practice data.',
};

export default function TrainingPage() {
  return <TrainingCatalog />;
}
