import "server-only";

export const OPS_PAGE_SIZE = 20;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

/** Reads a 1-based `page` query value; anything malformed is page 1. */
export function parsePageParam(value: string | string[] | undefined): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const n = raw && /^\d{1,6}$/.test(raw) ? Number(raw) : 1;
  return n >= 1 ? n : 1;
}

/** Clamps a requested page to the last page that exists for `total`. */
export function clampPage(page: number, total: number, pageSize = OPS_PAGE_SIZE): number {
  return Math.min(Math.max(1, page), Math.max(1, Math.ceil(total / pageSize)));
}
