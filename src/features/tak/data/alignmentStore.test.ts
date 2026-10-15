import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Layer } from '@/app/types';
import type { TakMapAlignment } from '../types';

const mocks = vi.hoisted(() => ({
  backend: { pocketbase: false },
  db: {
    getCollection: vi.fn(),
    queryCollection: vi.fn(),
    setDocument: vi.fn(),
    updateDocument: vi.fn(),
    addDocument: vi.fn(),
    deleteDocument: vi.fn(),
  },
}));

vi.mock('@/lib/services', () => ({
  dbService: mocks.db,
  get isPocketbaseBackend() {
    return mocks.backend.pocketbase;
  },
}));

const { alignmentMatches, deleteAlignment, loadAlignments, saveAlignment, takMapStatus } = await import('./alignmentStore');

const alignment: TakMapAlignment = {
  mapUrl: 'https://example.org/map.png',
  naturalWidth: 2400,
  naturalHeight: 1600,
  controlPoints: [{ x: 10, y: 20, lat: 45, lon: -100 }],
  origin: { lat: 45, lon: -100 },
  transform: { a: 1, b: 0, c: 50, d: 0, e: -1, f: 50 },
  residualM: 2.5,
  ownerUid: 'OWN',
  updatedAt: 1,
};

beforeEach(() => {
  for (const fn of Object.values(mocks.db)) fn.mockReset();
});

describe('alignmentStore on Firebase', () => {
  beforeEach(() => {
    mocks.backend.pocketbase = false;
  });

  it('writes to events/{eventId}/takMapAlignment/{layerId}', async () => {
    await saveAlignment('E1', 'L1', alignment);
    expect(mocks.db.setDocument).toHaveBeenCalledWith('events/E1/takMapAlignment', 'L1', alignment);
  });

  it('loads alignments keyed by layer id', async () => {
    mocks.db.getCollection.mockResolvedValue([{ id: 'L1', exists: true, data: alignment }]);
    expect(await loadAlignments('E1')).toEqual({ L1: alignment });
    expect(mocks.db.getCollection).toHaveBeenCalledWith('events/E1/takMapAlignment');
  });

  it('deletes by layer id', async () => {
    await deleteAlignment('E1', 'L1');
    expect(mocks.db.deleteDocument).toHaveBeenCalledWith('events/E1/takMapAlignment', 'L1');
  });
});

describe('alignmentStore on PocketBase', () => {
  beforeEach(() => {
    mocks.backend.pocketbase = true;
  });

  it('creates a tak_map_alignment record with event and layerId', async () => {
    mocks.db.queryCollection.mockResolvedValue([]);
    await saveAlignment('E1', 'L1', alignment);
    expect(mocks.db.addDocument).toHaveBeenCalledWith('tak_map_alignment', { ...alignment, event: 'E1', layerId: 'L1' });
  });

  it('updates an existing record without resending event or layerId', async () => {
    mocks.db.queryCollection.mockResolvedValue([{ id: 'rec1', exists: true, data: { ...alignment, event: 'E1', layerId: 'L1' } }]);
    await saveAlignment('E1', 'L1', alignment);
    expect(mocks.db.updateDocument).toHaveBeenCalledWith('tak_map_alignment', 'rec1', alignment);
    expect(mocks.db.addDocument).not.toHaveBeenCalled();
  });

  it('loads alignments keyed by layerId, filling gaps safely', async () => {
    mocks.db.queryCollection.mockResolvedValue([
      { id: 'rec1', exists: true, data: { ...alignment, event: 'E1', layerId: 'L1' } },
      { id: 'rec2', exists: true, data: { event: 'E1', layerId: 'L2', mapUrl: 'x' } },
    ]);
    const loaded = await loadAlignments('E1');
    expect(loaded.L1).toEqual(alignment); // PocketBase-only keys are not leaked
    expect(loaded.L2).toMatchObject({ mapUrl: 'x', residualM: null, controlPoints: [] });
  });
});

describe('alignmentMatches', () => {
  it('applies only to the image it was made for', () => {
    expect(alignmentMatches(alignment, alignment.mapUrl)).toBe(true);
    expect(alignmentMatches(alignment, 'https://example.org/new-map.png')).toBe(false);
    expect(alignmentMatches(undefined, alignment.mapUrl)).toBe(false);
  });
});

describe('takMapStatus', () => {
  const layer = (extra: Partial<Layer>): Layer => ({ id: 'L1', name: 'Main', posts: [], ...extra }) as Layer;

  it('counts a drawn area as ready without alignment', () => {
    const area = { polygon: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }] };
    expect(takMapStatus(layer({ area }))).toEqual({ ready: true, text: 'drawn on the real map, ready' });
  });

  it('skips a layer with neither image nor area', () => {
    expect(takMapStatus(layer({}))).toBeNull();
  });

  it('reports an aligned image with its accuracy', () => {
    expect(takMapStatus(layer({ mapUrl: alignment.mapUrl, alignment }))).toEqual({ ready: true, text: 'aligned, about 2.5 m' });
  });

  it('flags an image changed since it was aligned', () => {
    expect(takMapStatus(layer({ mapUrl: 'https://example.org/new.png', alignment }))?.ready).toBe(false);
    expect(takMapStatus(layer({ mapUrl: 'https://example.org/new.png', alignment }))?.text).toMatch(/changed/);
  });

  it('says where to align an unaligned image', () => {
    expect(takMapStatus(layer({ mapUrl: alignment.mapUrl }))?.text).toMatch(/Map alignment step/);
  });
});
