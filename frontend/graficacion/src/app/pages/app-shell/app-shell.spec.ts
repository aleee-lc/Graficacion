import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { TraceabilityService } from '../../services/traceability.service';

import { AppShell } from './app-shell';

describe('AppShell', () => {
  let component: AppShell;
  let fixture: ComponentFixture<AppShell>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppShell],
      providers: [
        provideRouter([]),
        {
          provide: TraceabilityService,
          useValue: {
            getFlowStatus: () =>
              of({
                flow_status: {
                  progress_percent: 0,
                  completed_steps: 0,
                  steps: {
                    step1: { complete: false, locked: false },
                    step2: { complete: false, locked: true },
                    step3: { complete: false, locked: true },
                    step4: { complete: false, locked: true },
                    step5: { complete: false, locked: true }
                  },
                  counts: {
                    stakeholders_count: 0,
                    sessions_count: 0,
                    sessions_without_evidence_count: 0,
                    findings_count: 0,
                    requirements_count: 0,
                    trace_links_count: 0
                  },
                  next_action: {
                    step: 1,
                    route: '/projects/1',
                    message: 'Add objective and stakeholders.'
                  }
                }
              })
          }
        }
      ]
    })
    .compileComponents();

    fixture = TestBed.createComponent(AppShell);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
