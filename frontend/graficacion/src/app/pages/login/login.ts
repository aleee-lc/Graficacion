import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class Login {
  readonly loading = signal(false);
  readonly error = signal<string | null>(null);
  readonly form;

  constructor(
    private readonly fb: FormBuilder,
    private readonly authService: AuthService,
    private readonly router: Router
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      remember: [true]
    });
  }

  submit() {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      console.log('Formulario inválido');
      return;
    }

    const { email, password } = this.form.getRawValue();
    if (!email || !password) {
      console.log('Email o password vacíos');
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    console.log('Intentando login con:', { email });
    this.authService.login(email, password).subscribe({
      next: () => {
        console.log('Login exitoso');
        this.loading.set(false);
        this.router.navigate(['/home']);
      },
      error: (err) => {
        console.error('Error de login:', err);
        this.loading.set(false);
        const message =
          err?.error?.message ??
          'No se pudo iniciar sesión. Verifica tu correo y contraseña.';
        this.error.set(message);
      }
    });
  }
}
