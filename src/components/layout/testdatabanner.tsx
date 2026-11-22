/**
 * A strip across the bottom of every page on a test instance, built with
 * NEXT_PUBLIC_TEST_DATA_ONLY=on (e.g. a shared dev or beta deployment). Real
 * patient information entered on someone else's test instance is data its
 * operator holds without the agreements a healthcare deployment needs, so the
 * warning can't be dismissed. Clicks pass through it.
 */
export const TEST_DATA_ONLY = process.env.NEXT_PUBLIC_TEST_DATA_ONLY === 'on';

export default function TestDataBanner() {
  if (!TEST_DATA_ONLY) return null;
  return (
    <div
      role="note"
      data-testid="test-data-banner"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[9999] bg-amber-400/95 px-3 py-0.5 text-center text-xs font-semibold text-black"
    >
      Test instance: use made-up data only. Never enter real patient information.
    </div>
  );
}
