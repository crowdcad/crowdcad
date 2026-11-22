'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { Button, Input, Popover, PopoverContent, PopoverTrigger } from '@heroui/react';
import { CircleHelp, GraduationCap, MousePointerClick, Search } from 'lucide-react';
import { NAVBAR_ICON_BUTTON_CLASS } from '@/components/layout/navbarshared';
import { useDispatchVocabulary } from '@/hooks/useDispatchVocabulary';
import { findAnchor, findStepTarget } from '@/training/anchors';
import { helpSuggestions, practiceHref, searchHelp, type HelpContext, type HelpEntry } from '@/training/help';
import { moduleNumber } from '@/training/registry';
import type { TrackId } from '@/training/types';
import Coachmark from './Coachmark';
import TrainingCard, { type TrainingCardActions } from './TrainingCard';

/**
 * The navbar's Help: a dropdown from the button. Type what you'd like to do,
 * pick a match to get pointed at the control on this page ("Show me"), or
 * open its training module. Show me only points: it never changes the event,
 * so it is safe on a live board.
 */

/** What the page is doing, read from the board itself so Help needs no wiring into the page. */
function pageContext(): HelpContext {
  if (typeof document === 'undefined') return {};
  const boost: TrackId[] = [];
  if (document.querySelector('[data-testid="mci-tab-button"]')) boost.push('mci');
  if (document.querySelector('[data-testid="unit-live-location"]')) boost.push('tak');
  return { boostTracks: boost };
}

/** On a dispatch board, module links open in a new tab so the board stays put. */
const onBoard = () => typeof document !== 'undefined' && !!document.querySelector('[data-testid="right-panel"]');

/** "Show me here": a coachmark for one step, moving on to the module's next pointer step when it is on screen. */
function LiveGuide({ entry, onClose }: { entry: HelpEntry; onClose: () => void }) {
  const [index, setIndex] = useState(entry.index);
  const step = entry.module.steps[index];
  const next = entry.module.steps[index + 1];
  const nextUsable = !!next?.liveSafe;

  // Move on by itself once what this step opens is on screen (a modal, a menu).
  useEffect(() => {
    if (!step?.doneWhenVisible) return;
    const target = step.doneWhenVisible;
    const id = window.setInterval(() => {
      if (!findAnchor(target)) return;
      if (nextUsable) setIndex((i) => i + 1);
      else onClose();
    }, 250);
    return () => window.clearInterval(id);
  }, [step, nextUsable, onClose]);

  // Close on Escape, unless a modal of the page is what Escape is closing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('[role="dialog"]')) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!step) return null;
  const found = !!findStepTarget(step);
  // The same card as a training module, in the same corner.
  return (
    <>
      <Coachmark step={step} label={step.title} />
      <TrainingCard
        module={entry.module}
        state={{ index, complete: false, unlocked: true, rejected: null }}
        actions={LIVE_CARD_ACTIONS}
        layout="floating"
        note={found ? undefined : "That control isn't on screen right now. It may be on another tab of the dispatch interface."}
        live={{
          onClose,
          footer: (
            <>
              <Button as={Link} href={practiceHref({ module: entry.module, step })} target="_blank" size="sm" variant="light" startContent={<GraduationCap className="h-3.5 w-3.5" />}>
                Module {moduleNumber(entry.module)}
              </Button>
              {nextUsable ? (
                <Button size="sm" color="primary" onPress={() => setIndex((i) => i + 1)}>
                  Next tip
                </Button>
              ) : (
                <Button size="sm" color="primary" onPress={onClose}>
                  Done
                </Button>
              )}
            </>
          ),
        }}
      />
    </>
  );
}

/** Help's card never steps the board itself, so the card's own actions do nothing. */
const noop = () => {};
const LIVE_CARD_ACTIONS: TrainingCardActions = { next: noop, doIt: noop, back: noop, restartSection: noop, jumpTo: noop };

