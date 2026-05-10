import { CommonModule } from '@angular/common';
import { Component, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  TraceabilityService,
  type FlowStatus,
  type TraceabilityItem
} from '../../services/traceability.service';

@Component({
  selector: 'app-flow-traceability',
  imports: [CommonModule, RouterLink],
  templateUrl: './flow-traceability.html'
})
export class FlowTraceabilityPage {
  readonly projectId = signal<number | null>(null);
  readonly traceability = signal<TraceabilityItem[]>([]);
  readonly flowStatus = signal<FlowStatus | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly traceabilityService: TraceabilityService
  ) {
    this.route.paramMap.subscribe((params) => {
      const id = Number(params.get('id'));
      if (Number.isNaN(id)) {
        this.error.set('Invalid project id.');
        this.loading.set(false);
        return;
      }
      this.projectId.set(id);
      this.loadFlowStatus(id);
    });
  }

  hasMissingLinks(item: TraceabilityItem) {
    return item.links.some((link) => link.stakeholders.length < 1 || link.evidences.length < 1);
  }

  chainHealth(item: TraceabilityItem) {
    const total = item.links.length;
    if (total === 0) {
      return 'Missing chain';
    }
    const valid = item.links.filter((link) => link.stakeholders.length > 0 && link.evidences.length > 0).length;
    return `${valid}/${total} links complete`;
  }

  private loadFlowStatus(projectId: number) {
    this.loading.set(true);
    this.error.set(null);
    this.traceabilityService.getFlowStatus(projectId).subscribe({
      next: (response) => {
        this.flowStatus.set(response.flow_status);
        if (response.flow_status.steps.step5.locked) {
          this.error.set(response.flow_status.next_action.message);
          this.router.navigate(['/projects', projectId, 'requirements']);
          return;
        }
        this.loadTraceability(projectId);
      },
      error: () => {
        this.flowStatus.set(null);
        this.loadTraceability(projectId);
      }
    });
  }

  private loadTraceability(projectId: number) {
    this.traceabilityService.getTraceability(projectId).subscribe({
      next: (response) => {
        this.traceability.set(response.traceability ?? []);
        this.loading.set(false);
      },
      error: () => {
        this.traceability.set([]);
        this.error.set('Could not load traceability.');
        this.loading.set(false);
      }
    });
  }
}
