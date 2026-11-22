/**
 * HTTP security headers for every response, used by next.config.js here
 * and by root's next.config.js (`require('./core/security-headers')`), so
 * both sites send the same policy.
 *
 * The Content Security Policy's main job is `connect-src`: injected script
 * (a compromised dependency, an XSS) can't send data to a host that isn't
 * listed. That matters most for Lite, whose events must never leave the
 * browser. It ships as Report-Only (violations show in the browser console,
 * nothing is blocked) until CSP_ENFORCE=on, so a missed host can't break a
 * live deployment. Next.js needs inline scripts, so script-src keeps
 * 'unsafe-inline' (nonces would force every page to render dynamically).
 */

/** Origin of a URL, or null when it isn't one. */
function originOf(url) {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** Hosts of custom basemap tiles (NEXT_PUBLIC_TAK_BASEMAPS, a JSON list with `tiles` URL templates). */
function basemapOrigins() {
  try {
    const list = JSON.parse(process.env.NEXT_PUBLIC_TAK_BASEMAPS || '[]');
    return Array.isArray(list) ? list.map((b) => originOf(String(b.tiles || '').replace(/\{[^}]+\}/g, '0'))).filter(Boolean) : [];
  } catch {
    return [];
  }
}

function contentSecurityPolicy({ dev }) {
  const pocketbase = originOf(process.env.NEXT_PUBLIC_POCKETBASE_URL || '');
  const geocoder = process.env.NEXT_PUBLIC_TAK_GEOCODER_URL;
  const connect = [
    "'self'",
    // Firebase: Firestore, Auth (identitytoolkit, securetoken), Storage, auth domain.
    'https://*.googleapis.com',
    'https://*.firebaseio.com',
    'wss://*.firebaseio.com',
    'https://*.firebaseapp.com',
    'https://*.firebasestorage.app',
    // Default map styles, tiles, glyphs and sprites (OpenFreeMap), and place search (Photon).
    'https://tiles.openfreemap.org',
    !geocoder ? 'https://photon.komoot.io' : geocoder === 'off' ? null : originOf(geocoder),
    pocketbase,
    ...basemapOrigins(),
    ...(dev ? ['http://localhost:*', 'http://127.0.0.1:*', 'ws://localhost:*', 'ws://127.0.0.1:*'] : []),
  ].filter(Boolean);

  const directives = {
    'default-src': ["'self'"],
    'script-src': ["'self'", "'unsafe-inline'", "'wasm-unsafe-eval'", 'https://apis.google.com', ...(dev ? ["'unsafe-eval'"] : [])],
    'style-src': ["'self'", "'unsafe-inline'"],
    'font-src': ["'self'", 'data:'],
    // Map tiles and uploaded venue maps come from the hosts above; data:/blob: for generated images.
    'img-src': ["'self'", 'data:', 'blob:', ...connect.filter((c) => c.startsWith('https://') || c.startsWith('http://'))],
    'connect-src': connect,
    'worker-src': ["'self'", 'blob:'],
    // Firebase popup/redirect sign-in uses the project's auth domain in a frame.
    'frame-src': ["'self'", 'https://*.firebaseapp.com', 'https://apis.google.com'],
    // Only CrowdCAD itself may frame a page: a phone training module runs in a same-origin frame on a computer.
    'frame-ancestors': ["'self'"],
    'object-src': ["'none'"],
    'base-uri': ["'self'"],
    'form-action': ["'self'"],
  };
  return Object.entries(directives)
    .map(([name, values]) => `${name} ${[...new Set(values)].join(' ')}`)
    .join('; ');
}

/** Headers for next.config.js `headers()`. */
function securityHeaders({ dev = process.env.NODE_ENV !== 'production' } = {}) {
  const enforce = process.env.CSP_ENFORCE === 'on';
  return [
    { key: enforce ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only', value: contentSecurityPolicy({ dev }) },
    { key: 'X-Content-Type-Options', value: 'nosniff' },
    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
    { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
    // Camera: scanning codes with the camera. Geolocation: "Use my location" when aligning a map.
    { key: 'Permissions-Policy', value: 'camera=(self), geolocation=(self), microphone=(), payment=(), usb=()' },
    // Browsers ignore HSTS over plain http (e.g. a PocketBase LAN deployment), so it's safe to always send.
    ...(dev ? [] : [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]),
  ];
}

module.exports = { securityHeaders, contentSecurityPolicy };
