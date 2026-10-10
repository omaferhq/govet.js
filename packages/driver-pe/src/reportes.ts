// govet-pe/reportes.ts
//
// Otros reportes del SIAF, además del Formato A. Llegan como filas de una hoja
// de cálculo (arreglo de arreglos: lo que da SheetJS con header:1, o parseCsv):
//   - "Reporte de Gasto": el marco presupuestal (PIA, modificaciones, PIM,
//     certificado, compromiso anual y ejecución mensual) por meta, rubro y
//     clasificador, con el nombre de cada código.
//   - "Certificación y Compromiso Anual": un movimiento por etapa de cada
//     certificado, con su estado.

import { normalizarCabecera, parseFechaSiaf, parseMonto, txt } from './mapper';
import { Advertencia, ESTADOS_VALIDOS_DEFAULT } from 'govet';

export type Celda = string | number | boolean | Date | null | undefined;

export interface CodigoNombre {
  cod: string | null;
  nom: string | null;
}

/**
 * "0002.SALUD MATERNO NEONATAL" → {cod:'0002', nom:'SALUD MATERNO NEONATAL'};
 * "08. CUSCO" → {cod:'08', nom:'CUSCO'}; sin punto ("1") → {cod:'1', nom:null}.
 */
export function partirCodigo(v: Celda): CodigoNombre {
  const t = texto(v);
  if (t === null) return { cod: null, nom: null };
  const m = t.match(/^([0-9A-Za-z]+)\.\s*(.*)$/);
  return m ? { cod: m[1], nom: m[2].trim() || null } : { cod: t, nom: null };
}

const texto = (v: Celda): string | null => txt(v === undefined || v === null ? null : String(v));

/** Monto que puede venir como número (celda numérica) o como texto con comas. */
export function numero(v: Celda): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  return parseMonto(v === undefined || v === null ? null : String(v));
}

function filaCabecera(filas: Celda[][], requeridas: string[], max: number): number {
  for (let i = 0; i < Math.min(filas.length, max); i++) {
    const n = (filas[i] || []).map((c) => normalizarCabecera(String(c ?? '')));
    if (requeridas.every((r) => n.includes(r))) return i;
  }
  return -1;
}

const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const redondear = (x: number) => Math.round(x * 100) / 100;

// ---------- Reporte de Gasto ----------

export interface FilaReporteGasto {
  anio: string;
  secEjec: string | null;
  departamento: CodigoNombre;
  provincia: CodigoNombre;
  pliego: CodigoNombre;
  programa: CodigoNombre;
  tipoProdProy: CodigoNombre;
  prodPry: CodigoNombre;
  tipoActObra: CodigoNombre;
  actObra: CodigoNombre;
  funcion: CodigoNombre;
  divFunc: CodigoNombre;
  grupoFunc: CodigoNombre;
  meta: string | null;
  finalidad: CodigoNombre;
  unidadMedida: CodigoNombre;
  cantMetaAnual: number | null;
  cantMetaSem: number | null;
  avanFisicoAnual: number | null;
  avanFisicoSem: number | null;
  secFunc: string | null;
  depMeta: CodigoNombre;
  provMeta: CodigoNombre;
  distMeta: CodigoNombre;
  fuente: CodigoNombre;
  rubro: CodigoNombre;
  categoriaGasto: CodigoNombre;
  tipoTransaccion: CodigoNombre;
  generica: CodigoNombre;
  subgenerica: CodigoNombre;
  subgenericaDet: CodigoNombre;
  especifica: CodigoNombre;
  especificaDet: CodigoNombre;
  /** Como en el Formato A: 2.<genérica>.<subgenérica>.<subgenérica det>.<específica>.<específica det> */
  clasificador: string | null;
  pia: number | null;
  modificaciones: number | null;
  pim: number | null;
  certificado: number | null;
  compromisoAnual: number | null;
  /** Montos de enero a diciembre (12 posiciones; 0 si el mes viene vacío). */
  compMes: number[];
  devMes: number[];
  girMes: number[];
  pagMes: number[];
  comprometido: number;
  devengado: number;
  girado: number;
  pagado: number;
  filaOrigen: number;
}

export interface TotalesReporteGasto {
  pia: number;
  modificaciones: number;
  pim: number;
  certificado: number;
  compromisoAnual: number;
  comprometido: number;
  devengado: number;
  girado: number;
  pagado: number;
}

export interface ResultadoReporteGasto {
  filas: FilaReporteGasto[];
  advertencias: Advertencia[];
  totales: TotalesReporteGasto;
  anio: string | null;
  secEjec: string | null;
  entidad: { departamento?: string | null; provincia?: string | null; pliego?: string | null };
}

