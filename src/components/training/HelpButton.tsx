'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Button, Input, Modal, ModalBody, ModalContent, ModalHeader, Tooltip } from '@heroui/react';
import { CircleHelp, GraduationCap, MousePointerClick, Search, X } from 'lucide-react';
import { useDispatchVocabulary } from '@/hooks/useDispatchVocabulary';
import { STATIC_CLOSE_BUTTON_CLASS } from '@/lib/heroStatic';
import { findAnchor, findStepTarget } from '@/training/anchors';
import { helpSuggestions, practiceHref, searchHelp, type HelpContext, type HelpEntry } from '@/training/help';
import { moduleSeconds } from '@/training/registry';
import { formatDuration } from '@/training/text';
import type { TrackId } from '@/training/types';
import Coachmark from './Coachmark';
import StepText from './StepText';

/**
 * The navbar's Help: type what you're trying to do, pick a match, and either
 * get pointed at the control on this page ("Show me here") or practise it
 * in its training module. Show me here only points: it never changes the
 * event, so it is safe on a live board.
 */

/** What the page is doing, read from the board itself so Help needs no wiring into the page. */
function pageContext(): HelpContext {
  if (typeof document === 'undefined') return {};
  const boost: TrackId[] = [];
  if (document.querySelector('[data-testid="mci-tab-button"]')) boost.push('mci');
  if (document.querySelector('[data-testid="unit-live-location"]')) boost.push('tak');
  return { boostTracks: boost };
}

/** "Show me here": a coachmark for one step, moving on to the module's next pointer step when it is on screen. */
function LiveGuide({ entry, onClose, t }: { entry: HelpEntry; onClose: () => void; t: (key: string) => string }) {
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
  return (
    <>
      <Coachmark step={step} label={step.title} />
      <aside
        role="dialog"
        aria-label="Help"
        data-testid="help-live-guide"
        data-react-aria-top-layer="true"
        className="pointer-events-auto fixed bottom-4 left-4 z-[1100] w-[min(360px,calc(100vw-2rem))] rounded-xl border border-accent/50 bg-surface-deep/95 p-4 text-sm text-surface-light shadow-2xl backdrop-blur"
      >
        <div className="mb-1 flex items-center justify-between text-xs uppercase tracking-wide text-surface-light/60">
          <span>Help · {entry.module.title}</span>
          <button type="button" aria-label="Close help" className="rounded p-1 hover:bg-surface-liner" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
        <h2 className="text-base font-semibold text-surface">{step.title}</h2>
        <p className="mt-1 leading-relaxed text-surface-light/90">
          <StepText text={step.body} t={t} />
        </p>
        {!found && <p className="mt-2 text-xs text-status-yellow">That control isn&apos;t on screen right now. It may be on another tab of the board.</p>}
        <div className="mt-3 flex items-center justify-between gap-2">
          <Button as={Link} href={practiceHref({ module: entry.module, step })} target="_blank" size="sm" variant="light" startContent={<GraduationCap className="h-3.5 w-3.5" />}>
            Practise it
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
        </div>
      </aside>
    </>
  );
}

export default function HelpButton({ className = '' }: { className?: string }) {
  const { activePreset } = useDispatchVocabulary();
  const t = useCallback((key: string) => activePreset.terms[key] ?? key, [activePreset]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [ctx, setCtx] = useState<HelpContext>({});
  const [guide, setGuide] = useState<HelpEntry | null>(null);
  const [onPage, setOnPage] = useState<Set<string>>(new Set());
  const inputRef = useRef<HTMLInputElement>(null);
  const closeGuide = useCallback(() => setGuide(null), []);

  const results = useMemo(() => (query.trim() ? searchHelp(query, ctx, t) : helpSuggestions(ctx, t)), [query, ctx, t]);

  // Which results can be pointed at on this page, checked when the list changes.
  useEffect(() => {
    if (!open) return;
    const visible = new Set<string>();
    for (const r of results) if (r.step.liveSafe && findStepTarget(r.step)) visible.add(`${r.module.id}:${r.step.id}`);
    setOnPage(visible);
  }, [open, results]);

  const openHelp = () => {
    setCtx(pageContext());
    setGuide(null);
    setOpen(true);
  };

  return (
    <>
      <Tooltip content="Help: what are you trying to do?" placement="bottom">
        <Button
          isIconOnly
          variant="flat"
          aria-label="Help"
          data-testid="help-button"
          className={`h-8 w-8 min-w-8 !rounded-circle bg-surface-deeper/70 text-surface-light hover:bg-surface-deeper ${className}`}
          onPress={openHelp}
        >
          <CircleHelp className="size-4" />
        </Button>
      </Tooltip>

      <Modal isOpen={open} onOpenChange={setOpen} placement="top-center" size="lg" classNames={{ base: 'bg-surface-deepest text-surface-light mt-16', closeButton: STATIC_CLOSE_BUTTON_CLASS }}>
        <ModalContent>
          <ModalHeader className="flex flex-col gap-1 pb-1">
            <span className="text-lg font-semibold text-surface">What are you trying to do?</span>
            <span className="text-xs font-normal text-surface-light/70">Find the step, then have it pointed out here or practise it with sample data.</span>
          </ModalHeader>
          <ModalBody className="pb-5">
            <Input
              ref={inputRef}
              autoFocus
              aria-label="Search help"
              placeholder="e.g. assign a team, patient to hospital, declare MCI"
              value={query}
              onValueChange={setQuery}
              startContent={<Search className="h-4 w-4 text-surface-light/60" />}
              data-testid="help-search"
              classNames={{
                input: 'outline-none focus:outline-none data-[focus=true]:outline-none focus:ring-0 focus-visible:ring-0',
                inputWrapper: 'group-data-[focus-visible=true]:ring-0 group-data-[focus-visible=true]:ring-offset-0',
              }}
            />
            {!query.trim() && results.length > 0 && <p className="text-xs uppercase tracking-wide text-surface-light/50">Common questions</p>}
            {query.trim() && results.length === 0 && (
              <p className="text-sm text-surface-light/70">
                Nothing matches yet. Try other words, or browse <Link href="/training" className="text-accent hover:underline">all training</Link>.
              </p>
            )}
            <ul className="flex flex-col gap-1" data-testid="help-results">
              {results.map((r) => {
                const here = onPage.has(`${r.module.id}:${r.step.id}`);
                return (
                  <li key={`${r.module.id}:${r.step.id}`} className="rounded-lg border border-surface-liner p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-semibold text-surface">{r.title}</div>
                        <div className="text-xs text-surface-light/60">
                          {r.module.title} · {r.step.section} · {formatDuration(moduleSeconds(r.module))}
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-1">
                        {here && (
                          <Button
                            size="sm"
                            color="primary"
                            startContent={<MousePointerClick className="h-3.5 w-3.5" />}
                            data-testid="help-show-me"
                            onPress={() => {
                              setOpen(false);
                              setGuide(r);
                            }}
                          >
                            Show me
                          </Button>
                        )}
                        <Button as={Link} href={practiceHref(r)} target="_blank" size="sm" variant="flat" data-testid="help-practise">
                          Practise
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
            <Link href="/training" className="self-start text-xs text-accent hover:underline" onClick={() => setOpen(false)}>
              Browse all training modules
            </Link>
          </ModalBody>
        </ModalContent>
      </Modal>

      {guide && <LiveGuide entry={guide} onClose={closeGuide} t={t} />}
    </>
  );
}
