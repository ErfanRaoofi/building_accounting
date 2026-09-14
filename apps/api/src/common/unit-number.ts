export function compareUnitNumber(a?: string | null, b?: string | null) {
  const left = (a ?? '').trim();
  const right = (b ?? '').trim();
  if (!left && !right) {
    return 0;
  }
  if (!left) {
    return 1;
  }
  if (!right) {
    return -1;
  }
  return left.localeCompare(right, 'en', { numeric: true, sensitivity: 'base' });
}

export function sortByUnitNumber<T>(rows: T[], getNumber: (row: T) => string | null | undefined): T[] {
  return [...rows].sort((x, y) => compareUnitNumber(getNumber(x), getNumber(y)));
}