/**
 * Reporte de Gasto: una fila por meta, rubro y clasificador. Cabeceras del
 * SIAF: ano_eje, sec_ejec, programa_pptal, producto_proyecto, …, mto_pia,
 * mto_pim, mto_at_comp_01…12, mto_devenga_01…12, mto_girado_…, mto_pagado_…
 */
export function parseReporteGasto(filasHoja: Celda[][]): ResultadoReporteGasto {
  const ic = filaCabecera(filasHoja, ['ano_eje', 'mto_pim'], 20);
  if (ic < 0) throw new Error('No es un Reporte de Gasto: faltan las columnas "ano_eje" y "mto_pim".');
  const cab = filasHoja[ic].map((c) => String(c ?? '').trim().toLowerCase());
  const g = (f: Celda[], n: string): Celda => {
    const i = cab.indexOf(n);
    return i < 0 ? undefined : f[i];
  };
  const filas: FilaReporteGasto[] = [];
  const advertencias: Advertencia[] = [];
  const totales: TotalesReporteGasto = {
    pia: 0, modificaciones: 0, pim: 0, certificado: 0, compromisoAnual: 0,
    comprometido: 0, devengado: 0, girado: 0, pagado: 0,
  };
  const pre = (v: Celda) => partirCodigo(v).cod;
  for (let k = ic + 1; k < filasHoja.length; k++) {
    const f = filasHoja[k] || [];
    if (f.every((c) => texto(c) === null)) continue;
    const anio = texto(g(f, 'ano_eje'));
    if (anio === null) continue;
    const partes = ['2', pre(g(f, 'generica')), pre(g(f, 'subgenerica')), pre(g(f, 'subgenerica_det')),
      pre(g(f, 'especifica')), pre(g(f, 'especifica_det'))];
    const clasificador = partes.every(Boolean) ? partes.join('.') : null;
    const mensual = (pref: string) => MESES.map((m) => numero(g(f, pref + m)) || 0);
    const comp = mensual('mto_at_comp_'), dev = mensual('mto_devenga_'), gir = mensual('mto_girado_'), pag = mensual('mto_pagado_');
    const suma = (a: number[]) => redondear(a.reduce((x, y) => x + y, 0));
    const r: FilaReporteGasto = {
      anio, secEjec: texto(g(f, 'sec_ejec')),
      departamento: partirCodigo(g(f, 'departamento')), provincia: partirCodigo(g(f, 'provincia')), pliego: partirCodigo(g(f, 'pliego')),
      programa: partirCodigo(g(f, 'programa_pptal')), tipoProdProy: partirCodigo(g(f, 'tipo_prod_proy')), prodPry: partirCodigo(g(f, 'producto_proyecto')),
      tipoActObra: partirCodigo(g(f, 'tipo_act_obra_ac')), actObra: partirCodigo(g(f, 'activ_obra_accinv')),
      funcion: partirCodigo(g(f, 'funcion')), divFunc: partirCodigo(g(f, 'division_fn')), grupoFunc: partirCodigo(g(f, 'grupo_fn')),
      meta: texto(g(f, 'meta')), finalidad: partirCodigo(g(f, 'finalidad')), unidadMedida: partirCodigo(g(f, 'unidad_medida')),
      cantMetaAnual: numero(g(f, 'cant_meta_anual')), cantMetaSem: numero(g(f, 'cant_meta_sem')),
      avanFisicoAnual: numero(g(f, 'avan_fisico_anual')), avanFisicoSem: numero(g(f, 'avan_fisico_sem')),
      secFunc: texto(g(f, 'sec_func')),
      depMeta: partirCodigo(g(f, 'departamento_meta')), provMeta: partirCodigo(g(f, 'provincia_meta')), distMeta: partirCodigo(g(f, 'distrito_meta')),
      fuente: partirCodigo(g(f, 'fuente_financ')), rubro: partirCodigo(g(f, 'rubro')), categoriaGasto: partirCodigo(g(f, 'categoria_gasto')),
      tipoTransaccion: partirCodigo(g(f, 'tipo_transaccion')),
      generica: partirCodigo(g(f, 'generica')), subgenerica: partirCodigo(g(f, 'subgenerica')), subgenericaDet: partirCodigo(g(f, 'subgenerica_det')),
      especifica: partirCodigo(g(f, 'especifica')), especificaDet: partirCodigo(g(f, 'especifica_det')), clasificador,
      pia: numero(g(f, 'mto_pia')), modificaciones: numero(g(f, 'mto_modificaciones')), pim: numero(g(f, 'mto_pim')),
      certificado: numero(g(f, 'mto_certificado')), compromisoAnual: numero(g(f, 'mto_compro_anual')),
      compMes: comp, devMes: dev, girMes: gir, pagMes: pag,
      comprometido: suma(comp), devengado: suma(dev), girado: suma(gir), pagado: suma(pag),
      filaOrigen: k + 1,
    };
    if (r.pim === null) advertencias.push({ fila: k + 1, campo: 'mto_pim', motivo: `no se pudo leer el PIM: "${g(f, 'mto_pim')}"` });
    for (const t of Object.keys(totales) as (keyof TotalesReporteGasto)[]) totales[t] += r[t] || 0;
    filas.push(r);
  }
  for (const t of Object.keys(totales) as (keyof TotalesReporteGasto)[]) totales[t] = redondear(totales[t]);
  const p = filas[0];
  return {
    filas, advertencias, totales, anio: p ? p.anio : null, secEjec: p ? p.secEjec : null,
    entidad: p ? { departamento: p.departamento.nom, provincia: p.provincia.nom, pliego: p.pliego.nom } : {},
  };
}

