import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { parsePagination } from '../common/pagination';

@Controller('expense-categories')
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('buildingId') buildingId: string, @Query() query: Record<string, string>) {
    return this.categories.list(user, buildingId, parsePagination(query));
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateCategoryDto) {
    return this.categories.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categories.update(user, id, dto);
  }
}
