// govet/pendientes.ts
//
// Cero dependencias externas. Solo matemática y lógica pura sobre
// MovimientoSiaf[]. Esto es lo que reproduce los modelos 659/662/675-678
// de Melissa (Ejecución Detallada y Pendientes por Devengar/Girar/Rendir/Pagar).

import { Fase, MovimientoSiaf, IndicadorPendiente, FilaEjecucionDetallada } from './types';

export interface UmbralAlerta {
  medioDias: number; // a partir de aquí, alerta MEDIO
  criticoDias: number; // a partir de aquí, alerta CRITICO
}

const UMBRAL_DEFAULT: UmbralAlerta = { medioDias: 15, criticoDias: 30 };

/**
 * Suma neta de montoSoles por expediente para una fase dada.
 * Nunca suma entre fases distintas: eso duplicaría/triplicaría ejecución,
 * porque el mismo gasto pasa por C, D, G y P con montos parecidos.
 */
function totalesPorExpediente(movs: MovimientoSiaf[], fase: Fase): Map<string, number> {
  const totales = new Map<string, number>();
  for (const m of movs) {
    if (m.fase !== fase) continue;
    if (m.montoSoles === null) continue; // no se suma lo que no se pudo leer
    totales.set(m.expediente, (totales.get(m.expediente) ?? 0) + m.montoSoles);
  }
  return totales;
}

/**
 * El movimiento "representativo" de un expediente dentro de una fase: el más
 * reciente por fecha (fechaAprobacion > fechaProceso > fechaDoc). De ahí
 * sale el proveedor, el certificado y el documento que se muestran para esa
 * fase — nunca de una fase distinta, aunque haya aparecido antes en el archivo.
 * Regla "más reciente cuando hay varias líneas" pendiente de confirmar con
 * el usuario; es la más razonable mientras tanto.
 */
function ultimoMovimientoPorExpediente(movs: MovimientoSiaf[], fase: Fase): Map<string, MovimientoSiaf> {
  const elegido = new Map<string, MovimientoSiaf>();
  for (const m of movs) {
    if (m.fase !== fase) continue;
    const actual = elegido.get(m.expediente);
    const fActual = actual ? actual.fechaAprobacion ?? actual.fechaProceso ?? actual.fechaDoc : null;
    const fNuevo = m.fechaAprobacion ?? m.fechaProceso ?? m.fechaDoc;
    if (!actual || (fNuevo && (!fActual || fNuevo > fActual))) elegido.set(m.expediente, m);
  }
  return elegido;
}

function nivelAlerta(dias: number | null, umbral: UmbralAlerta): 'BAJO' | 'MEDIO' | 'CRITICO' {
  if (dias === null) return 'BAJO';
  if (dias >= umbral.criticoDias) return 'CRITICO';
  if (dias >= umbral.medioDias) return 'MEDIO';
  return 'BAJO';
}

export interface OpcionesPendiente {
  /** Fecha contra la que se miden los días transcurridos. Default: hoy. */
  fechaCorte?: Date;
  umbral?: UmbralAlerta;
  /** Filtra por Tipo Operación antes de calcular (ej. Pendientes por Rendir: AV, A, C). */
  tiposOperacionIncluidos?: string[];
  /** Tolerancia en soles para considerar "sin saldo" (evita ruido de centavos). */
  tolerancia?: number;
  /**
   * "El candado": solo se suman movimientos cuyo estRegistro esté en esta
   * lista. Default ['A'] (Aprobado) — confirmado contra el desplegable
   * oficial de la pantalla "Formatos SIAF" (Formato A).
   * Pasa `null` para desactivar el filtro por completo (auditoría / debug).
   */
  estadosValidos?: string[] | null;
}

export const ESTADOS_VALIDOS_DEFAULT = ['A'];

/**
 * Catálogo oficial de "Est Registro" del Formato A, confirmado el 2026-09-29
 * directo del desplegable de la pantalla "Formatos SIAF" con "Tipo reporte:
 * GASTOS (FORMATO A)" — el mismo reporte que exporta el archivo que procesa
 * govet-pe. Es la fuente más fuerte que hemos tenido: la misma
 * pantalla que genera el archivo, no un endpoint ni un payload de otra vista.
 *
 * "F" se observó en datos reales (113 filas en un archivo) pero no está en
 * este desplegable: su nombre sigue sin confirmar y se muestra como
 * desconocido. Antes se le ponía "PENDIENTE DE FIRMA", igual que a BN, O, T,
 * W e Y otros nombres: esos nombres son del catálogo de estados de
 * Certificación y Compromiso Anual (ver CATALOGO_ESTADO_CERTIFICACION), no
 * de este, y sus códigos eran supuestos.
 */
