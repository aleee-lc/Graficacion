import { CommonModule } from '@angular/common';
import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  TraceabilityService,
  type SurveyForm,
  type SurveyQuestion
} from '../../services/traceability.service';

@Component({
  selector: 'app-survey-response',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './survey-response.html',
  styleUrl: './survey-response.css'
})
export class SurveyResponsePage {
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly submitted = signal(false);
  readonly error = signal<string | null>(null);
  readonly survey = signal<SurveyForm | null>(null);
  readonly questions = signal<SurveyQuestion[]>([]);
  readonly recipients = signal<Array<{ id: number; name: string; role: string }>>([]);
  readonly selectedStakeholderId = signal<number | null>(null);
  readonly respondentName = signal('');
  readonly respondentContact = signal('');
  readonly notes = signal('');
  readonly selectedFiles = signal<File[]>([]);
  readonly answers = signal<Record<number, string | number | boolean | string[]>>({});

  readonly token = computed(() => this.route.snapshot.paramMap.get('token') ?? '');

  constructor(
    private readonly route: ActivatedRoute,
    private readonly traceabilityService: TraceabilityService
  ) {
    this.loadSurvey();
  }

  updateAnswer(questionId: number, value: string | number | boolean | string[]) {
    this.answers.set({ ...this.answers(), [questionId]: value });
  }

  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    this.selectedFiles.set(Array.from(input.files ?? []));
  }

  toggleMultipleChoice(questionId: number, option: string, checked: boolean) {
    const current = this.answers()[questionId];
    const values = Array.isArray(current) ? current : [];
    this.updateAnswer(questionId, checked ? [...values, option] : values.filter((item) => item !== option));
  }

  isMultipleChoiceSelected(questionId: number, option: string) {
    const current = this.answers()[questionId];
    return Array.isArray(current) && current.includes(option);
  }

  submit() {
    const token = this.token();
    const answers = this.answers();
    const missing = this.questions().find((question) => {
      const value = answers[question.id ?? 0];
      return question.required && (value === undefined || value === '' || (Array.isArray(value) && value.length === 0));
    });
    if (missing) {
      this.error.set(`Responde la pregunta requerida: ${missing.question_text}`);
      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.traceabilityService
      .submitPublicQuestionnaireResponse(token, {
        stakeholder_id: this.selectedStakeholderId(),
        respondent_name: this.respondentName() || null,
        respondent_contact: this.respondentContact() || null,
        response_mode: this.resolveResponseMode(),
        notes: this.notes() || null,
        answers: this.questions()
          .filter((question) => question.id && answers[question.id] !== undefined)
          .map((question) => ({ question_id: question.id as number, answer: answers[question.id as number] }))
      }, this.selectedFiles())
      .subscribe({
        next: () => {
          this.saving.set(false);
          this.submitted.set(true);
        },
        error: (err) => {
          this.saving.set(false);
          this.error.set(err?.error?.message ?? 'No se pudo enviar la respuesta.');
        }
      });
  }

  private loadSurvey() {
    this.traceabilityService.getPublicSurvey(this.token()).subscribe({
      next: (response) => {
        this.survey.set(response.survey);
        this.questions.set(response.questions ?? []);
        this.recipients.set(response.recipients ?? []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err?.error?.message ?? 'No se pudo abrir la encuesta.');
        this.loading.set(false);
      }
    });
  }

  private resolveResponseMode() {
    const form = this.survey();
    if (form?.category === 'interview') return 'interview' as const;
    if (form?.category === 'document') return 'document' as const;
    if (form?.category === 'observation') return 'observation' as const;
    if (form?.category === 'transaction') return 'transaction' as const;
    if (this.selectedFiles().some((file) => file.type.toLowerCase().startsWith('audio/'))) return 'audio' as const;
    return 'form' as const;
  }
}
