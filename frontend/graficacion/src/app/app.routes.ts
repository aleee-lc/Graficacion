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
import { FlowFindingsPage } from './pages/flow-findings/flow-findings';
import { FlowProjectPage } from './pages/flow-project/flow-project';
import { FlowRequirementsPage } from './pages/flow-requirements/flow-requirements';
import { FlowSessionsPage } from './pages/flow-sessions/flow-sessions';
import { FlowTraceabilityPage } from './pages/flow-traceability/flow-traceability';
import { ProjectWorkspace } from './pages/project-workspace/project-workspace';
import { SurveyResponsePage } from './pages/survey-response/survey-response';
import { authChildGuard } from './services/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'landing', pathMatch: 'full' },
  { path: 'landing', component: Landing },
  { path: 'login', component: Login },
  { path: 'surveys/respond/:token', component: SurveyResponsePage },
  { path: 'questionnaires/respond/:token', component: SurveyResponsePage },
  {
    path: '',
    component: AppShell,
    canActivateChild: [authChildGuard],
    children: [
      { path: 'home', component: Home },
      { path: 'projects/:id/workspace', component: ProjectWorkspace },
      { path: 'projects/:id', redirectTo: 'projects/:id/workspace', pathMatch: 'full' },
      { path: 'projects/:id/context-legacy', component: FlowProjectPage },
      { path: 'projects/:id/sessions', component: FlowSessionsPage },
      { path: 'projects/:id/findings', component: FlowFindingsPage },
      { path: 'projects/:id/requirements', component: FlowRequirementsPage },
      { path: 'projects/:id/traceability', component: FlowTraceabilityPage },
      { path: 'users', component: Users },
      { path: 'projects/:id/legacy', component: ProjectDetail },
      { path: 'projects/:projectId/processes', component: ProcessesPage },
      { path: 'projects/:projectId/processes/:processId/subprocesses', component: SubprocessesPage },
      { path: 'projects/:projectId/subprocesses/:subprocessId/techniques', component: TechniquesPage }
    ]
  }
];

