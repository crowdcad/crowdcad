'use client';

import React from 'react';
import type { Call } from '@/app/types';
import { useDispatchExtras } from '@/extensions/dispatch';

/**
 * Extension packs' lines under a call (their `CallRowFooter`): a table row under the call's row on the
 * desktop table (`colSpan`), or a block inside its mobile card. Hidden while every footer renders nothing.
 */
export default function CallRowFooters({ call, colSpan }: { call: Call; colSpan?: number }) {
  const { CallRowFooters: footers } = useDispatchExtras();
  if (!footers.length) return null;
  const content = footers.map((Footer, i) => <Footer key={i} call={call} />);
  if (colSpan) {
    return (
      <tr className="[&:has(>td:empty)]:hidden">
        <td colSpan={colSpan} className="px-3 pb-2.5 pt-1 empty:hidden">
          {content}
        </td>
      </tr>
    );
  }
  return <div className="empty:hidden">{content}</div>;
}