export const CATALOGO_ESTADO_REGISTRO: Record<string, string> = {
  A: 'APROBADO',
  B: 'PENDIENTE DEPOSITO EN BANCO',
  D: 'DESCARTADO',
  I: 'ANULADO',
  P: 'PENDIENTE',
  R: 'RECHAZADO',
  V: 'VERIFICADO (PENDIENTE)',
  X: 'APROBADO (ANULACION EN VERIFICACION)',
};

/**
 * Estados de Certificación y Compromiso Anual (columna "Est. Env." del reporte
 * "Certificación y Compromiso Anual" del SIAF). Es otro catálogo que el de
 * Est Registro del Formato A: los mismos códigos significan otra cosa
 * (aquí V = PENDIENTE DE FIRMA y P = REGISTRADO).
 *
 * Confirmado el 2026-10-09: los nombres, con el desplegable "Estado Registro"
 * de ese reporte; los códigos A, V y P, con un export real donde el reporte
 * pone el código y el nombre en la misma fila. El desplegable trae además EN
 * BANCO DE LA NACIÓN, ENVIADO A OPP, RECHAZADO, EN TRANSITO, EN VERIFICACION,
 * EN RENIEC e INACTIVO, cuyos códigos aún no se han visto.
 */
export const CATALOGO_ESTADO_CERTIFICACION: Record<string, string> = {
  A: 'APROBADO',
  V: 'PENDIENTE DE FIRMA',
  P: 'REGISTRADO',
};

export function etiquetaEstado(codigo: string | null): string {
  if (codigo === null) return '(vacío)';
  return CATALOGO_ESTADO_REGISTRO[codigo] ?? `(desconocido: ${codigo})`;
}

/**
 * Catálogo de "Tipo Registro" — confirmado contra los conteos reales del
 * reporte de Certificación y Compromiso Anual (N=984, M=58, R=27, A=26, D=2
 * coincidieron exacto con OP.INICIAL/AMPLIACION/REBAJA/ANULACION/DEVOLUCION)
 * Y confirmado por el propio desplegable de "Formatos SIAF" con Formato A
 * seleccionado — pertenece a este reporte. Corresponde a la columna "Sec Est"
 * del Formato A (confirmado comparando sus 7 valores reales: N, H, I, D, A, e, R
 * contra este catálogo).
 */
export const CATALOGO_TIPO_REGISTRO: Record<string, string> = {
  A: 'ANULACION',
  C: "REBAJA (T.C. FAVORABLE)",
  D: 'DEVOLUCION',
  E: 'EDICION',
  e: 'EXTORNO PAGADO',
  F: 'DEVOLUCION (NOTA DE CREDITO)',
  G: 'RECTIFICACION TIPO RECURSO',
  H: 'ANULACION (RENDICION)',
  I: 'RENDICION',
  J: 'REBAJA DE GIRADO',
  L: 'REBAJA POR REASIGNACION DE RUBRO',
  M: 'AMPLIACION',
  N: 'OP.INICIAL',
  O: 'DISTRIBUCIÓN OTORGADA',
  P: 'DISTRIBUCIÓN RECIBIDA',
  Q: 'DEVOLUCIÓN DE DISTRIBUCIÓN OTORGADA',
  R: 'REBAJA',
  S: 'DEVOLUCIÓN DE DISTRIBUCIÓN RECIBIDA',
  T: 'ANULACION (REASIGNACION)',
  U: 'OP.INICIAL X REASIGNACION',
  X: 'ANULACION (ERROR DE REGISTRO)',
  Y: 'ANULACION DE DEVOLUCION DE INGRESOS',
};

/**
 * Catálogo de "Procedencia registro" — confirmado contra el desplegable
 * oficial de "Formatos SIAF" (Formato A). Capturado pero sin uso todavía
 * en ningún filtro del motor.
 */
export const CATALOGO_PROCEDENCIA_REGISTRO: Record<string, string> = {
  '0': 'REGISTRO ADMINISTRATIVO SIAF',
  '1': 'BANCO DE LA NACION',
};

