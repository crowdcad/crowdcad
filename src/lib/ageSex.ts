// The dispatch tables edit a call's age and sex together in one "A/S" cell,
// e.g. "34M", "34 m", "M/34", "34-F".

/** "34/M" from separate age and sex values; empty parts are dropped. */
export function formatAgeSex(age?: string | number, gender?: string): string {
  return [typeof age === 'number' ? String(age) : age?.trim(), gender?.trim()]
    .filter(Boolean)
    .join('/');
}

/**
 * Splits a free-typed A/S value into age and sex. The first part containing
 * a digit is the age; the next other part is the sex. A lowercase letter
 * directly after a number is capitalized ("34 m" -> "34M") without otherwise
 * touching spacing.
 */
export function parseAgeSex(val: string): { age: string; gender: string } {
  const processed = val.replace(/(\d)\s*([a-z])/g, (_match, digit: string, letter: string) => digit + letter.toUpperCase());
  const parts = processed.split(/[,\-\/]/).filter(Boolean);

  let age = '';
  let gender = '';
  if (parts.length === 1) {
    if (/\d/.test(parts[0])) age = parts[0];
    else gender = parts[0];
  } else {
    for (const p of parts) {
      if (!age && /\d/.test(p)) age = p;
      else if (!gender) gender = p;
    }
  }
  return { age, gender };
}
