import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, OnDestroy, OnInit, Output, signal } from '@angular/core';
import { Subject, debounceTime, switchMap, takeUntil } from 'rxjs';
import { TraceabilityService, type EntityOption } from '../../services/traceability.service';

type OptionEntity = 'stakeholders' | 'users' | 'processes' | 'subprocesses' | 'findings' | 'requirements';

@Component({
  selector: 'app-entity-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './entity-picker.html'
})
export class EntityPickerComponent implements OnInit, OnChanges, OnDestroy {
  @Input({ required: true }) projectId!: number;
  @Input({ required: true }) entity!: OptionEntity;
  @Input() label = 'Seleccionar';
  @Input() placeholder = 'Buscar...';
  @Input() multiple = false;
  @Input() disabled = false;
  @Input() required = false;
  @Input() processId: number | null = null;
  @Input() value: number | number[] | null = null;

  @Output() valueChange = new EventEmitter<number | number[] | null>();
  @Output() optionSelected = new EventEmitter<EntityOption | null>();

  readonly options = signal<EntityOption[]>([]);
  readonly loading = signal(false);
  readonly query = signal('');
  readonly open = signal(false);
  readonly selectedOptions = signal<EntityOption[]>([]);
  readonly activeIndex = signal(0);

  private readonly search$ = new Subject<string>();
  private readonly destroy$ = new Subject<void>();

  constructor(private readonly traceabilityService: TraceabilityService) {}

  ngOnInit() {
    this.search$
      .pipe(
        debounceTime(180),
        switchMap((query) => {
          this.loading.set(true);
          return this.traceabilityService.searchOptions(this.projectId, this.entity, query, {
            process_id: this.processId
          });
        }),
        takeUntil(this.destroy$)
      )
      .subscribe({
        next: (response) => {
          this.options.set(response.options ?? []);
          this.syncSelectedFromOptions();
          this.loading.set(false);
        },
        error: () => {
          this.options.set([]);
          this.loading.set(false);
        }
      });
    this.search$.next('');
  }

  ngOnChanges() {
    if (this.projectId && this.entity) {
      this.search$.next(this.query());
    }
  }

  ngOnDestroy() {
    this.destroy$.next();
    this.destroy$.complete();
  }

  onSearch(value: string) {
    this.query.set(value);
    this.open.set(true);
    this.activeIndex.set(0);
    this.search$.next(value);
  }

  toggleOption(option: EntityOption) {
    const optionValue = Number(option.value);
    if (Number.isNaN(optionValue) || this.disabled) {
      return;
    }

    if (this.multiple) {
      const current = Array.isArray(this.value) ? this.value : [];
      const next = current.includes(optionValue)
        ? current.filter((item) => item !== optionValue)
        : [...current, optionValue];
      this.value = next;
      this.valueChange.emit(next);
      this.optionSelected.emit(option);
      this.syncSelectedFromOptions();
      return;
    }

    this.value = optionValue;
    this.valueChange.emit(optionValue);
    this.optionSelected.emit(option);
    this.selectedOptions.set([option]);
    this.open.set(false);
  }

  remove(option: EntityOption) {
    if (this.disabled) {
      return;
    }
    const optionValue = Number(option.value);
    if (this.multiple) {
      const current = Array.isArray(this.value) ? this.value : [];
      const next = current.filter((item) => item !== optionValue);
      this.value = next;
      this.valueChange.emit(next);
      this.syncSelectedFromOptions();
      return;
    }
    this.value = null;
    this.valueChange.emit(null);
    this.optionSelected.emit(null);
    this.selectedOptions.set([]);
  }

  isSelected(option: EntityOption) {
    const optionValue = Number(option.value);
    return this.multiple
      ? Array.isArray(this.value) && this.value.includes(optionValue)
      : this.value === optionValue;
  }

  initials(label: string) {
    return label
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
  }

  onKeydown(event: KeyboardEvent) {
    if (!this.open()) {
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      this.activeIndex.set(Math.min(this.activeIndex() + 1, Math.max(this.options().length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      this.activeIndex.set(Math.max(this.activeIndex() - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = this.options()[this.activeIndex()];
      if (option) {
        this.toggleOption(option);
      }
    } else if (event.key === 'Escape') {
      this.open.set(false);
    }
  }

  private syncSelectedFromOptions() {
    const current = Array.isArray(this.value) ? this.value : this.value ? [this.value] : [];
    const selected = this.options().filter((option) => current.includes(Number(option.value)));
    if (selected.length > 0 || current.length === 0) {
      this.selectedOptions.set(selected);
    }
  }
}
