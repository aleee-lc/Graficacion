import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Landing } from './pages/landing/landing';
import { Home } from './pages/home/home';
import { AppShell } from './pages/app-shell/app-shell';

export const routes: Routes = [
  { path: '', redirectTo: 'landing', pathMatch: 'full' },
  { path: 'landing', component: Landing },
  { path: 'login', component: Login },
  { path: 'home', component: Home },
  { path: 'app-shell', component: AppShell },
];

