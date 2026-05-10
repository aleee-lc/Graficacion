import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs/operators';
import { TraceabilityService, type FlowStatus } from '../../services/traceability.service';

@Component({
  selector: 'app-app-shell',
  imports: [CommonModule, RouterLink, RouterOutlet],
  templateUrl: './app-shell.html',
  styleUrl: './app-shell.css',
})
export class AppShell {
  readonly projectId = signal<number | null>(null);
  readonly currentPath = signal('');
  readonly flowStatus = signal<FlowStatus | null>(null);
  readonly flowLoading = signal(false);

  constructor(
    private readonly router: Router,
    private readonly traceabilityService: TraceabilityService
  ) {
    this.currentPath.set(this.router.url);
    this.updateProjectId(this.router.url);
    this.refreshFlowStatus();
    this.router.events.pipe(filter((event) => event instanceof NavigationEnd)).subscribe((event) => {
      const nav = event as NavigationEnd;
      const path = nav.urlAfterRedirects || nav.url;
      this.currentPath.set(path);
      this.updateProjectId(path);
      this.refreshFlowStatus();
    });
  }

  flowSteps() {
    const projectId = this.projectId();
    if (!projectId) {
      return [];
    }

    const status = this.flowStatus();
    return [
      {
        key: 'workspace' as const,
        label: 'Workspace',
        route: `/projects/${projectId}/workspace`,
        complete: status?.completed_steps ? status.completed_steps > 0 : false,
        locked: false
      },
      {
        key: 'step1' as const,
        label: '1. Project',
        route: `/projects/${projectId}`,
        complete: status?.steps.step1.complete ?? false,
        locked: status?.steps.step1.locked ?? false
      },
      {
        key: 'step2' as const,
        label: '2. Sessions',
        route: `/projects/${projectId}/sessions`,
        complete: status?.steps.step2.complete ?? false,
        locked: status?.steps.step2.locked ?? true
      },
      {
        key: 'step3' as const,
        label: '3. Findings',
        route: `/projects/${projectId}/findings`,
        complete: status?.steps.step3.complete ?? false,
        locked: status?.steps.step3.locked ?? true
      },
      {
        key: 'step4' as const,
        label: '4. Requirements',
        route: `/projects/${projectId}/requirements`,
        complete: status?.steps.step4.complete ?? false,
        locked: status?.steps.step4.locked ?? true
      },
      {
        key: 'step5' as const,
        label: '5. Traceability',
        route: `/projects/${projectId}/traceability`,
        complete: status?.steps.step5.complete ?? false,
        locked: status?.steps.step5.locked ?? true
      }
    ];
  }

  isStepActive(route: string) {
    const current = this.currentPath();
    if (/\/projects\/\d+$/.test(route)) {
      return current === route;
    }
    return current === route || current.startsWith(`${route}/`);
  }

  progressPercent() {
    return this.flowStatus()?.progress_percent ?? 0;
  }

  nextActionRoute() {
    return this.flowStatus()?.next_action.route ?? null;
  }

  nextActionMessage() {
    return this.flowStatus()?.next_action.message ?? 'Start by completing Step 1.';
  }

  private updateProjectId(url: string) {
    const match = url.match(/\/projects\/(\d+)/);
    if (match) {
      this.projectId.set(Number(match[1]));
    } else {
      this.projectId.set(null);
    }
  }

  private refreshFlowStatus() {
    const projectId = this.projectId();
    if (!projectId) {
      this.flowStatus.set(null);
      this.flowLoading.set(false);
      return;
    }

    this.flowLoading.set(true);
    this.traceabilityService.getFlowStatus(projectId).subscribe({
      next: (response) => {
        this.flowStatus.set(response.flow_status);
        this.flowLoading.set(false);
      },
      error: () => {
        this.flowStatus.set(null);
        this.flowLoading.set(false);
      }
    });
  }
}
