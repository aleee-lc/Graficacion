# Toma de requisitos y handoff a IA

## Orden del flujo

1. Contexto del proyecto: objetivo, alcance, descripcion y fechas.
2. Stakeholders y procesos: actores, roles y procesos base.
3. Tecnicas de discovery: entrevistas, cuestionarios, observaciones, focus groups, documentos y seguimiento transaccional.
4. Evidencias: notas, transcripciones, archivos y artefactos asociados a cada tecnica.
5. Hallazgos: problemas, necesidades o restricciones derivados de evidencias.
6. Requisitos: cada requisito debe estar vinculado a uno o mas hallazgos.
7. Historias/casos, specs y diagramas: artefactos de sintesis para validar implementacion.
8. Handoff IA: paquete offline-first con specs, criterios, pruebas, trazabilidad, diagramas e ideas de diseno.

## Diagramas

El modulo `Modelado` funciona como editor visual local:

- Genera diagramas base desde requisitos y specs: casos de uso, clases, secuencia, paquetes y componentes.
- Permite ajustar nodos, conexiones y etiquetas en canvas SVG.
- Guarda diagramas editables como `06_DIAGRAMS/editables/*.drawio-lite.json`.
- Exporta diagramas secundarios Mermaid en `06_DIAGRAMS/mermaid/*.mmd`.

Los diagramas guardados entran al paquete del proyecto y al handoff de IA para que el agente vea tanto la intencion funcional como la estructura esperada.

## Specs para IA

El archivo principal de envio es:

`paquete-ia-implementacion.json`

El ZIP del proyecto usa el formato `specora-project-folder-v2` e incluye:

- `SPECORA_MANIFEST.json`
- `00_AGENT_INSTRUCTIONS.md`
- `01_PROJECT_BRIEF.md`
- `02_REQUIREMENTS.md`
- `03_USER_STORIES.md`
- `04_USE_CASES.md`
- `05_ACCEPTANCE_CRITERIA.md`
- `06_DIAGRAMS/`
- `07_DESIGN_IDEAS/`
- `08_TRACEABILITY_MATRIX.json`
- `09_BUILD_PLAN.md`

Ese JSON incluye:

- Contexto del proyecto.
- Modelo y proveedor definidos.
- Instrucciones de implementacion.
- Specs por requisito.
- Historia de usuario.
- Criterios de aceptacion.
- Endpoints sugeridos.
- Pruebas esperadas.
- Hallazgos fuente.
- Diagramas Mermaid y diagramas editables guardados.
- Ideas de diseno tipo Stitch en Markdown e imagenes.
- Matriz de trazabilidad para desarrollo.

El prompt individual por requisito se mantiene en `09_BUILD_PLAN/tasks/*.txt`, pero el ZIP es el formato principal para mandarle contexto completo a la IA sin internet.

## Perfil de agente

Specora permite elegir perfil de agente para exportacion:

- Gemini / Google: recomendado por costo para paquetes offline bien estructurados.
- Codex / OpenAI: recomendado para agentes con repo, tareas y verificacion.
- Generic Agent: perfil neutral para cualquier agente local o externo.

OpenRouter se mantiene para sintesis interna de hallazgos y requisitos, no para ejecutar el desarrollo final.
