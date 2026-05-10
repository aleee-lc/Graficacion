import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

const requireAuth = () => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const token = authService.getToken();

  if (!token) {
    return router.createUrlTree(['/login']);
  }

  return true;
};

export const authGuard: CanActivateFn = () => requireAuth();
export const authChildGuard: CanActivateChildFn = () => requireAuth();

