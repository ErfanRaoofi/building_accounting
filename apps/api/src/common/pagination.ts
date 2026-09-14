export type PaginationQuery = {
  page?: string | number;
  pageSize?: string | number;
  all?: string | boolean;
};

export type Pagination = {
  all: boolean;
  page: number;
  pageSize: number;
  skip: number;
  take: number;
};

export type Paged<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
};

export function parsePagination(query: PaginationQuery = {}): Pagination {
  const all = query.all === true || query.all === 'true' || query.all === '1';
  const page = Math.max(1, Number(query.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 10));
  return { all, page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
}

export function pagedResult<T>(items: T[], total: number, page: number, pageSize: number): Paged<T> {
  return { items, total, page, pageSize };
}

export function pageRows<T>(rows: T[], pagination: Pagination): Paged<T> {
  const total = rows.length;
  if (pagination.all) {
    return pagedResult(rows, total, 1, total || pagination.pageSize);
  }
  const start = (pagination.page - 1) * pagination.pageSize;
  return pagedResult(rows.slice(start, start + pagination.pageSize), total, pagination.page, pagination.pageSize);
}

export async function paginateQuery<T>(
  pagination: Pagination,
  count: () => Promise<number>,
  findPage: (skip: number, take: number) => Promise<T[]>,
  findAll: () => Promise<T[]>,
): Promise<Paged<T>> {
  if (pagination.all) {
    const items = await findAll();
    return pagedResult(items, items.length, 1, items.length || pagination.pageSize);
  }
  const [total, items] = await Promise.all([count(), findPage(pagination.skip, pagination.take)]);
  return pagedResult(items, total, pagination.page, pagination.pageSize);
}
