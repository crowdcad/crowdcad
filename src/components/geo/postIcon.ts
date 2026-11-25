import type { PostPoint } from '@/app/types';
import { extensions } from '@/extensions';

/** How a venue location is drawn (mapSymbol.tsx): a clinic, a location an extension pack marks medical, or a plain post. */
export function postSymbol(post: Pick<PostPoint, 'isClinic'> & Partial<PostPoint>, isClinic = !!post.isClinic): { kind: 'post' | 'clinic'; glyph: 'dot' | 'briefcase' } {
  if (isClinic) return { kind: 'clinic', glyph: 'dot' };
  return { kind: 'post', glyph: extensions.some((x) => x.postMarker?.(post as PostPoint) === 'medical') ? 'briefcase' : 'dot' };
}
