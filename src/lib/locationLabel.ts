/**
 * Location labels written by live tracking (TAK, D65) describe a team near a
 * post rather than at it: "Near Gate A", "250 m from Gate A", "1.2 km from
 * Gate A". Map pins and "View on map" place such a team at that post.
 *
 * A location that is itself a post's name always wins, so a post really named
 * "Near the stage" is never cut down.
 */
const NEAR = /^Near (.+)$/;
const FROM = /^\d+(?:\.\d+)? k?m from (.+)$/;

export function resolvePostName(location: string | undefined | null, isPost: (name: string) => boolean): string | null {
  if (!location) return null;
  if (isPost(location)) return location;
  const m = NEAR.exec(location) ?? FROM.exec(location);
  return m && isPost(m[1]!) ? m[1]! : null;
}