export default function HelpButton({ className = '' }: { className?: string }) {
  const { activePreset } = useDispatchVocabulary();
  const t = useCallback((key: string) => activePreset.terms[key] ?? key, [activePreset]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [ctx, setCtx] = useState<HelpContext>({});
  const [guide, setGuide] = useState<HelpEntry | null>(null);
  const [onPage, setOnPage] = useState<Set<string>>(new Set());
  const [newTab, setNewTab] = useState(false);
  const closeGuide = useCallback(() => setGuide(null), []);

  const results = useMemo(() => (query.trim() ? searchHelp(query, ctx, t) : helpSuggestions(ctx, t)), [query, ctx, t]);

  // Which results can be pointed at on this page, checked when the list changes.
  useEffect(() => {
    if (!open) return;
    const visible = new Set<string>();
    for (const r of results) if (r.step.liveSafe && findStepTarget(r.step)) visible.add(`${r.module.id}:${r.step.id}`);
    setOnPage(visible);
  }, [open, results]);

  const onOpenChange = (next: boolean) => {
    if (next) {
      setCtx(pageContext());
      setNewTab(onBoard());
      setGuide(null);
    }
    setOpen(next);
  };

  return (
    <>
      <Popover placement="bottom-end" isOpen={open} onOpenChange={onOpenChange}>
        <PopoverTrigger>
          <Button isIconOnly variant="flat" aria-label="Help" title="Help" data-testid="help-button" className={`${NAVBAR_ICON_BUTTON_CLASS} ${className}`}>
            <CircleHelp className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(380px,calc(100vw-2rem))] items-stretch gap-2 bg-surface-deep px-3 pb-3 pt-4 text-surface-light" data-testid="help-panel">
          <div className="text-sm font-semibold text-surface">What would you like to do?</div>
          <Input
            autoFocus
            size="sm"
            aria-label="Search help"
            placeholder="e.g. add a call, end MCI"
            value={query}
            onValueChange={setQuery}
            startContent={<Search className="h-4 w-4 text-surface-light/60" />}
            data-testid="help-search"
            classNames={{
              input: 'outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
              inputWrapper: 'group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
            }}
          />
          {!query.trim() && results.length > 0 && <p className="px-1 text-[11px] uppercase tracking-wide text-surface-light/50">Common</p>}
          {query.trim() && results.length === 0 && <p className="px-1 text-sm text-surface-light/70">Nothing matches. Try other words.</p>}
          <ul className="flex flex-col" data-testid="help-results">
            {results.map((r) => {
              const here = onPage.has(`${r.module.id}:${r.step.id}`);
              return (
                <li key={`${r.module.id}:${r.step.id}`} className="flex items-baseline gap-2 rounded px-1 py-0.5 text-sm hover:bg-surface-liner/60">
                  {here ? (
                    <button
                      type="button"
                      className="flex min-w-0 items-center gap-1.5 text-left text-surface hover:text-accent"
                      title="Show me where"
                      data-testid="help-show-me"
                      onClick={() => {
                        setOpen(false);
                        setGuide(r);
                      }}
                    >
                      <MousePointerClick className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="truncate">{r.title}</span>
                    </button>
                  ) : (
                    <span className="min-w-0 truncate text-surface">{r.title}</span>
                  )}
                  <Link
                    href={practiceHref(r)}
                    target={newTab ? '_blank' : undefined}
                    className="shrink-0 text-xs text-accent hover:underline"
                    data-testid="help-module-link"
                    onClick={() => setOpen(false)}
                  >
                    Module {moduleNumber(r.module)}
                  </Link>
                </li>
              );
            })}
          </ul>
          <Link href="/training" className="self-start border-t border-surface-liner px-1 pt-2 text-xs text-accent hover:underline" onClick={() => setOpen(false)}>
            All training modules
          </Link>
        </PopoverContent>
      </Popover>

      {/* On <body>: the navbar's backdrop blur would make it the box `fixed` places against, so the card and
          coachmark would sit in the navbar's strip at the top instead of the window's corner. */}
      {guide && createPortal(<LiveGuide entry={guide} onClose={closeGuide} />, document.body)}
    </>
  );
}
