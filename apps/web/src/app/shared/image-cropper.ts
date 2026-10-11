import { Component, HostListener, computed, model, output, signal } from '@angular/core';

const MAX_W = 320;
const MAX_H = 420;
const MAX_SOURCE_BYTES = 15 * 1024 * 1024;
const MAX_OUTPUT_BYTES = 1800 * 1024;

@Component({
  selector: 'app-image-cropper',
  templateUrl: './image-cropper.html',
})
export class ImageCropper {
  open = model(false);
  cropped = output<Blob>();
  src = signal('');
  zoom = signal(1);
  panX = signal(0);
  panY = signal(0);
  naturalW = signal(0);
  naturalH = signal(0);
  busy = signal(false);
  error = signal('');
  private dragging = false;
  private lastX = 0;
  private lastY = 0;
  private objectUrl = '';

  frameW = computed(() => this.fitted(this.naturalW(), this.naturalH()).width);
  frameH = computed(() => this.fitted(this.naturalW(), this.naturalH()).height);
  dispW = computed(() => this.frameW() * this.zoom());
  dispH = computed(() => this.frameH() * this.zoom());
  originX = computed(() => this.clampOrigin((this.frameW() - this.dispW()) / 2 + this.panX(), this.dispW(), this.frameW()));
  originY = computed(() => this.clampOrigin((this.frameH() - this.dispH()) / 2 + this.panY(), this.dispH(), this.frameH()));

  pick(file: File | undefined | null) {
    if (!file) {
      return;
    }
    if (file.type && !file.type.startsWith('image/')) {
      this.error.set('فقط فایل تصویر انتخاب کنید');
      this.naturalW.set(0);
      this.naturalH.set(0);
      this.open.set(true);
      return;
    }
    if (file.size > MAX_SOURCE_BYTES) {
      this.error.set('حجم تصویر اصلی نباید بیشتر از ۱۵ مگابایت باشد');
      this.naturalW.set(0);
      this.naturalH.set(0);
      this.open.set(true);
      return;
    }
    this.revoke();
    this.objectUrl = URL.createObjectURL(file);
    const url = this.objectUrl;
    this.naturalW.set(0);
    this.naturalH.set(0);
    this.src.set(url);
    this.error.set('');
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
    this.open.set(true);
    void this.loadImage(url)
      .then((img) => {
        if (this.src() !== url) {
          return;
        }
        this.naturalW.set(img.naturalWidth);
        this.naturalH.set(img.naturalHeight);
      })
      .catch(() => {
        if (this.src() === url) {
          this.onImageError();
        }
      });
  }

  onImageError() {
    if (!this.src()) {
      return;
    }
    this.naturalW.set(0);
    this.naturalH.set(0);
    this.error.set('این تصویر قابل نمایش نیست. jpg یا png انتخاب کنید');
  }

  startPan(event: PointerEvent) {
    if (this.zoom() <= 1) {
      return;
    }
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
    this.setZoom(String(this.zoom() + (event.deltaY < 0 ? 0.08 : -0.08)));
  }

  setZoom(raw: string) {
    const next = Math.min(4, Math.max(1, Number(raw) || 1));
    this.zoom.set(Number(next.toFixed(2)));
    this.clampPan();
  }

  close() {
    this.open.set(false);
    this.revoke();
    this.src.set('');
    this.error.set('');
    this.naturalW.set(0);
    this.naturalH.set(0);
    this.zoom.set(1);
    this.panX.set(0);
    this.panY.set(0);
  }

  async confirm() {
    if (!this.src() || this.busy() || !this.naturalW() || !this.naturalH()) {
      if (this.src() && (!this.naturalW() || !this.naturalH())) {
        this.error.set('این تصویر قابل نمایش نیست. jpg یا png انتخاب کنید');
      }
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const img = await this.loadImage(this.src());
      const blob = await this.encode(img);
      this.cropped.emit(blob);
      this.close();
    } catch {
      this.error.set('آماده‌سازی تصویر انجام نشد. تصویر را به صورت jpg انتخاب کنید');
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

  private fitted(width: number, height: number) {
    if (!width || !height) {
      return { width: 0, height: 0 };
    }
    const scale = Math.min(MAX_W / width, MAX_H / height);
    return {
      width: Math.max(1, Math.round(width * scale)),
      height: Math.max(1, Math.round(height * scale)),
    };
  }

  private sourceRect() {
    const scale = this.dispW() / this.naturalW();
    const left = Math.max(0, this.originX());
    const top = Math.max(0, this.originY());
    const right = Math.min(this.frameW(), this.originX() + this.dispW());
    const bottom = Math.min(this.frameH(), this.originY() + this.dispH());
    const srcX = Math.max(0, (left - this.originX()) / scale);
    const srcY = Math.max(0, (top - this.originY()) / scale);
    const srcW = Math.max(1, Math.min(this.naturalW() - srcX, (right - left) / scale));
    const srcH = Math.max(1, Math.min(this.naturalH() - srcY, (bottom - top) / scale));
    return { srcX, srcY, srcW, srcH };
  }

  private async encode(img: HTMLImageElement) {
    const source = this.sourceRect();
    let edge = Math.min(1600, Math.max(source.srcW, source.srcH));
    let quality = 0.86;
    let blob = await this.render(img, source, edge, quality);
    for (let attempt = 0; attempt < 8 && blob.size > MAX_OUTPUT_BYTES; attempt += 1) {
      if (quality > 0.55) {
        quality = Number((quality - 0.08).toFixed(2));
      } else {
        edge = Math.round(edge * 0.8);
      }
      blob = await this.render(img, source, edge, quality);
    }
    return blob;
  }

  private render(
    img: HTMLImageElement,
    source: { srcX: number; srcY: number; srcW: number; srcH: number },
    edge: number,
    quality: number,
  ) {
    const long = Math.max(source.srcW, source.srcH);
    const ratio = edge / long;
    const width = Math.max(1, Math.round(source.srcW * ratio));
    const height = Math.max(1, Math.round(source.srcH * ratio));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return Promise.reject(new Error('canvas'));
    }
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, source.srcX, source.srcY, source.srcW, source.srcH, 0, 0, width, height);
    return new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('blob'))), 'image/jpeg', quality);
    });
  }

  private clampOrigin(value: number, size: number, view: number) {
    if (size <= view) {
      return (view - size) / 2;
    }
    return Math.min(0, Math.max(view - size, value));
  }

  private clampPan() {
    this.panX.set(this.originX() - (this.frameW() - this.dispW()) / 2);
    this.panY.set(this.originY() - (this.frameH() - this.dispH()) / 2);
  }

  private loadImage(src: string) {
    return new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image'));
      img.src = src;
    });
  }

  private revoke() {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = '';
    }
  }
}