// ---------- Certificación y Compromiso Anual ----------

export interface MovimientoCertificacion {
  certificado: string | null;
  secuencia: string | null;
  correlativo: string | null;
  rubro: string | null;
  codDoc: string | null;
  numDoc: string | null;
  fechaDoc: Date | null;
  proveedorRuc: string | null;
  clasificador: string | null;
  secFunc: string | null;
  moneda: string | null;
  tipoCambio: number | null;
  montoOrigen: number | null;
  montoSoles: number | null;
  fechaProceso: Date | null;
  /** C = CERTIFICACIÓN, A = COMPROMISO ANUAL */
  etapa: 'C' | 'A';
  etapaNombre: string;
  tipoRegistroNombre: string | null;
  /** "Est. Env.": código del estado (catálogo CATALOGO_ESTADO_CERTIFICACION de govet). */
  estEnvio: string | null;
  /** "Est. Reg.": nombre del estado. */
  estRegistroNombre: string | null;
  filaOrigen: number;
}

export interface EncabezadoCertificaciones {
  departamento?: string;
  provincia?: string;
  pliego?: string;
  titulo?: string;
  anio?: string;
  fecha?: string;
  hora?: string;
  secEjec?: string;
}

export interface ResultadoCertificaciones {
  movimientos: MovimientoCertificacion[];
  advertencias: Advertencia[];
  encabezado: EncabezadoCertificaciones;
}

/**
 * Cabecera con "Certificado SIAF" y "Etapa". El número de certificado viene
 * solo en la primera fila de cada grupo (celdas combinadas): se rellena hacia
 * abajo.
 */
export function parseCertificaciones(filasHoja: Celda[][]): ResultadoCertificaciones {
  const ic = filaCabecera(filasHoja, ['certificado siaf', 'etapa'], 30);
  if (ic < 0) throw new Error('No es el reporte de Certificación y Compromiso Anual: faltan "Certificado SIAF" y "Etapa".');
  const cab = filasHoja[ic].map((c) => normalizarCabecera(String(c ?? '')));
  const g = (f: Celda[], n: string): string | null => {
    const i = cab.indexOf(n);
    return i < 0 ? null : texto(f[i]);
  };
  // Encabezado: "PLIEGO : | 008 | MUNICIPALIDAD … (300691)", título con el año, "Fecha : | 09/10/2026".
  const enc: EncabezadoCertificaciones = {};
  for (const f of filasHoja.slice(0, ic)) {
    const cs = (f || []).map((c) => String(c ?? '').trim()).filter(Boolean);
    if (!cs.length) continue;
    const et = normalizarCabecera(cs[0]).replace(/\s*:$/, '').replace(/:/g, '').trim();
    if (et === 'departamento' || et === 'provincia' || et === 'pliego') enc[et] = cs.slice(1).join(' - ');
    const t = cs.find((c) => /CERTIFICACIONES?\s+Y\s+COMPROMISO/i.test(c));
    if (t) {
      enc.titulo = t;
      const a = t.match(/(\d{4})/);
      if (a) enc.anio = a[1];
    }
    const fi = cs.findIndex((c) => /^fecha\s*:?$/i.test(c));
    if (fi >= 0 && cs[fi + 1]) enc.fecha = cs[fi + 1];
    const hi = cs.findIndex((c) => /^hora\s*:?$/i.test(c));
    if (hi >= 0 && cs[hi + 1]) enc.hora = cs[hi + 1];
  }
  const se = (enc.pliego || '').match(/\((\d{6})\)/);
  if (se) enc.secEjec = se[1];

  const movimientos: MovimientoCertificacion[] = [];
  const advertencias: Advertencia[] = [];
  let cert: string | null = null;
  for (let k = ic + 1; k < filasHoja.length; k++) {
    const f = filasHoja[k] || [];
    const etapaTxt = g(f, 'etapa');
    const c = g(f, 'certificado siaf');
    if (c) cert = c;
    if (!etapaTxt) continue;
    const etapa = /^CERTIF/i.test(normalizarCabecera(etapaTxt)) ? 'C' : /COMPROMISO/i.test(etapaTxt) ? 'A' : null;
    if (!etapa) {
      advertencias.push({ fila: k + 1, campo: 'etapa', motivo: `etapa no reconocida: "${etapaTxt}"` });
      continue;
    }
    const montoSoles = numero(g(f, 'monto s/'));
    if (montoSoles === null) advertencias.push({ fila: k + 1, campo: 'montoSoles', motivo: `no se pudo leer el monto: "${g(f, 'monto s/')}"` });
    movimientos.push({
      certificado: cert, secuencia: g(f, 'sec'), correlativo: g(f, 'corr'), rubro: g(f, 'rb'),
      codDoc: g(f, 'cod doc'), numDoc: g(f, 'numero documento'), fechaDoc: parseFechaSiaf(g(f, 'fecha documento')),
      proveedorRuc: g(f, 'proveedor'), clasificador: g(f, 'clasific'), secFunc: g(f, 'sec func'),
      moneda: g(f, 'moneda'), tipoCambio: numero(g(f, 'tipo cambio')), montoOrigen: numero(g(f, 'monto origen')), montoSoles,
      fechaProceso: parseFechaSiaf(g(f, 'fecha proceso')), etapa, etapaNombre: etapaTxt,
      tipoRegistroNombre: g(f, 'tipo registro'), estEnvio: g(f, 'est env'), estRegistroNombre: g(f, 'est reg'),
      filaOrigen: k + 1,
    });
  }
  return { movimientos, advertencias, encabezado: enc };
}

