import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';

@Component({
  selector: 'app-app-shell',
  imports: [CommonModule, RouterLink, RouterOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
export class AppShell {
  readonly projectId = signal<number | null>(null);

  constructor(private readonly router: Router) {
    this.updateProjectId(this.router.url);
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      const nav = event as NavigationEnd;
      this.updateProjectId(nav.urlAfterRedirects || nav.url);
    });
  }

  private updateProjectId(url: string) {
    const match = url.match(/\/projects\/(\d+)/);
    if (match) {
      this.projectId.set(Number(match[1]));
    } else {
      this.projectId.set(null);
    }
  }
}