/**
 * Cuenta cuántos movimientos hay por cada valor de estRegistro, separando
 * los que el filtro por defecto acepta de los que excluye. Existe para que
 * "solo contamos lo Aprobado" nunca sea una suposición silenciosa: siempre
 * queda a la vista cuánto se dejó fuera y bajo qué código.
 */
export function diagnosticoEstados(movimientos: MovimientoSiaf[], estadosValidos: string[] = ESTADOS_VALIDOS_DEFAULT) {
  const conteo = new Map<string, number>();
  for (const m of movimientos) {
    const clave = m.estRegistro ?? '(vacío)';
    conteo.set(clave, (conteo.get(clave) ?? 0) + 1);
  }
  const incluidos: Record<string, number> = {};
  const excluidos: Record<string, number> = {};
  for (const [estado, n] of conteo) {
    if (estadosValidos.includes(estado)) incluidos[estado] = n;
    else excluidos[estado] = n;
  }
  return { incluidos, excluidos };
}

/**
 * Calcula el saldo pendiente entre dos fases consecutivas del mismo expediente:
 *   pendiente('C','D') -> Pendientes por Devengar (modelo 675)
 *   pendiente('D','G') -> Pendientes por Girar    (modelo 676)
 *   pendiente('G','R') -> Pendientes por Rendir   (modelo 677, filtrar Tipo Op.)
 *   pendiente('G','P') -> Pendientes por Pagar    (modelo 678)
 */
export function pendiente(
  faseOrigen: Fase,
  faseDestino: Fase,
  movimientos: MovimientoSiaf[],
  opciones: OpcionesPendiente = {}
): IndicadorPendiente[] {
  const tolerancia = opciones.tolerancia ?? 1; // S/ 1 de tolerancia, como se acordó
  const umbral = opciones.umbral ?? UMBRAL_DEFAULT;
  const fechaCorte = opciones.fechaCorte ?? new Date();
  const estadosValidos = opciones.estadosValidos === null ? null : opciones.estadosValidos ?? ESTADOS_VALIDOS_DEFAULT;

  let filtrados = estadosValidos ? movimientos.filter((m) => m.estRegistro !== null && estadosValidos.includes(m.estRegistro)) : movimientos;
  filtrados = opciones.tiposOperacionIncluidos
    ? filtrados.filter((m) => m.tipoOperacion && opciones.tiposOperacionIncluidos!.includes(m.tipoOperacion))
    : filtrados;

  const origen = totalesPorExpediente(filtrados, faseOrigen);
  const destino = totalesPorExpediente(filtrados, faseDestino);
  const movOrigen = ultimoMovimientoPorExpediente(filtrados, faseOrigen);

  const resultado: IndicadorPendiente[] = [];

  for (const [expediente, montoOrigen] of origen) {
    const montoDestino = destino.get(expediente) ?? 0;
    const saldo = montoOrigen - montoDestino;
    if (Math.abs(saldo) < tolerancia) continue; // sin pendiente real

    const m = movOrigen.get(expediente) ?? null;
    const fechaRef = m ? m.fechaAprobacion ?? m.fechaProceso ?? m.fechaDoc : null;
    const dias = fechaRef ? Math.floor((fechaCorte.getTime() - fechaRef.getTime()) / 86_400_000) : null;

    resultado.push({
      expediente,
      montoOrigenFase: montoOrigen,
      montoDestinoFase: montoDestino,
      saldoPendiente: saldo,
      fechaReferencia: fechaRef,
      diasTranscurridos: dias,
      nivelAlerta: nivelAlerta(dias, umbral),
      certificado: m?.certificado ?? null,
      proveedorRuc: m?.proveedorRuc ?? null,
      proveedorNombre: m?.proveedorNombre ?? null,
      clasificador: m?.clasificador ?? null,
      secFuncional: m?.secFuncional ?? null,
      codDocOrigen: m?.codDoc ?? null,
      numDocOrigen: m?.numDoc ?? null,
      fechaDocOrigen: m?.fechaDoc ?? null,
      movimiento: m,
    });
  }

  // Como Melissa: ordenado por expediente (antes, por días transcurridos de mayor a menor).
  return resultado.sort((a, b) => a.expediente.localeCompare(b.expediente));
}

