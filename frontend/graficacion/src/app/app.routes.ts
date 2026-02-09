import { Routes } from '@angular/router';
import { Login } from './pages/login/login';
import { Landing } from './pages/landing/landing';
import { Home } from './pages/home/home';
import { AppShell } from './pages/app-shell/app-shell';
import { ProjectDetail } from './pages/project/project';
import { Users } from './pages/users/users';
import { ProcessesPage } from './pages/processes/processes';
import { SubprocessesPage } from './pages/subprocesses/subprocesses';
import { TechniquesPage } from './pages/techniques/techniques';

export const routes: Routes = [
  { path: '', redirectTo: 'landing', pathMatch: 'full' },
  { path: 'landing', component: Landing },
  { path: 'login', component: Login },
  {
    path: '',
    component: AppShell,
    children: [
      { path: 'home', component: Home },
      { path: 'users', component: Users },
      { path: 'projects/:id', component: ProjectDetail },
      { path: 'projects/:projectId/processes', component: ProcessesPage },
      { path: 'projects/:projectId/processes/:processId/subprocesses', component: SubprocessesPage },
      { path: 'projects/:projectId/subprocesses/:subprocessId/techniques', component: TechniquesPage }
    ]
  }
];

