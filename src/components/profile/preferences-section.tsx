'use client';

import { Card, CardBody, Switch } from '@heroui/react';
import { useReducedMotion } from '@/hooks/useReducedMotion';
import { useSurgeFlashing } from '@/hooks/useSurgeFlashing';
import LanguageSection from './language-section';

export default function PreferencesSection() {
  const { enabled, setEnabled } = useReducedMotion();
  const { flashingDisabled, setFlashingDisabled } = useSurgeFlashing();

  return (
    <div className="space-y-6 w-full">
      <h2 className="text-3xl font-bold">Preferences</h2>

      <Card isBlurred className="w-full border border-default-200 bg-surface-deep/40">
        <CardBody className="p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Reduce motion</p>
              <p className="text-sm text-surface-light/70">
                Minimize animations and transitions throughout the app.
              </p>
            </div>
            {/* Switch defaults to color="primary", which this dark theme
                repurposes into a near-black grey (see #49); override the
                selected-track background with the actual accent blue. */}
            <Switch
              isSelected={enabled}
              onValueChange={setEnabled}
              aria-label="Reduce motion"
              classNames={{ wrapper: 'group-data-[selected=true]:bg-accent' }}
            />
          </div>
          <div className="flex items-center justify-between gap-4 mt-6 pt-6 border-t border-default-200">
            <div>
              <p className="font-medium">Flash surge alerts</p>
              <p className="text-sm text-surface-light/70">
                Blink the Surge button and overdue Pending calls. When off, they stay solid orange.
              </p>
            </div>
            <Switch
              isSelected={!flashingDisabled}
              onValueChange={(on) => setFlashingDisabled(!on)}
              aria-label="Flash surge alerts"
              classNames={{ wrapper: 'group-data-[selected=true]:bg-accent' }}
            />
          </div>
        </CardBody>
      </Card>

      <LanguageSection />
    </div>
  );
}