export interface FilaCertificacion {
  movimiento: MovimientoCertificacion;
  certificado: number | null;
  compromisoAnual: number | null;
  /** certificado − compromiso anual; al sumar por certificado da el saldo por comprometer. */
  saldoPorComprometer: number | null;
}

export interface OpcionesCertificacion {
  /** Estados (Est. Env.) que cuentan; por defecto solo 'A' (aprobado). null = todos. */
  estadosValidos?: string[] | null;
  /** Saldo mínimo para considerar que un certificado tiene saldo por comprometer (S/ 1 por defecto). */
  tolerancia?: number;
}

/**
 * Certificado vs. compromiso anual (645): una fila por movimiento con el monto
 * en su columna. Candado: por defecto solo lo aprobado, igual que el Reporte de
 * Gasto, así los totales de los dos reportes cuadran.
 */
export function certificacionVsCompromiso(movs: MovimientoCertificacion[], opciones: OpcionesCertificacion = {}): FilaCertificacion[] {
  const ok = opciones.estadosValidos === null ? null : opciones.estadosValidos ?? ESTADOS_VALIDOS_DEFAULT;
  const num = { numeric: true };
  return movs
    .filter((m) => !ok || (m.estEnvio !== null && ok.includes(m.estEnvio)))
    .map((m) => ({
      movimiento: m,
      certificado: m.etapa === 'C' ? m.montoSoles : null,
      compromisoAnual: m.etapa === 'A' ? m.montoSoles : null,
      saldoPorComprometer: m.montoSoles === null ? null : m.etapa === 'C' ? m.montoSoles : -m.montoSoles,
    }))
    .sort(
      (a, b) =>
        (a.movimiento.certificado ?? '').localeCompare(b.movimiento.certificado ?? '') ||
        (a.movimiento.secuencia ?? '').localeCompare(b.movimiento.secuencia ?? '', undefined, num) ||
        (a.movimiento.correlativo ?? '').localeCompare(b.movimiento.correlativo ?? '', undefined, num)
    );
}

/** 646: solo los certificados que aún tienen saldo por comprometer. */
export function certificacionesPorComprometer(movs: MovimientoCertificacion[], opciones: OpcionesCertificacion = {}): FilaCertificacion[] {
  const filas = certificacionVsCompromiso(movs, opciones);
  const saldo = new Map<string | null, number>();
  for (const f of filas) saldo.set(f.movimiento.certificado, (saldo.get(f.movimiento.certificado) ?? 0) + (f.saldoPorComprometer ?? 0));
  const tol = opciones.tolerancia ?? 1;
  return filas.filter((f) => Math.abs(saldo.get(f.movimiento.certificado) ?? 0) >= tol);
}

export const modelosCertificacion = { certificacionVsCompromiso, certificacionesPorComprometer };
