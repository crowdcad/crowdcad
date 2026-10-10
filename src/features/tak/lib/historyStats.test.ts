import { describe, expect, it } from 'vitest';
import { heatCells, MIN_GAP_MS, teamHistoryStats, type HistorySegment, type HistoryWindowDoc } from './historyStats';

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
  it('turns grid cells into positions and merges overlapping segments', () => {
    const a = seg('t1', [], { '0,0': 60, '0,1': 30 });
    const b = seg('t2', [], { '0,0': 40 });
    const cells = heatCells([a, b]).sort((x, y) => x.lat - y.lat);
    expect(cells).toHaveLength(2);
    expect(cells[0]!.secs).toBe(100);
    expect((cells[0]!.lat - base.lat) / M).toBeCloseTo(2.5, 1); // cell center, 2.5 m north
    expect((cells[1]!.lat - base.lat) / M).toBeCloseTo(7.5, 1);
  });
});
