'use client';

import React from 'react';
import { parseStepText } from '@/training/text';

/** A step's text with bold runs, value chips and links. */
export default function StepText({ text, t }: { text: string; t: (key: string) => string }) {
  return (
    <>
      {parseStepText(text, t).map((part, i) =>
        part.kind === 'bold' ? (
          <strong key={i} className="font-semibold text-surface">{part.text}</strong>
        ) : part.kind === 'link' ? (
          <a key={i} href={part.href} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-2">
            {part.text}
          </a>
        ) : part.kind === 'value' ? (
          <code
            key={i}
            className="mx-0.5 inline-block rounded border border-accent/40 bg-accent/15 px-1.5 py-px font-mono text-[0.92em] text-surface"
          >
            {part.text}
          </code>
        ) : (
          <React.Fragment key={i}>{part.text}</React.Fragment>
        )
      )}
    </>
  );
}
