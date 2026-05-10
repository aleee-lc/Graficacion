import { Component, DestroyRef, inject, signal } from '@angular/core';
import {
  NavigationEnd,
  Router,
  RouterLink,
  RouterOutlet,
} from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly isLanding = signal(this.isLandingUrl(this.router.url));
  protected readonly title = signal('graficacion');

  constructor() {
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe((event) => {
        this.isLanding.set(this.isLandingUrl(event.urlAfterRedirects));
      });
  }

  private isLandingUrl(url: string): boolean {
    return url === '/' || url.startsWith('/landing');
  }
}
