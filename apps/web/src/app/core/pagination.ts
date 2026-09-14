export const DEFAULT_PAGE_SIZE = 10;
export const PAGE_SIZES = [10, 20, 50];
export const ALL_QUERY = { all: 'true' };

export type Paged<T = any> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function pageQuery(page: number, pageSize: number) {
  return { page: String(page), pageSize: String(pageSize) };
}
