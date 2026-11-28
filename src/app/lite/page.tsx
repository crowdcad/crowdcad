'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button, Input } from '@heroui/react';
import HomePageStreaks from '@/components/layout/homepagestreaks';
import { ArrowRight } from '@/components/ui/icons';
import LiteStoredEvents, { LiteStorageNotice } from '@/components/lite/litestoredevents';

/**
 * Lite Landing Page (/lite)
 *
 * This page is the entry point for Lite mode.
 * - No login required
 * - No Firebase auth or firestore calls
 * - User can enter a local event name to start Lite setup
 * - Entirely local-only
 *
 * GUARDRAIL: This file intentionally does NOT import firebase.ts, useAuth(), or any cloud hooks.
 * If you need to add data persistence, use IndexedDB or localStorage.
 */

export default function LiteLandingPage() {
  const router = useRouter();
  const [eventName, setEventName] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const inputClassNames = {
    inputWrapper:
      'rounded-large px-4 bg-surface-lighter/30 border border-surface-light/30 hover:bg-surface-lighter/30 shadow-none group-data-[focus=true]:bg-surface-lighter/30 group-data-[focus-visible=true]:bg-surface-lighter/30 group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0 focus-within:ring-0',
    input:
      'text-surface-light outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
  } as const;

  const handleStartLiteMode = () => {
    if (!eventName.trim()) {
      alert('Please enter an event name');
      return;
    }

    // Generate a simple local event ID (could be UUID in prod, but for now use timestamp-based)
    const localEventId = `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Store event name in sessionStorage for retrieval on create page
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(`lite_event_${localEventId}`, JSON.stringify({ name: eventName }));
    }

    setIsCreating(true);
    // Navigate to Lite create page
    router.push(`/lite/create?eventId=${localEventId}`);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleStartLiteMode();
    }
  };

  return (
    <main className="h-[calc(100dvh-3.5rem)] w-full max-w-full overflow-x-hidden overflow-y-auto relative flex flex-col text-surface-light bg-surface-deepest">
      <HomePageStreaks />

      {/* Main content */}
      <div className="relative z-10 flex flex-col items-center justify-center flex-1 px-6 gap-12 py-12">
        {/* Header and tagline */}
        <div className="flex flex-col items-center gap-4 max-w-2xl">
          <div className="flex items-center gap-2">
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold text-surface-light text-center leading-tight">
              CrowdCAD Lite
            </h1>
          </div>
        </div>

        {/* Event setup form */}
        <div className="w-full max-w-md flex flex-col gap-6">
          <div className="flex flex-col gap-2">
            <label htmlFor="event-name" className="text-sm font-semibold text-surface-light">
              Event Name
            </label>
            <Input
              id="event-name"
              // The label above isn't tied to HeroUI's inner input, so name it here too.
              aria-label="Event Name"
              placeholder="e.g., Big Game"
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              onKeyDown={handleKeyDown}
              classNames={inputClassNames}
              size="lg"
              disabled={isCreating}
            />
          </div>

          <Button
            onClick={handleStartLiteMode}
            isLoading={isCreating}
            variant="shadow"
            color="primary"
            size="lg"
            // color="primary" resolves to this dark theme's near-black grey
            // (see #49); override with the actual accent blue.
            className="w-full flex items-center justify-center gap-2 bg-accent text-accent-foreground shadow-accent/40"
          >
            Start Lite Mode
          </Button>

          <p className="text-xs text-surface-faint text-center">
            You can also switch to the{' '}
            <Link href="/" className="text-accent hover:text-accent/80 underline">
              cloud version
            </Link>
            {' '}if you&apos;d like full features
          </p>

          <LiteStorageNotice className="text-center" />
          <LiteStoredEvents />
        </div>
      </div>
    </main>
  );
}
