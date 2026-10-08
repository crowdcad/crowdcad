import type { HeatCell, HistorySegment } from './historyStats';

/**
 * Exports of an event's TAK location history for the owner (D62): the
 * 5-minute summaries behind the stats, and the heat-map cells, as CSV or
 * GeoJSON (for GIS tools). Built in the browser from what the summary page
 * already loaded; nothing is sent anywhere.
 */

const iso = (ms: number) => new Date(ms).toISOString();

function csvCell(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

const csv = (rows: (string | number | null | undefined)[][]) => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';

/** One row per 5-minute window: team, device, time, mean position, spread, reports, seconds credited. */
export function historyCsv(segments: HistorySegment[], teamName: (teamId: string) => string): string {
  const rows: (string | number | null)[][] = [
    ['team', 'device', 'window_start_utc', 'latitude', 'longitude', 'spread_m', 'reports', 'seconds', 'segment_start_utc', 'segment_end_utc'],
  ];
  const sorted = [...segments].sort((a, b) => a.startedAt - b.startedAt);
  for (const seg of sorted) {
    for (const w of [...seg.windows].sort((a, b) => a.t0 - b.t0)) {
      rows.push([
        teamName(seg.teamId),
        seg.deviceUid,
        iso(w.t0),
        w.lat,
        w.lon,
        w.spreadM,
        w.n,
        w.secs,
        iso(seg.startedAt),
        seg.endedAt === null ? null : iso(seg.endedAt),
      ]);
    }
  }
  return csv(rows);
}

/** One row per heat-map cell: its center and the seconds spent there. */
export function heatCsv(cells: HeatCell[], cellM: number): string {
  return csv([['latitude', 'longitude', 'seconds', 'cell_m'], ...[...cells].sort((a, b) => b.secs - a.secs).map((c) => [c.lat, c.lon, c.secs, cellM])]);
}

/** Heat-map cells as GeoJSON squares, with `seconds` on each. */
export function heatGeoJson(cells: HeatCell[], cellM: number): string {
  const features = cells.map((c) => {
    const dLat = cellM / 2 / 111_195;
    const dLon = cellM / 2 / (111_195 * Math.cos((c.lat * Math.PI) / 180));
    const r = (n: number) => Number(n.toFixed(7));
    const ring = [
      [c.lon - dLon, c.lat - dLat],
      [c.lon + dLon, c.lat - dLat],
      [c.lon + dLon, c.lat + dLat],
      [c.lon - dLon, c.lat + dLat],
      [c.lon - dLon, c.lat - dLat],
    ].map(([x, y]) => [r(x!), r(y!)]);
    return { type: 'Feature', properties: { seconds: c.secs }, geometry: { type: 'Polygon', coordinates: [ring] } };
  });
  return JSON.stringify({ type: 'FeatureCollection', features });
}

/** A file name safe on every OS, e.g. "Spring Show tak-history.csv". */
export function exportFileName(eventName: string, suffix: string): string {
  const base = eventName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'event';
  return `${base} ${suffix}`;
}
