import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { sha256Hex } from '@/lib/sha256';
import { arrayRemove, arrayUnion } from '../types';
import { applyUpdate, EVENT_DOCS, fromNestedRecord, isNestedCollection, mergeDeep, nestedRecord, pbDocRef } from './docPaths';

describe('sha256Hex', () => {
  it('matches node:crypto, across block boundaries and non-ASCII text', () => {
    for (const text of ['', 'abc', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(64), 'x'.repeat(1000), 'Ñandú 🚑 events/e1/mci/state']) {
      expect(sha256Hex(text)).toBe(createHash('sha256').update(text, 'utf8').digest('hex'));
    }
  });
});

describe('pbDocRef', () => {
  it('keeps top-level collections as they are', () => {
    expect(pbDocRef('events', 'e1')).toEqual({ collection: 'events', id: 'e1' });
    expect(isNestedCollection('audit')).toBe(false);
  });

  it('maps a document under an event to one EVENT_DOCS record with a stable id', () => {
    const ref = pbDocRef('events/e1/mci', 'state');
    expect(ref.collection).toBe(EVENT_DOCS);
    expect(ref.id).toMatch(/^[a-f0-9]{15}$/);
    expect(pbDocRef('events/e1/mci', 'state').id).toBe(ref.id);
    expect(pbDocRef('events/e2/mci', 'state').id).not.toBe(ref.id);
    expect(ref.nested).toEqual({ path: 'events/e1/mci', kind: 'mci', key: 'state', event: 'e1' });
  });

  it('maps roleAccountIndex too, taking the event from the document', () => {
    const ref = pbDocRef('roleAccountIndex', 'u1');
    expect(ref.collection).toBe(EVENT_DOCS);
    expect(nestedRecord(ref, { eventId: 'e9', role: 'transport' })).toMatchObject({ kind: 'roleAccountIndex', key: 'u1', event: 'e9', owner: '' });
  });

  it('round-trips a document, and records a receipt’s owner', () => {
    const ref = pbDocRef('events/e1/roleReceipts', 'a1');
    const record = nestedRecord(ref, { uid: 'u1', summary: 'Got it' });
    expect(record).toMatchObject({ id: ref.id, owner: 'u1', event: 'e1', kind: 'roleReceipts' });
    expect(fromNestedRecord(record)).toEqual({ id: 'a1', data: { uid: 'u1', summary: 'Got it' } });
  });
});

describe('applyUpdate', () => {
  it('reaches into maps with dotted keys, clears with null and leaves the input alone', () => {
    const current = { member: { id: 'ben', lastActiveAt: 1 }, pinStates: { ben: 'set' }, deviceHash: 'h' };
    const next = applyUpdate(current, { 'member.lastActiveAt': 5, 'pinStates.ana': 'locked', deviceHash: null });
    expect(next).toEqual({ member: { id: 'ben', lastActiveAt: 5 }, pinStates: { ben: 'set', ana: 'locked' }, deviceHash: null });
    expect(current.member.lastActiveAt).toBe(1);
  });

  it('applies array union and remove', () => {
    expect(applyUpdate({ tags: ['a', 'b'] }, { tags: arrayUnion('b', 'c') })).toEqual({ tags: ['a', 'b', 'c'] });
    expect(applyUpdate({ tags: ['a', 'b'] }, { tags: arrayRemove('a') })).toEqual({ tags: ['b'] });
  });
});

describe('mergeDeep', () => {
  it('merges maps key by key, like a Firestore set with merge', () => {
    expect(mergeDeep({ pins: { a: { failed: 1 } }, keep: 1 }, { pins: { b: { failed: 0 } } })).toEqual({ pins: { a: { failed: 1 }, b: { failed: 0 } }, keep: 1 });
  });
});
