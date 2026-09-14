import { Component, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { ContextService, Building } from '../../core/context.service';
import { AuthService } from '../../core/auth.service';
import { ToastService } from '../../core/toast.service';
import { ALL_QUERY, DEFAULT_PAGE_SIZE, Paged, pageQuery } from '../../core/pagination';
import { withBusy } from '../../core/with-busy';
import { FiscalYears } from '../fiscal-years/fiscal-years';
import { Tariffs } from '../tariffs/tariffs';
import { Pager } from '../../shared/pager';
import { Skeleton } from '../../shared/skeleton';
import { Busy } from '../../shared/busy';
import { FormRail } from '../../shared/form-rail';
import { FormModal } from '../../shared/form-modal';
import { IconAction } from '../../shared/icon-action';
import { PasswordInput } from '../../shared/password-input';
import { LogoCropper } from '../../shared/logo-cropper';
import { BuildingLogo } from '../../shared/building-logo';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, FiscalYears, Tariffs, Pager, Skeleton, Busy, FormRail, FormModal, IconAction, PasswordInput, LogoCropper, BuildingLogo],
  templateUrl: './settings.html',
})
export class Settings {
  private http = inject(HttpClient);
  private fb = inject(FormBuilder);
  private toast = inject(ToastService);
  ctx = inject(ContextService);
  auth = inject(AuthService);
  tabs = computed(() => {
    const items = [
      { id: 'profile', label: 'مشخصات' },
      { id: 'years', label: 'سال مالی' },
      { id: 'tariffs', label: 'تعرفه‌ها' },
      { id: 'types', label: 'انواع دریافت' },
      { id: 'categories', label: 'سرفصل هزینه' },
    ];
    if (this.auth.canManageMembers()) {
      items.push(
        { id: 'members', label: 'اعضا' },
        { id: 'requests', label: this.requestsTotal() ? `درخواست‌ها (${this.requestsTotal()})` : 'درخواست‌ها' },
      );
    }
    return items;
  });
  tab = signal('profile');
  receiptTypes = signal<any[]>([]);
  typesTotal = signal(0);
  categories = signal<any[]>([]);
  catsTotal = signal(0);
  categoryOptions = signal<any[]>([]);
  members = signal<any[]>([]);
  membersTotal = signal(0);
  buildingUnits = signal<{ id: string; number: string }[]>([]);
  requests = signal<any[]>([]);
  requestsTotal = signal(0);
  typesPage = signal(1);
  typesSize = signal(DEFAULT_PAGE_SIZE);
  catsPage = signal(1);
  catsSize = signal(DEFAULT_PAGE_SIZE);
  membersPage = signal(1);
  membersSize = signal(DEFAULT_PAGE_SIZE);
  requestsPage = signal(1);
  requestsSize = signal(DEFAULT_PAGE_SIZE);
  typesLoading = signal(false);
  catsLoading = signal(false);
  membersLoading = signal(false);
  requestsLoading = signal(false);
  savingProfile = signal(false);
  savingLogo = signal(false);
  cropper = viewChild(LogoCropper);
  addingType = signal(false);
  addingCategory = signal(false);
  addingMember = signal(false);
  reviewingId = signal<string | null>(null);
  removingId = signal<string | null>(null);
  typeOpen = signal(false);
  categoryOpen = signal(false);
  memberOpen = signal(false);
  editingMemberId = signal<string | null>(null);
  memberRoles = signal<string[]>(['ACCOUNTANT']);
  memberUnitIds = signal<string[]>([]);
  approveOpen = signal(false);
  approveTarget = signal<any | null>(null);
  approveUnitIds = signal<string[]>([]);
  editingTypeId = signal<string | null>(null);
  editingCategoryId = signal<string | null>(null);
  profile = this.fb.nonNullable.group({
    name: ['', Validators.required],
    address: [''],
    managerName: [''],
    phone: [''],
  });
  typeForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    kind: ['OTHER'],
  });
  categoryForm = this.fb.nonNullable.group({
    name: ['', Validators.required],
    parentId: [''],
  });
  memberForm = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    name: [''],
    password: [''],
  });

  constructor() {
    effect(() => {
      const building = this.ctx.building();
      untracked(() => {
        if (!building) {
          this.receiptTypes.set([]);
          this.typesTotal.set(0);
          this.categories.set([]);
          this.catsTotal.set(0);
          this.categoryOptions.set([]);
          this.members.set([]);
          this.membersTotal.set(0);
          this.requests.set([]);
          this.requestsTotal.set(0);
          return;
        }
        this.profile.patchValue({
          name: building.name,
          address: building.address || '',
          managerName: building.managerName || '',
          phone: building.phone || '',
        });
        if (this.tab() === 'types' || this.tab() === 'categories') {
          this.loadLists(building.id);
        }
        if (this.auth.canManageMembers()) {
          this.loadRequestsList(building.id);
        }
        if (this.tab() === 'members') {
          this.loadMembers(building.id);
        }
        if (this.tab() === 'requests') {
          this.loadRequests(building.id);
        }
      });
    });
  }

  onTab(id: string) {
    this.tab.set(id);
    const buildingId = this.ctx.buildingId();
    if (!buildingId) {
      return;
    }
    if (id === 'types' || id === 'categories') {
      this.loadLists(buildingId);
    }
    if (id === 'members') {
      this.loadMembers(buildingId);
      this.loadRequestsList(buildingId);
    }
    if (id === 'requests') {
      this.loadRequests(buildingId);
    }
  }

  loadLists(buildingId: string) {
    this.typesPage.set(1);
    this.catsPage.set(1);
    this.loadTypes(buildingId);
    this.loadCats(buildingId);
    this.loadCatOptions(buildingId);
  }

  loadMembers(buildingId: string) {
    this.membersPage.set(1);
    this.loadMembersList(buildingId);
    this.loadBuildingUnits(buildingId);
  }

  loadRequests(buildingId = this.ctx.buildingId()) {
    if (!buildingId) {
      return;
    }
    this.requestsPage.set(1);
    this.loadRequestsList(buildingId);
    this.loadBuildingUnits(buildingId);
  }

  loadTypes(buildingId = this.ctx.buildingId()) {
    if (!buildingId) {
      return;
    }
    withBusy(
      this.typesLoading,
      this.http.get<Paged>('/api/receipt-types', { params: { buildingId, ...pageQuery(this.typesPage(), this.typesSize()) } }),
    ).subscribe((res) => {
      this.receiptTypes.set(res.items);
      this.typesTotal.set(res.total);
    });
  }

  loadCats(buildingId = this.ctx.buildingId()) {
    if (!buildingId) {
      return;
    }
    withBusy(
      this.catsLoading,
      this.http.get<Paged>('/api/expense-categories', { params: { buildingId, ...pageQuery(this.catsPage(), this.catsSize()) } }),
    ).subscribe((res) => {
      this.categories.set(res.items);
      this.catsTotal.set(res.total);
    });
  }

  loadCatOptions(buildingId = this.ctx.buildingId()) {
    if (!buildingId) {
      return;
    }
    this.http.get<Paged>('/api/expense-categories', { params: { buildingId, ...ALL_QUERY } }).subscribe((res) => this.categoryOptions.set(res.items));
  }

  loadMembersList(buildingId = this.ctx.buildingId()) {
    if (!buildingId) {
      return;
    }
    withBusy(
      this.membersLoading,
      this.http.get<Paged>(`/api/buildings/${buildingId}/members`, { params: pageQuery(this.membersPage(), this.membersSize()) }),
    ).subscribe((res) => {
      this.members.set(res.items);
      this.membersTotal.set(res.total);
    });
  }

  loadRequestsList(buildingId = this.ctx.buildingId()) {
    if (!buildingId) {
      return;
    }
    withBusy(
      this.requestsLoading,
      this.http.get<Paged>('/api/signup-requests', {
        params: { buildingId, status: 'PENDING', ...pageQuery(this.requestsPage(), this.requestsSize()) },
      }),
    ).subscribe({
      next: (res) => {
        this.requests.set(res.items);
        this.requestsTotal.set(res.total);
      },
      error: (err) => this.toast.show(err.error?.message || 'بارگذاری درخواست‌ها ناموفق بود'),
    });
  }

  loadBuildingUnits(buildingId = this.ctx.buildingId()) {
    if (!buildingId) {
      return;
    }
    this.http.get<Paged<{ id: string; number: string }>>('/api/units', { params: { buildingId, ...ALL_QUERY } }).subscribe((res) => {
      this.buildingUnits.set(res.items);
    });
  }

  openType() {
    this.editingTypeId.set(null);
    this.typeForm.reset({ name: '', kind: 'OTHER' });
    this.typeForm.controls.kind.enable();
    this.typeOpen.set(true);
  }

  openEditType(row: any) {
    this.editingTypeId.set(row.id);
    this.typeForm.reset({ name: row.name, kind: row.kind });
    if (row.isSystem) {
      this.typeForm.controls.kind.disable();
    } else {
      this.typeForm.controls.kind.enable();
    }
    this.typeOpen.set(true);
  }

  openCategory() {
    this.editingCategoryId.set(null);
    this.categoryForm.reset({ name: '', parentId: '' });
    this.categoryOpen.set(true);
  }

  openEditCategory(row: any) {
    this.editingCategoryId.set(row.id);
    this.categoryForm.reset({ name: row.name, parentId: row.parentId || '' });
    this.categoryOpen.set(true);
  }

  openMember() {
    this.editingMemberId.set(null);
    this.memberForm.reset({ email: '', name: '', password: '' });
    this.memberRoles.set(this.auth.isAdmin() ? ['MANAGER'] : ['ACCOUNTANT']);
    this.memberUnitIds.set([]);
    this.memberOpen.set(true);
  }

  openEditMember(row: any) {
    this.editingMemberId.set(row.id);
    this.memberForm.reset({ email: row.email, name: row.name, password: '' });
    this.memberRoles.set([...(row.roles || [])]);
    this.memberUnitIds.set((row.units || []).map((unit: { id: string }) => unit.id));
    this.memberOpen.set(true);
  }

  toggleRole(role: string) {
    const current = this.memberRoles();
    this.memberRoles.set(current.includes(role) ? current.filter((item) => item !== role) : [...current, role]);
  }

  toggleUnit(id: string) {
    const current = this.memberUnitIds();
    this.memberUnitIds.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  toggleApproveUnit(id: string) {
    const current = this.approveUnitIds();
    this.approveUnitIds.set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  addMember() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId || this.memberForm.invalid || this.addingMember()) {
      return;
    }
    const roles = this.memberRoles();
    if (!roles.length) {
      this.toast.show('حداقل یک نقش انتخاب کنید');
      return;
    }
    if (roles.includes('RESIDENT') && !this.memberUnitIds().length) {
      this.toast.show('برای ساکن حداقل یک واحد انتخاب کنید');
      return;
    }
    const value = this.memberForm.getRawValue();
    const memberId = this.editingMemberId();
    const body = memberId
      ? { roles, unitIds: this.memberUnitIds() }
      : {
          email: value.email,
          name: value.name || undefined,
          password: value.password || undefined,
          roles,
          unitIds: this.memberUnitIds(),
        };
    const request = memberId
      ? this.http.patch(`/api/buildings/${buildingId}/members/${memberId}`, body)
      : this.http.post(`/api/buildings/${buildingId}/members`, body);
    withBusy(this.addingMember, request).subscribe({
      next: () => {
        this.memberOpen.set(false);
        this.editingMemberId.set(null);
        this.loadMembers(buildingId);
        this.toast.show('عضو ساختمان ذخیره شد');
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  removeMember(userId: string) {
    const buildingId = this.ctx.buildingId();
    if (!buildingId || this.removingId()) {
      return;
    }
    this.removingId.set(userId);
    this.http.delete(`/api/buildings/${buildingId}/members/${userId}`).subscribe({
      next: () => {
        this.removingId.set(null);
        this.loadMembers(buildingId);
      },
      error: (err) => {
        this.removingId.set(null);
        this.toast.show(err.error?.message || 'خطا');
      },
    });
  }

  roleLabel(role: string) {
    if (role === 'MANAGER') return 'مدیر ساختمان';
    if (role === 'BOARD') return 'هیئت مدیره';
    if (role === 'RESIDENT') return 'ساکن';
    return 'حسابدار';
  }

  rolesLabel(roles: string[] = []) {
    return roles.map((role) => this.roleLabel(role)).join('، ') || 'بدون نقش';
  }

  openApprove(row: any) {
    this.approveTarget.set(row);
    this.approveUnitIds.set([]);
    if (row.requestedRole === 'RESIDENT') {
      this.approveOpen.set(true);
      return;
    }
    this.confirmApprove();
  }

  confirmApprove() {
    const row = this.approveTarget();
    if (!row || this.reviewingId()) {
      return;
    }
    if (row.requestedRole === 'RESIDENT' && !this.approveUnitIds().length) {
      this.toast.show('برای ساکن حداقل یک واحد انتخاب کنید');
      return;
    }
    this.reviewingId.set(row.id);
    this.http
      .post(`/api/signup-requests/${row.id}/approve`, {
        confirm: 'APPROVE',
        unitIds: this.approveUnitIds(),
      })
      .subscribe({
        next: () => {
          this.reviewingId.set(null);
          this.approveOpen.set(false);
          this.approveTarget.set(null);
          this.loadRequests();
          this.toast.show('درخواست تأیید شد');
        },
        error: (err) => {
          this.reviewingId.set(null);
          this.toast.show(err.error?.message || 'خطا');
        },
      });
  }

  rejectRequest(row: any) {
    if (this.reviewingId()) {
      return;
    }
    this.reviewingId.set(row.id);
    this.http.post(`/api/signup-requests/${row.id}/reject`, {}).subscribe({
      next: () => {
        this.reviewingId.set(null);
        this.loadRequests();
        this.toast.show('درخواست رد شد');
      },
      error: (err) => {
        this.reviewingId.set(null);
        this.toast.show(err.error?.message || 'خطا');
      },
    });
  }

  saveProfile() {
    const id = this.ctx.buildingId();
    if (!id || this.profile.invalid || this.savingProfile()) {
      return;
    }
    withBusy(this.savingProfile, this.http.patch<Building>(`/api/buildings/${id}`, this.profile.getRawValue())).subscribe({
      next: (building) => {
        this.ctx.replaceBuilding(building);
        this.toast.show('مشخصات این ساختمان ذخیره شد');
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  uploadLogo(blob: Blob) {
    const id = this.ctx.buildingId();
    if (!id || this.savingLogo()) {
      return;
    }
    const data = new FormData();
    data.append('file', blob, 'logo.png');
    withBusy(this.savingLogo, this.http.post<Building>(`/api/buildings/${id}/logo`, data)).subscribe({
      next: (building) => {
        this.ctx.replaceBuilding(building);
        this.toast.show('لوگو ذخیره شد');
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  removeLogo() {
    const id = this.ctx.buildingId();
    if (!id || this.savingLogo()) {
      return;
    }
    withBusy(this.savingLogo, this.http.delete<Building>(`/api/buildings/${id}/logo`)).subscribe({
      next: (building) => {
        this.ctx.replaceBuilding(building);
        this.toast.show('لوگو حذف شد');
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  saveType() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId || this.typeForm.invalid || this.addingType()) {
      return;
    }
    const id = this.editingTypeId();
    const value = this.typeForm.getRawValue();
    const request = id
      ? this.http.patch(`/api/receipt-types/${id}`, value)
      : this.http.post('/api/receipt-types', { buildingId, ...value });
    withBusy(this.addingType, request).subscribe({
      next: () => {
        if (id) {
          this.typeOpen.set(false);
          this.editingTypeId.set(null);
          this.typeForm.controls.kind.enable();
          this.loadTypes(buildingId);
          this.toast.show('نوع دریافت ویرایش شد');
        } else {
          this.typeForm.reset({ name: '', kind: 'OTHER' });
          this.loadLists(buildingId);
          this.toast.show('نوع دریافت ذخیره شد');
        }
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  saveCategory() {
    const buildingId = this.ctx.buildingId();
    if (!buildingId || this.categoryForm.invalid || this.addingCategory()) {
      return;
    }
    const id = this.editingCategoryId();
    const value = this.categoryForm.getRawValue();
    const payload = { name: value.name, parentId: value.parentId || null };
    const request = id
      ? this.http.patch(`/api/expense-categories/${id}`, payload)
      : this.http.post('/api/expense-categories', {
          buildingId,
          name: value.name,
          parentId: value.parentId || undefined,
        });
    withBusy(this.addingCategory, request).subscribe({
      next: () => {
        if (id) {
          this.categoryOpen.set(false);
          this.editingCategoryId.set(null);
          this.loadCats(buildingId);
          this.loadCatOptions(buildingId);
          this.toast.show('سرفصل ویرایش شد');
        } else {
          this.categoryForm.reset({ name: '', parentId: '' });
          this.loadLists(buildingId);
          this.toast.show('سرفصل ذخیره شد');
        }
      },
      error: (err) => this.toast.show(err.error?.message || 'خطا'),
    });
  }

  kindLabel(kind: string) {
    if (kind === 'CHARGE') return 'شارژ';
    if (kind === 'ENTRANCE') return 'ورودی';
    return 'سایر';
  }

  categoryLabel(c: any) {
    return c.parent ? `${c.parent.name} / ${c.name}` : c.name;
  }
}
