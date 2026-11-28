import { describe, expect, it } from 'vitest';
import { codeForStatus, statusForTyped } from './statusCodes';

const OPTIONS = ['En Route', 'On Scene', 'Unable to Locate', 'Refusal', 'NMM'];

describe('status codes', () => {
  it('pick the status a typed code stands for, in any case', () => {
    expect(statusForTyped('utl', OPTIONS)).toBe('Unable to Locate');
    expect(statusForTyped('NMM', OPTIONS)).toBe('NMM');
    expect(statusForTyped('xAMA', OPTIONS)).toBe('Refusal');
  });

  it('ignore codes for statuses the menu does not offer, and partial codes', () => {
    expect(statusForTyped('AMA', ['En Route'])).toBeUndefined();
    expect(statusForTyped('UT', OPTIONS)).toBeUndefined();
  });

  it('label a menu item with its code', () => {
    expect(codeForStatus('Unable to Locate')).toBe('UTL');
    expect(codeForStatus('Refusal')).toBe('AMA');
    expect(codeForStatus('NMM')).toBe('NMM');
    expect(codeForStatus('On Scene')).toBeUndefined();
  });
});
