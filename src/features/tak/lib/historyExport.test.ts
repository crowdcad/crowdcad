import { describe, expect, it } from 'vitest';
import { exportFileName, heatCsv, heatGeoJson, historyCsv } from './historyExport';
import type { HistorySegment } from './historyStats';

const T0 = Date.parse('2026-10-07T18:00:00Z');
const seg = (teamId: string, startedAt: number, windows: HistorySegment['windows'], endedAt: number | null = null): HistorySegment => ({
  segmentId: `${teamId}-${startedAt}`,
  deviceUid: `dev-${teamId}`,
  teamId,
  startedAt,
  endedAt,
  windows,
  grid: { cellM: 5, originLat: 0, originLon: 0, cells: {} },
});

describe('historyCsv', () => {
  it('lists every window in time order with readable team names', () => {
    const text = historyCsv(
      [
        seg('t2', T0 + 600_000, [{ t0: T0 + 600_000, lat: 1, lon: 2, spreadM: 3, n: 4, secs: 50 }]),
        seg('t1', T0, [{ t0: T0, lat: 37.77, lon: -122.48, spreadM: 1.5, n: 10, secs: 300 }], T0 + 300_000),
      ],
      (id) => (id === 't1' ? 'Medic, "One"' : 'Team 2'),
    );
    const lines = text.trimEnd().split('\r\n');
    expect(lines[0]).toBe('team,device,window_start_utc,latitude,longitude,spread_m,reports,seconds,segment_start_utc,segment_end_utc');
    expect(lines[1]).toBe('"Medic, ""One""",dev-t1,2026-10-07T18:00:00.000Z,37.77,-122.48,1.5,10,300,2026-10-07T18:00:00.000Z,2026-10-07T18:05:00.000Z');
    expect(lines[2]).toMatch(/^Team 2,dev-t2,2026-10-07T18:10:00.000Z,1,2,3,4,50,2026-10-07T18:10:00.000Z,$/);
  });
});

describe('heat exports', () => {
  const cells = [
    { lat: 37.77, lon: -122.48, secs: 10 },
    { lat: 37.7701, lon: -122.48, secs: 90 },
  ];

  it('CSV lists cells, longest first', () => {
    expect(heatCsv(cells, 5).split('\r\n').slice(0, 3)).toEqual(['latitude,longitude,seconds,cell_m', '37.7701,-122.48,90,5', '37.77,-122.48,10,5']);
  });

  it('GeoJSON has a closed 5 m square per cell', () => {
    const fc = JSON.parse(heatGeoJson(cells, 5)) as { features: { properties: { seconds: number }; geometry: { coordinates: number[][][] } }[] };
    expect(fc.features).toHaveLength(2);
    const ring = fc.features[0]!.geometry.coordinates[0]!;
    expect(ring).toHaveLength(5);
    expect(ring[0]).toEqual(ring[4]);
    expect((ring[2]![1]! - ring[0]![1]!) * 111_195).toBeCloseTo(5, 1);
    expect(fc.features[0]!.properties.seconds).toBe(10);
  });

  it('makes safe file names', () => {
    expect(exportFileName('Show: A/B?', 'tak-history.csv')).toBe('Show A B tak-history.csv');
    expect(exportFileName('  ', 'x.csv')).toBe('event x.csv');
  });
});
