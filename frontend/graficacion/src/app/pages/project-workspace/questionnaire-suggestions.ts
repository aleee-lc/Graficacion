import type { SurveyQuestion } from '../../services/traceability.service';

const question = (
  question_text: string,
  question_type: SurveyQuestion['question_type'],
  required: boolean,
  options: string[],
  sort_order: number
): SurveyQuestion => ({ question_text, question_type, required, options, sort_order });

// This local generator is intentionally domain-aware so questionnaires work without AI services.
export const buildLocalQuestionnaireSuggestions = (input: {
  title: string;
  description: string;
  objective: string;
  prompt: string;
}): SurveyQuestion[] => {
  const sourceText = `${input.title} ${input.description} ${input.objective} ${input.prompt}`.toLowerCase();
  const isRestaurant = /restaurante|mesa|mesero|cajero|comanda|pedido|cocina|cuenta|propina|menu|menú/.test(sourceText);
  const isWaiter = /mesero|mesa|comanda|pedido|cliente|orden/.test(sourceText);
  const isCashier = /cajero|caja|pago|cuenta|ticket|factura|cobro/.test(sourceText);

  if (isRestaurant && isWaiter) {
    return [
      question('Cuando tomas una orden, que datos necesitas registrar para evitar errores en cocina?', 'long_text', true, [], 0),
      question(
        'En que momento se pierden o confunden con mayor frecuencia las comandas?',
        'single_choice',
        true,
        ['Al tomar la orden', 'Al enviarla a cocina', 'Al modificar platillos', 'Al cerrar la cuenta', 'Otro'],
        1
      ),
      question(
        'Como deberia avisarte el sistema cuando cocina marca un platillo como listo?',
        'multiple_choice',
        true,
        ['Notificacion visual', 'Sonido', 'Cambio de color por mesa', 'Lista de pendientes', 'No necesito aviso'],
        2
      ),
      question('Que cambios de una orden ocurren mas seguido despues de enviarla a cocina?', 'long_text', true, [], 3),
      question('Que tan facil es saber el estado actual de cada mesa?', 'scale_1_5', true, [], 4),
      question('Necesitas separar cuentas por persona o producto?', 'yes_no', true, [], 5),
      question('Que informacion de una mesa deberia verse de inmediato sin abrir detalle?', 'long_text', true, [], 6),
      question('Que error del sistema actual afecta mas la experiencia del cliente?', 'long_text', true, [], 7)
    ];
  }

  if (isRestaurant && isCashier) {
    return [
      question(
        'Que datos necesitas validar antes de cerrar una cuenta?',
        'multiple_choice',
        true,
        ['Mesa', 'Productos consumidos', 'Descuentos', 'Metodo de pago', 'Propina', 'Facturacion'],
        0
      ),
      question('Cuales son los problemas mas frecuentes al dividir una cuenta?', 'long_text', true, [], 1),
      question(
        'Que metodos de pago deben soportarse y combinarse en una misma cuenta?',
        'multiple_choice',
        true,
        ['Efectivo', 'Tarjeta', 'Transferencia', 'Vales', 'Cortesia', 'Mixto'],
        2
      ),
      question('Que tan rapido puedes corregir un cobro equivocado?', 'scale_1_5', true, [], 3),
      question('El sistema debe generar factura o ticket fiscal desde caja?', 'yes_no', true, [], 4),
      question('Que informacion necesitas para hacer corte de caja sin diferencias?', 'long_text', true, [], 5),
      question(
        'En que paso se generan mas filas o espera para el cliente?',
        'single_choice',
        true,
        ['Solicitar cuenta', 'Dividir cuenta', 'Procesar pago', 'Facturar', 'Corregir errores'],
        6
      ),
      question('Que reportes diarios necesita caja al finalizar turno?', 'long_text', true, [], 7)
    ];
  }

  const focus = input.prompt || input.objective || input.title || input.description || 'el proceso';
  const normalizedFocus = focus.trim().replace(/\s+/g, ' ');
  return [
    question(`Describe como realizas actualmente ${normalizedFocus}.`, 'long_text', true, [], 0),
    question(`Que problemas encuentras con mayor frecuencia en ${normalizedFocus}?`, 'long_text', true, [], 1),
    question('Que tan satisfecho estas con el flujo actual?', 'scale_1_5', true, [], 2),
    question('Que paso te toma mas tiempo o genera mas retrabajo?', 'short_text', true, [], 3),
    question('Que informacion necesitas ver para completar tu trabajo sin errores?', 'long_text', true, [], 4),
    question('Que prioridad tendria mejorar este flujo?', 'single_choice', true, ['Baja', 'Media', 'Alta', 'Critica'], 5),
    question(
      'Que herramientas o canales usas durante este proceso?',
      'multiple_choice',
      false,
      ['Sistema actual', 'Excel/hojas de calculo', 'WhatsApp/chat', 'Correo', 'Papel', 'Otro'],
      6
    ),
    question('Hay errores recurrentes que el sistema deberia prevenir?', 'yes_no', true, [], 7)
  ];
};
