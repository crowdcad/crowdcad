import { BriefcaseMedical, HousePlus, MapPin, type LucideIcon } from 'lucide-react';
import type { PostPoint } from '@/app/types';
import { extensions } from '@/extensions';

/** The map pin icon for a venue location: a clinic, a location an extension pack marks medical, or a plain pin. */
export function postIcon(post: Pick<PostPoint, 'isClinic'> & Partial<PostPoint>, isClinic = !!post.isClinic): LucideIcon {
  if (isClinic) return HousePlus;
  return extensions.some((x) => x.postMarker?.(post as PostPoint) === 'medical') ? BriefcaseMedical : MapPin;
}
