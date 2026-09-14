import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { BuildingsService } from './buildings.service';
import { AddBuildingMemberDto, CreateBuildingDto, UpdateBuildingDto, UpdateBuildingMemberDto } from './dto';
import { CurrentUser, AuthUser } from '../common/decorators/current-user.decorator';
import { Roles, SUPER_ADMIN } from '../common/decorators/roles.decorator';
import { parsePagination } from '../common/pagination';
import { MAX_LOGO_BYTES } from '../common/uploads';

@Controller('buildings')
export class BuildingsController {
  constructor(private buildings: BuildingsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Query() query: Record<string, string>) {
    return this.buildings.list(user, parsePagination(query));
  }

  @Get(':id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.buildings.get(user, id);
  }

  @Get(':id/members')
  members(@CurrentUser() user: AuthUser, @Param('id') id: string, @Query() query: Record<string, string>) {
    return this.buildings.members(user, id, parsePagination(query));
  }

  @Post(':id/members')
  addMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddBuildingMemberDto) {
    return this.buildings.addMember(user, id, dto);
  }

  @Patch(':id/members/:userId')
  updateMember(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() dto: UpdateBuildingMemberDto,
  ) {
    return this.buildings.updateMember(user, id, userId, dto);
  }

  @Delete(':id/members/:userId')
  removeMember(@CurrentUser() user: AuthUser, @Param('id') id: string, @Param('userId') userId: string) {
    return this.buildings.removeMember(user, id, userId);
  }

  @Roles(SUPER_ADMIN)
  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateBuildingDto) {
    return this.buildings.create(user, dto);
  }

  @Patch(':id')
  update(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: UpdateBuildingDto) {
    return this.buildings.update(user, id, dto);
  }

  @Post(':id/logo')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_LOGO_BYTES },
    }),
  )
  uploadLogo(@CurrentUser() user: AuthUser, @Param('id') id: string, @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number }) {
    return this.buildings.uploadLogo(user, id, file);
  }

  @Delete(':id/logo')
  removeLogo(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.buildings.removeLogo(user, id);
  }

  @Roles(SUPER_ADMIN)
  @Delete(':id')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.buildings.remove(user, id);
  }
}
