import { describe, expect, it } from 'vitest';
import { heatCells, heatGrid, MIN_GAP_MS, teamHistoryStats, type HeatCell, type HistorySegment, type HistoryWindowDoc } from './historyStats';

const base = { lat: 45.0012, lon: -100.0021 };
const M = 1 / 111_195; // degrees of latitude per meter
const T0 = Date.parse('2026-10-07T08:00:00Z');
const MIN = 60_000;
const win = (i: number, northM: number, secs = 300): HistoryWindowDoc => ({
  t0: T0 + i * 5 * MIN,
  lat: base.lat + northM * M,
  lon: base.lon,
  spreadM: 2,
  n: 60,
  secs,
});
const seg = (teamId: string, windows: HistoryWindowDoc[], cells: Record<string, number> = {}): HistorySegment => ({
  segmentId: `${teamId}-seg`,
  deviceUid: `${teamId}-dev`,
  teamId,
  startedAt: windows[0]?.t0 ?? T0,
  endedAt: null,
  windows,
  grid: { cellM: 5, originLat: base.lat, originLon: base.lon, cells },
});

describe('teamHistoryStats', () => {
  it('sums tracked time and distance between consecutive windows', () => {
    const [s] = teamHistoryStats([seg('t1', [win(0, 0), win(1, 100), win(2, 100), win(3, 0)])], []);
    expect(s!.trackedSecs).toBe(1200);
    expect(s!.distanceM).toBeCloseTo(200, 0);
  });

  it('credits time to the nearest post within 25 m', () => {
    const posts = [
      { name: 'Gate A', lat: base.lat, lon: base.lon },
      { name: 'Gate B', lat: base.lat + 100 * M, lon: base.lon },
    ];
    const [s] = teamHistoryStats([seg('t1', [win(0, 5), win(1, 10), win(2, 95), win(3, 50)])], posts);
    expect(s!.timeOnPost).toEqual([
      { post: 'Gate A', secs: 600 },
      { post: 'Gate B', secs: 300 },
    ]);
  });

  it('reports coverage gaps of at least 10 minutes', () => {
    const [s] = teamHistoryStats([seg('t1', [win(0, 0), win(1, 0), win(5, 0)])], []);
    expect(s!.gaps).toEqual([{ from: T0 + 10 * MIN, to: T0 + 25 * MIN }]);
    expect(s!.gaps[0]!.to - s!.gaps[0]!.from).toBeGreaterThanOrEqual(MIN_GAP_MS);
  });

  it('merges a team’s devices without counting jumps between them as distance', () => {
    const a = seg('t1', [win(0, 0), win(1, 0)]);
    const b = { ...seg('t1', [win(0, 500), win(1, 500)]), segmentId: 'b', deviceUid: 'dev-b' };
    const [s] = teamHistoryStats([a, b], []);
    expect(s!.trackedSecs).toBe(1200);
    expect(s!.distanceM).toBeCloseTo(500, -1); // one move from window 0 to window 1, not 0->500->0->500
  });
});

describe('heatCells', () => {
  const total = (cells: { secs: number }[]) => cells.reduce((n, c) => n + c.secs, 0);
  /** Whether any two cells' squares overlap (they may only share edges). */
  const overlapping = (cells: HeatCell[]) =>
    cells.some((a, i) =>
      cells.some((b, j) => j > i && Math.abs(a.lat - b.lat) < a.dLat! * 0.999 && Math.abs(a.lon - b.lon) < a.dLon! * 0.999),
    );
  /** A segment whose grid starts at an arbitrary first fix. */
  const segAt = (teamId: string, originLat: number, originLon: number, cells: Record<string, number>, lattice = false): HistorySegment => ({
    ...seg(teamId, [], cells),
    grid: { cellM: 5, originLat, originLon, cells, ...(lattice ? { lattice } : {}) },
  });

  it('merges segments on the event lattice exactly and keeps every second', () => {
    const g = heatGrid(5, base.lat);
    // Snapped origins, as the bridge writes them (D72): two cells apart.
    const lat = g.latStep * Math.floor(base.lat / g.latStep);
    const lon = g.lonStep * Math.floor(base.lon / g.lonStep);
    const cells = heatCells([
      segAt('t1', lat, lon, { '0,0': 60, '0,1': 30 }, true),
      segAt('t2', lat + 2 * g.latStep, lon, { '0,-2': 40 }, true),
    ]);
    expect(cells).toHaveLength(2);
    expect(cells.map((c) => c.secs).sort((a, b) => b - a)).toEqual([100, 30]);
  });

  it('puts segments with different origins on one grid: no overlapping squares, seconds kept (#137)', () => {
    const a = segAt('t1', base.lat, base.lon, { '0,0': 60, '1,0': 30, '0,1': 10 });
    // A relinked device: a new segment whose grid starts 2.1 m north and 3.3 m east of the first.
    const b = segAt('t2', base.lat + 2.1 * M, base.lon + 3.3 * M / Math.cos((base.lat * Math.PI) / 180), { '0,0': 40, '-1,0': 20 });
    const cells = heatCells([a, b]);
    expect(overlapping(cells)).toBe(false);
    expect(total(cells)).toBeCloseTo(160, 0);
    // Every cell sits on the event grid.
    const g = heatGrid(5, base.lat);
    for (const c of cells) {
      expect(c.lat / g.latStep - 0.5).toBeCloseTo(Math.round(c.lat / g.latStep - 0.5), 6);
      expect(c.lon / g.lonStep - 0.5).toBeCloseTo(Math.round(c.lon / g.lonStep - 0.5), 6);
    }
  });

  it('is empty with no cells', () => {
    expect(heatCells([seg('t1', [])])).toEqual([]);
  });
});
