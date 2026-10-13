import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-home-redirect',
  template: '',
})
export class HomeRedirect {
  private auth = inject(AuthService);
  private router = inject(Router);

  constructor() {
    this.router.navigateByUrl(this.auth.homePath(), { replaceUrl: true });
  }
}
