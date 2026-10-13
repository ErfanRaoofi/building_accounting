import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { paginateQuery, type Pagination } from '../common/pagination';
import { CreatePurchaseInquiryDto } from './dto';

@Injectable()
export class PurchaseInquiriesService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreatePurchaseInquiryDto) {
    return this.prisma.purchaseInquiry.create({
      data: {
        name: dto.name.trim(),
        mobile: dto.mobile.trim(),
        buildingName: dto.buildingName.trim(),
        planId: dto.planId.trim(),
        planLabel: dto.planLabel.trim(),
        note: dto.note?.trim() || null,
      },
    });
  }

  list(pagination: Pagination) {
    return paginateQuery(
      pagination,
      () => this.prisma.purchaseInquiry.count(),
      (skip, take) =>
        this.prisma.purchaseInquiry.findMany({
          orderBy: { createdAt: 'desc' },
          skip,
          take,
        }),
      () =>
        this.prisma.purchaseInquiry.findMany({
          orderBy: { createdAt: 'desc' },
        }),
    );
  }
}