/** Atajo para los 4 modelos, con los filtros que ya confirmamos con tus datos. */
export const modelos = {
  pendientesPorDevengar: (movs: MovimientoSiaf[], opts?: OpcionesPendiente) => pendiente('C', 'D', movs, opts),
  pendientesPorGirar: (movs: MovimientoSiaf[], opts?: OpcionesPendiente) => pendiente('D', 'G', movs, opts),
  pendientesPorPagar: (movs: MovimientoSiaf[], opts?: OpcionesPendiente) => pendiente('G', 'P', movs, opts),
  // Rendir: encargos, viáticos y caja chica. Confirmado con la nota del
  // propio modelo de Melissa ("AV Encargo interno para viáticos; A Encargo
  // interno; C Gasto - Fondo Fijo para Caja Chica").
  pendientesPorRendir: (movs: MovimientoSiaf[], opts?: OpcionesPendiente) =>
    pendiente('G', 'R', movs, { tiposOperacionIncluidos: ['AV', 'A', 'C'], ...opts }),
};

const ORDEN_FASE: Fase[] = ['C', 'D', 'G', 'P', 'R'];

/**
 * Modelos 659/662 ("Ejecución Detallada"): a diferencia de pendiente(), acá
 * NO se agrupa por expediente ni se resta nada — cada MovimientoSiaf se
 * convierte en una fila propia, con su monto puesto en la columna que
 * corresponde a SU fase (Comprometido/Devengado/Girado/Pagado/Rendido),
 * igual que lo muestra Melissa. El candado (Est Registro) sigue aplicando.
 */
export function ejecucionDetallada(
  movimientos: MovimientoSiaf[],
  opciones: { estadosValidos?: string[] | null; fases?: Fase[] } = {}
): FilaEjecucionDetallada[] {
  const estadosValidos = opciones.estadosValidos === null ? null : opciones.estadosValidos ?? ESTADOS_VALIDOS_DEFAULT;
  const fasesIncluidas = opciones.fases ?? ['C', 'D', 'G', 'P', 'R'];

  let filtrados = estadosValidos
    ? movimientos.filter((m) => m.estRegistro !== null && estadosValidos.includes(m.estRegistro))
    : movimientos;
  filtrados = filtrados.filter((m) => fasesIncluidas.includes(m.fase));

  return filtrados
    .map((m) => ({
      movimiento: m,
      expediente: m.expediente,
      fase: m.fase,
      subRegistro: m.subRegistro,
      comprometido: m.fase === 'C' ? m.montoSoles : null,
      devengado: m.fase === 'D' ? m.montoSoles : null,
      girado: m.fase === 'G' ? m.montoSoles : null,
      pagado: m.fase === 'P' ? m.montoSoles : null,
      rendido: m.fase === 'R' ? m.montoSoles : null,
      fechaDoc: m.fechaDoc,
      codDoc: m.codDoc,
      numDoc: m.numDoc,
      proveedorRuc: m.proveedorRuc,
      proveedorNombre: m.proveedorNombre,
      clasificador: m.clasificador,
      secFuncional: m.secFuncional,
      certificado: m.certificado,
      fechaDocB: m.fechaDocB,
      codDocB: m.codDocB,
      numDocB: m.numDocB,
      proveedorBeneficiario: m.proveedorBeneficiario,
    }))
    // Como el 659 de Melissa: por expediente, luego por fase del ciclo (C, D, G, P, R) y dentro de ella por secuencia y correlativo.
    .sort(
      (a, b) =>
        a.expediente.localeCompare(b.expediente) ||
        ORDEN_FASE.indexOf(a.fase) - ORDEN_FASE.indexOf(b.fase) ||
        // Como números: la secuencia 10 va después de la 9.
        (a.subRegistro ?? '').localeCompare(b.subRegistro ?? '', undefined, { numeric: true }) ||
        (a.movimiento.correlativo ?? '').localeCompare(b.movimiento.correlativo ?? '', undefined, { numeric: true })
    );
}

export const modelosDetalle = {
  // 659: solo el ciclo de gasto corriente (Compromiso, Devengado, Girado).
  ejecucionDetallada659: (movs: MovimientoSiaf[], opts?: { estadosValidos?: string[] | null }) =>
    ejecucionDetallada(movs, { ...opts, fases: ['C', 'D', 'G'] }),
  // 662: el ciclo completo, incluye Pagado y Rendido.
  ejecucionDetallada662: (movs: MovimientoSiaf[], opts?: { estadosValidos?: string[] | null }) =>
    ejecucionDetallada(movs, { ...opts, fases: ['C', 'D', 'G', 'P', 'R'] }),
};
