/** Codes a dispatcher can type in a team's status menu on a call to pick that status. */
export const STATUS_CODES: Record<string, string> = {
  UTL: 'Unable to Locate',
  NMM: 'NMM',
  AMA: 'Refusal',
};

/** The code for a status, when it isn't just the status's own name. */
export function codeForStatus(status: string): string | undefined {
  return Object.entries(STATUS_CODES).find(([code, s]) => s === status && code !== s)?.[0];
}

/** The status a typed run of letters ends in a code for, among `options`. */
export function statusForTyped(typed: string, options: string[]): string | undefined {
  const upper = typed.toUpperCase();
  const code = Object.keys(STATUS_CODES).find((c) => upper.endsWith(c));
  const status = code ? STATUS_CODES[code] : undefined;
  return status && options.includes(status) ? status : undefined;
}
