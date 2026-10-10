// govet/types.ts
//
// Contrato Universal de Datos.
// Cualquier driver (govet-pe, futuro govet-driver-co, govet-driver-mx...)
// debe producir arreglos de MovimientoSiaf. El core nunca sabe de dónde vino el dato.
//
// Regla de oro: si un campo no se pudo leer o no aplica, va `null`,
// NUNCA `0`. Un 0 falso puede esconder un problema de parseo detrás
// de un semáforo verde.

export type Fase = 'C' | 'D' | 'G' | 'P' | 'R'; // Comprometido, Devengado, Girado, Pagado, Rendido

export interface MovimientoSiaf {
  expediente: string;
  fase: Fase;
  subRegistro: string | null;
  correlativo: string | null;
  secuenciaPadre: string | null;

  certificado: string | null;
  certificadoSecuencia: string | null;

  codDoc: string | null;
  numDoc: string | null;
  fechaDoc: Date | null;
  fechaAprobacion: Date | null;
  fechaProceso: Date | null;
  /** "Fecha DB Oracle": cuándo se grabó el registro en la base del SIAF (solo la fecha, sin la hora). */
  fechaDbOracle: Date | null;

  tipoOperacion: string | null;
  estRegistro: string | null;
  /**
   * "Sec Est" en el Formato A. Confirmado contra el catálogo oficial de
   * "Tipo Registro" (pantalla Formatos SIAF): N=OP.INICIAL (caso normal,
   * >99% de las filas), el resto son reversiones/ajustes (H, I, D, A, e, R).
   */
  tipoRegistro: string | null;

  proveedorRuc: string | null;
  proveedorNombre: string | null;

  clasificador: string | null;
  secFuncional: string | null; // meta
  rubro: string | null;
  rubroNombre: string | null;

  montoSoles: number | null; // siempre neto, con signo si es rebaja/anulación

  // Bloque "B" del Formato A: documento del giro / beneficiario del pago.
  codDocB: string | null;
  numDocB: string | null;
  fechaDocB: Date | null;
  proveedorBeneficiario: string | null;

  // Resto del Formato A completo (67 columnas). Texto recortado o null; los
  // montos (tipoCambio, montoOrigen, monto) siguen la regla de parseMonto.
  moneda: string | null;
  anioEjec: string | null;
  mesEjec: string | null;
  secEjec: string | null;
  secEjec2: string | null;
  nombreEjec2: string | null;
  modCompra: string | null;
  tipoProc: string | null;
  area: string | null;
  ciclo: string | null;
  origen: string | null;
  tipoFinanc: string | null;
  tp: string | null;
  tipoRecurso: string | null; // "TR"
  tc: string | null; // "TC" (no confundir con "T.C.", el tipo de cambio)
  anioCta: string | null;
  banco: string | null;
  cuenta: string | null;
  tipoProv: string | null;
  proy: string | null;
  tipoGiro: string | null;
  tipoCambio: number | null; // "T.C."
  montoOrigen: number | null;
  anioCtb: string | null;
  mesCtb: string | null;
  diaCtb: string | null;
  prodPry: string | null;
  actAiObra: string | null;
  programa: string | null; // "Prg"
  funcion: string | null;
  divisionFunc: string | null;
  grupoFunc: string | null;
  meta: string | null;
  monto: number | null;
  anioProceso: string | null;
  mesProceso: string | null;
  diaProceso: string | null;
  estadoEnvio: string | null;
  edicion: string | null;

  // Trazabilidad: de qué fila del archivo original vino este movimiento,
  // para poder señalar un problema de datos hasta la fuente.
  filaOrigen: number;
}

export interface Advertencia {
  fila: number;
  campo: string;
  motivo: string;
}

export interface ResultadoParseo {
  movimientos: MovimientoSiaf[];
  advertencias: Advertencia[];
  columnasNoReconocidas: string[];
  totalDeclarado: number | null; // la fila "TOTAL EN MONEDA NACIONAL" del reporte, si existe
  totalCalculado: number;
  reconciliaOk: boolean; // totalDeclarado ~= totalCalculado, con tolerancia
  /** Datos de las filas sobre la cabecera; vacío si el archivo empieza en la cabecera. */
  encabezado: EncabezadoReporte;
}

/**
 * Filas sobre la cabecera del reporte del SIAF: "SECTOR | 00 - X",
 * "EJECUTORA | 008 - NOMBRE", "Fecha: | 29/09/2026"… Cada campo es el texto
 * tal cual; `titulos` son las líneas "REPORTE …" / "POR …".
 */
export interface EncabezadoReporte {
  sector?: string;
  pliego?: string;
  ejecutora?: string;
  registro?: string;
  periodo?: string;
  fecha?: string;
  hora?: string;
  titulos?: string[];
}

export interface IndicadorPendiente {
  expediente: string;
  montoOrigenFase: number;
  montoDestinoFase: number;
  saldoPendiente: number;
  fechaReferencia: Date | null; // fecha desde la que cuentan los días
  diasTranscurridos: number | null;
  nivelAlerta: 'BAJO' | 'MEDIO' | 'CRITICO';
  certificado: string | null;
  proveedorRuc: string | null;
  proveedorNombre: string | null;
  clasificador: string | null;
  secFuncional: string | null;
  // Documento de la FASE DE ORIGEN del cálculo (ej. en "Pendiente por Girar",
  // el documento del Devengado). Código crudo, sin traducir a nombre: el
  // catálogo de Cod. Doc. todavía no está confirmado contra datos reales.
  codDocOrigen: string | null;
  numDocOrigen: string | null;
  fechaDocOrigen: Date | null;
  /** El movimiento de origen (el mismo del que salen los campos de arriba), para leer cualquier otro campo. */
  movimiento: MovimientoSiaf | null;
}

/** Una fila de "Ejecución Detallada" (modelos 659/662): un movimiento tal
 * cual, con su monto en la columna de SU fase, igual que lo muestra Melissa
 * (nunca fusiona fases en una fila, cada movimiento es su propia fila). */
export interface FilaEjecucionDetallada {
  /** El movimiento de origen de la fila, para leer cualquier otro campo. */
  movimiento: MovimientoSiaf;
  expediente: string;
  fase: Fase;
  subRegistro: string | null; // el "N"/"R"/"C" que acompaña a la fase (ej. "GC N")
  comprometido: number | null;
  devengado: number | null;
  girado: number | null;
  pagado: number | null;
  rendido: number | null;
  fechaDoc: Date | null;
  codDoc: string | null;
  numDoc: string | null;
  proveedorRuc: string | null;
  proveedorNombre: string | null;
  clasificador: string | null;
  secFuncional: string | null;
  certificado: string | null;
  // Bloque "B": documento del giro/beneficiario, cuando aplica.
  fechaDocB: Date | null;
  codDocB: string | null;
  numDocB: string | null;
  proveedorBeneficiario: string | null;
}
