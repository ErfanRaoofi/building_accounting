import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { formatJalali } from '../../core/jalali';
import { DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';

type InquiryRow = {
  id: string;
  name: string;
  mobile: string;
  buildingName: string;
  planId: string;
  planLabel: string;
  note: string | null;
  createdAt: string;
};

@Component({
  selector: 'app-purchase-inquiries',
  imports: [Pager, Skeleton],
  templateUrl: './purchase-inquiries.html',
})
export class PurchaseInquiries {
  private http = inject(HttpClient);
  rows = signal<InquiryRow[]>([]);
  total = signal(0);
  page = signal(1);
  pageSize = signal(DEFAULT_PAGE_SIZE);
  loading = signal(true);
  formatJalali = formatJalali;

  constructor() {
    this.loadList();
  }

  loadList() {
    withBusy(
      this.loading,
      this.http.get<Paged<InquiryRow>>('/api/purchase-inquiries', {
        params: pageQuery(this.page(), this.pageSize()),
      }),
    ).subscribe((res) => {
      this.rows.set(res.items);
      this.total.set(res.total);
    });
  }

}
