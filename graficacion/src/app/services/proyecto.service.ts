import { Injectable } from '@angular/core';

export type EstadoProyecto = 'planificacion' | 'en-progreso' | 'completado' | 'pausado';

export interface Proyecto {
  id: string;
  nombre: string;
  descripcion: string;
  fechaInicio: string;
  estado: EstadoProyecto;
  stakeholders: string[];
  procesos: string[];
  color: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProyectoService {
  private proyectos: Proyecto[] = [];

  getProyectos(): Proyecto[] {
    return this.proyectos;
  }

  setProyectos(proyectos: Proyecto[]): void {
    this.proyectos = proyectos;
  }

  addProyecto(proyecto: Proyecto): void {
    this.proyectos.push(proyecto);
  }

  deleteProyecto(id: string): void {
    this.proyectos = this.proyectos.filter(p => p.id !== id);
  }

  getProyectoById(id: string): Proyecto | undefined {
    return this.proyectos.find(p => p.id === id);
  }
}