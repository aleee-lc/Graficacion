import { Routes } from '@angular/router';

export const routes: Routes = [
	{ path: '', redirectTo: 'proyectos', pathMatch: 'full' },
	{
		path: 'proyectos',
		loadComponent: () => import('./proyectos/proyectos').then(m => m.Proyectos)
	}
];
