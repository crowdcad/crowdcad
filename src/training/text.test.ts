import { describe, expect, it } from 'vitest';
import { parseStepText, plainStepText } from './text';

describe('parseStepText', () => {
  it('reads bold, values and https links', () => {
    expect(parseStepText('Tap **Go**, type `A14` and see [START](https://example.org/start).', (k) => k)).toEqual([
      { kind: 'text', text: 'Tap ' },
      { kind: 'bold', text: 'Go' },
      { kind: 'text', text: ', type ' },
      { kind: 'value', text: 'A14' },
      { kind: 'text', text: ' and see ' },
      { kind: 'link', text: 'START', href: 'https://example.org/start' },
      { kind: 'text', text: '.' },
    ]);
  });

  it('leaves links that are not https as text', () => {
    expect(parseStepText('[x](javascript:alert(1))', (k) => k)).toEqual([{ kind: 'text', text: '[x](javascript:alert(1))' }]);
  });

  it('keeps a link label in plain text', () => {
    expect(plainStepText('See [JumpSTART](https://example.org/j).')).toBe('See JumpSTART.');
  });
});
