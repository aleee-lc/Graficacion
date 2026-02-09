import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { ProyectoService, Proyecto, EstadoProyecto } from '../services/proyecto.service';

interface ColorProyecto {
  valor: string;
  gradient: string;
  label: string;
}

interface EstadoInfo {
  iconPath: string;
  colorClass: string;
  bgClass: string;
  label: string;
}

@Component({
  selector: 'app-proyectos',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './proyectos.html',
  styleUrls: ['./proyectos.css']
})
export class Proyectos {

  get proyectos(): Proyecto[] {
    return this.proyectoService.getProyectos();
  }

  entrevistas: { proyectoId: string }[] = [];
  encuestas: { proyectoId: string }[] = [];
  observaciones: { proyectoId: string }[] = [];

  showForm = false;
  selectedProyecto: Proyecto | null = null;

  // Form state
  nombre = '';
  descripcion = '';
  fechaInicio = new Date().toISOString().split('T')[0];
  estado: EstadoProyecto = 'en-progreso';
  color = 'blue';

  readonly COLORES_PROYECTO: ColorProyecto[] = [
    { valor: 'blue', gradient: 'linear-gradient(135deg, #3b82f6, #06b6d4)', label: 'Azul' },
    { valor: 'emerald', gradient: 'linear-gradient(135deg, #10b981, #34d399)', label: 'Verde' },
    { valor: 'purple', gradient: 'linear-gradient(135deg, #8b5cf6, #a78bfa)', label: 'Púrpura' },
    { valor: 'orange', gradient: 'linear-gradient(135deg, #f97316, #fb923c)', label: 'Naranja' },
    { valor: 'pink', gradient: 'linear-gradient(135deg, #ec4899, #f472b6)', label: 'Rosa' },
    { valor: 'indigo', gradient: 'linear-gradient(135deg, #6366f1, #818cf8)', label: 'Índigo' },
  ];

  handleSubmit(): void {
    if (!this.nombre || !this.descripcion) return;

    const nuevoProyecto: Proyecto = {
      id: this.generateUUID(),
      nombre: this.nombre,
      descripcion: this.descripcion,
      fechaInicio: this.fechaInicio,
      estado: this.estado,
      stakeholders: [],
      procesos: [],
      color: this.color,
    };

    this.proyectoService.addProyecto(nuevoProyecto);
    this.resetForm();
  }

  resetForm(): void {
    this.nombre = '';
    this.descripcion = '';
    this.fechaInicio = new Date().toISOString().split('T')[0];
    this.estado = 'en-progreso';
    this.color = 'blue';
    this.showForm = false;
  }

  getEstadoInfo(estado: string): EstadoInfo {
    switch (estado) {
      case 'planificacion':
        return { iconPath: 'clock', colorClass: 'estado-planificacion', bgClass: 'estado-bg-planificacion', label: 'Planificación' };
      case 'en-progreso':
        return { iconPath: 'play', colorClass: 'estado-progreso', bgClass: 'estado-bg-progreso', label: 'En Progreso' };
      case 'completado':
        return { iconPath: 'check', colorClass: 'estado-completado', bgClass: 'estado-bg-completado', label: 'Completado' };
      case 'pausado':
        return { iconPath: 'pause', colorClass: 'estado-pausado', bgClass: 'estado-bg-pausado', label: 'Pausado' };
      default:
        return { iconPath: 'clock', colorClass: 'estado-planificacion', bgClass: 'estado-bg-planificacion', label: 'Desconocido' };
    }
  }

  getProyectoAnalisis(proyecto: Proyecto): number {
    return this.entrevistas.filter(e => e.proyectoId === proyecto.id).length
      + this.encuestas.filter(e => e.proyectoId === proyecto.id).length
      + this.observaciones.filter(o => o.proyectoId === proyecto.id).length;
  }

  getGradient(colorValor: string): string {
    const c = this.COLORES_PROYECTO.find(x => x.valor === colorValor);
    return c ? c.gradient : this.COLORES_PROYECTO[0].gradient;
  }

  deleteProyecto(id: string, event: Event): void {
    event.stopPropagation();
    if (confirm('¿Eliminar este proyecto y todos sus datos?')) {
      this.proyectoService.deleteProyecto(id);
    }
  }

  openPreview(proyecto: Proyecto, event: Event): void {
    event.stopPropagation();
    this.selectedProyecto = proyecto;
  }

  constructor(private router: Router, private proyectoService: ProyectoService) {}

  selectProyecto(proyectoId: string): void {
    this.router.navigate(['/proyecto', proyectoId, 'stakeholders']);
  }

  closeModal(): void {
    this.selectedProyecto = null;
  }

  openAndClose(): void {
    if (this.selectedProyecto) {
      const id = this.selectedProyecto.id;
      this.selectedProyecto = null;
      this.selectProyecto(id);
    }
  }

  formatDate(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-ES');
  }

  formatDateLong(dateString: string): string {
    return new Date(dateString).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  get totalAnalisis(): number {
    return this.entrevistas.length + this.encuestas.length + this.observaciones.length;
  }

  get proyectosEnProgreso(): number {
    return this.proyectos.filter(p => p.estado === 'en-progreso').length;
  }

  get proyectosCompletados(): number {
    return this.proyectos.filter(p => p.estado === 'completado').length;
  }
}