import { Component, ElementRef, HostListener, computed, model, output, signal, viewChild } from '@angular/core';

export const LOGO_OUTPUT = 512;
const VIEW = 280;
const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

@Component({
  selector: 'app-logo-cropper',
  templateUrl: './logo-cropper.html',
})
export class LogoCropper {
  open = model(false);
  cropped = output<Blob>();
  fileInput = viewChild<ElementRef<HTMLInputElement>>('file');
  src = signal('');
  zoom = signal(1);
  panX = signal(0);
  panY = signal(0);
  naturalW = 0;
  naturalH = 0;
  busy = signal(false);
  error = signal('');
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private objectUrl = '';

  cover = computed(() => {
    if (!this.naturalW || !this.naturalH) {
      return 1;
    }
    return VIEW / Math.min(this.naturalW, this.naturalH);
  });

  dispW = computed(() => this.naturalW * this.cover() * this.zoom());
  dispH = computed(() => this.naturalH * this.cover() * this.zoom());
  originX = computed(() => this.clampOrigin((VIEW - this.dispW()) / 2 + this.panX(), this.dispW()));
  originY = computed(() => this.clampOrigin((VIEW - this.dispH()) / 2 + this.panY(), this.dispH()));

  browse() {
    this.fileInput()?.nativeElement.click();
  }

  pick(file: File | undefined | null) {
    if (!file) {
      return;
    }
    if (!file.type.startsWith('image/')) {
      this.error.set('فقط فایل تصویر انتخاب کنید');
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      this.error.set('حجم تصویر اصلی نباید بیشتر از ۱۲ مگابایت باشد');
      return;
    }
    this.revoke();
    this.objectUrl = URL.createObjectURL(file);
    this.src.set(this.objectUrl);
    this.error.set('');
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
    this.open.set(true);
  }

  onImageLoad(event: Event) {
    const img = event.target as HTMLImageElement;
    this.naturalW = img.naturalWidth;
    this.naturalH = img.naturalHeight;
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  startPan(event: PointerEvent) {
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    this.dragging = true;
    this.lastX = event.clientX;
    this.lastY = event.clientY;
  }

  movePan(event: PointerEvent) {
    if (!this.dragging) {
      return;
    }
    this.panX.set(this.panX() + event.clientX - this.lastX);
    this.panY.set(this.panY() + event.clientY - this.lastY);
    this.lastX = event.clientX;
    this.lastY = event.clientY;
    this.clampPan();
  }

  endPan() {
    this.dragging = false;
  }

  onWheel(event: WheelEvent) {
    event.preventDefault();
    const next = Math.min(4, Math.max(1, this.zoom() + (event.deltaY < 0 ? 0.12 : -0.12)));
    this.zoom.set(Number(next.toFixed(2)));
    this.clampPan();
  }

  setZoom(raw: string) {
    this.zoom.set(Number(raw) || 1);
    this.clampPan();
  }

  close() {
    this.open.set(false);
    this.revoke();
    this.src.set('');
    this.error.set('');
  }

  async confirm() {
    if (!this.src() || this.busy()) {
      return;
    }
    this.busy.set(true);
    try {
      const img = await this.loadImage(this.src());
      const canvas = document.createElement('canvas');
      canvas.width = LOGO_OUTPUT;
      canvas.height = LOGO_OUTPUT;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        throw new Error('canvas');
      }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const k = LOGO_OUTPUT / VIEW;
      ctx.drawImage(img, this.originX() * k, this.originY() * k, this.dispW() * k, this.dispH() * k);
      const blob = await this.toPng(canvas);
      if (blob.size > 2 * 1024 * 1024) {
        this.error.set('حجم فایل نهایی بیشتر از ۲ مگابایت شد. تصویر ساده‌تری انتخاب کنید');
        return;
      }
      this.cropped.emit(blob);
      this.close();
    } catch {
      this.error.set('برش تصویر انجام نشد');
    } finally {
      this.busy.set(false);
    }
  }

  @HostListener('document:keydown.escape')
  onEscape() {
    if (this.open()) {
      this.close();
    }
  }

  private clampOrigin(value: number, size: number) {
    if (size <= VIEW) {
      return (VIEW - size) / 2;
    }
    return Math.min(0, Math.max(VIEW - size, value));
  }

  private clampPan() {
    this.panX.set(this.originX() - (VIEW - this.dispW()) / 2);
    this.panY.set(this.originY() - (VIEW - this.dispH()) / 2);
  }

  private loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image'));
      img.src = src;
    });
  }

  private toPng(canvas: HTMLCanvasElement) {
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('blob'))), 'image/png');
    });
  }

  private revoke() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = '';
    }
  }
}
