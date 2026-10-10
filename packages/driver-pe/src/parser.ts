// govet-pe/parser.ts

import { parseCsv } from './csv';
import { ALIAS_FORMATO_A, ALIAS_CRUDO, normalizarCabecera, parseFechaSiaf, parseMonto, esFaseValida, txt } from './mapper';
import { MovimientoSiaf, ResultadoParseo, Advertencia, EncabezadoReporte } from 'govet';

const TOLERANCIA_RECONCILIACION = 0.5; // soles; el archivo puede traer redondeos

function esFilaTotal(cells: string[]): boolean {
  return cells.some((c) => c.toUpperCase().includes('TOTAL EN MONEDA'));
}

function encontrarFilaCabecera(filas: string[][]): number {
  for (let i = 0; i < filas.length; i++) {
    const normalizadas = filas[i].map(normalizarCabecera);
    if (normalizadas.includes('expediente siaf') && normalizadas.includes('fase')) {
      return i;
    }
  }
  throw new Error(
    'No se encontró la fila de cabecera (se esperaba "Expediente SIAF" y "Fase"). ' +
      'El formato del export puede haber cambiado.'
  );
}

// Filas sobre la cabecera del reporte: "SECTOR | 00 - X", "EJECUTORA | 008 - NOMBRE", "Fecha: | 29/09/2026"…
// La etiqueta puede traer el valor en la misma celda ("Fecha: 29/09/2026") o en la siguiente no vacía.
const ETIQUETAS_ENCABEZADO = new Set(['sector', 'pliego', 'ejecutora', 'registro', 'periodo', 'fecha', 'hora']);

export function leerEncabezado(filas: string[][]): EncabezadoReporte {
  const enc: Record<string, string> = {};
  const titulos: string[] = [];
  for (const fila of filas) {
    for (let i = 0; i < fila.length; i++) {
      const celda = fila[i].trim();
      if (!celda) continue;
      const m = celda.match(/^([a-zA-Z]+)\s*:?\s*(.*)$/);
      const campo = m && ETIQUETAS_ENCABEZADO.has(m[1].toLowerCase()) ? m[1].toLowerCase() : null;
      if (m && campo && enc[campo] === undefined) {
        let valor = m[2].trim();
        if (!valor) {
          const j = fila.findIndex((c, k) => k > i && c.trim() !== '');
          if (j < 0) continue;
          valor = fila[j].trim();
          i = j;
        }
        enc[campo] = valor;
      } else if (/^REPORTE |^POR /i.test(celda)) {
        titulos.push(celda);
      }
    }
  }
  const resultado: EncabezadoReporte = enc;
  if (titulos.length) resultado.titulos = titulos;
  return resultado;
}

export function parseFormatoA(textoCrudo: string): ResultadoParseo {
  const filas = parseCsv(textoCrudo);
  const idxCabecera = encontrarFilaCabecera(filas);
  const cabecera = filas[idxCabecera];

  const indice: Record<string, number> = {};
  const columnasNoReconocidas: string[] = [];

  cabecera.forEach((celda, i) => {
    const limpio = celda.trim();
    if (!limpio) return; // columna sin nombre, se ignora sin marcarla como "no reconocida"
    const norm = normalizarCabecera(limpio);
    const campo = ALIAS_CRUDO[limpio.replace(/\s+/g, '').toLowerCase()] ?? ALIAS_FORMATO_A[norm];
    if (campo) {
      indice[campo] = i;
    } else {
      columnasNoReconocidas.push(limpio);
    }
  });

  if (indice['expediente'] === undefined || indice['fase'] === undefined) {
    throw new Error('La cabecera no trae "Expediente SIAF" o "Fase" mapeables. Revisa el mapper.');
  }

  const get = (fila: string[], campo: string): string | undefined => {
    const i = indice[campo];
    return i === undefined ? undefined : fila[i];
  };

  const movimientos: MovimientoSiaf[] = [];
  const advertencias: Advertencia[] = [];
  let totalDeclarado: number | null = null;

  for (let f = idxCabecera + 1; f < filas.length; f++) {
    const fila = filas[f];
    if (fila.every((c) => c.trim() === '')) continue; // línea en blanco al final

    const expediente = get(fila, 'expediente')?.trim() ?? '';

    if (!expediente) {
      if (esFilaTotal(fila)) {
        const montoTotal = parseMonto(get(fila, 'montoSoles'));
        if (montoTotal !== null) totalDeclarado = montoTotal;
      } else if (esFaseValida((get(fila, 'fase') ?? '').trim())) {
        advertencias.push({ fila: f + 1, campo: 'expediente', motivo: 'fila con fase pero sin número de expediente (se omitió)' });
      }
      continue; // fila sin expediente y que no es el total: se ignora
    }

    const faseTexto = (get(fila, 'fase') ?? '').trim();
    if (!esFaseValida(faseTexto)) {
      advertencias.push({ fila: f + 1, campo: 'fase', motivo: `valor de fase no reconocido: "${faseTexto}"` });
      continue; // sin fase válida no se puede clasificar el movimiento
    }

    const montoSoles = parseMonto(get(fila, 'montoSoles'));
    if (montoSoles === null) {
      advertencias.push({
        fila: f + 1,
        campo: 'montoSoles',
        motivo: `no se pudo leer el monto: "${get(fila, 'montoSoles')}"`,
      });
    }

    movimientos.push({
      expediente,
      fase: faseTexto,
      subRegistro: get(fila, 'subRegistro') ?? null,
      correlativo: get(fila, 'correlativo') ?? null,
      secuenciaPadre: get(fila, 'secuenciaPadre') ?? null,
      certificado: get(fila, 'certificado') ?? null,
      certificadoSecuencia: get(fila, 'certificadoSecuencia') ?? null,
      codDoc: get(fila, 'codDoc') ?? null,
      numDoc: get(fila, 'numDoc') ?? null,
      fechaDoc: parseFechaSiaf(get(fila, 'fechaDoc')),
      fechaAprobacion: parseFechaSiaf(get(fila, 'fechaAprobacion')),
      fechaProceso: parseFechaSiaf(get(fila, 'fechaProceso')),
      fechaDbOracle: parseFechaSiaf((txt(get(fila, 'fechaDbOracle')) ?? '').slice(0, 10)),
      tipoOperacion: get(fila, 'tipoOperacion') ?? null,
      estRegistro: get(fila, 'estRegistro') ?? null,
      tipoRegistro: get(fila, 'tipoRegistro') ?? null,
      proveedorRuc: get(fila, 'proveedorRuc') || null,
      proveedorNombre: get(fila, 'proveedorNombre') || null,
      clasificador: get(fila, 'clasificador') ?? null,
      secFuncional: get(fila, 'secFuncional') ?? null,
      rubro: get(fila, 'rubro') ?? null,
      rubroNombre: get(fila, 'rubroNombre') ?? null,
      montoSoles,
      codDocB: get(fila, 'codDocB') ?? null,
      numDocB: get(fila, 'numDocB') ?? null,
      fechaDocB: parseFechaSiaf(get(fila, 'fechaDocB')),
      proveedorBeneficiario: get(fila, 'proveedorBeneficiario') || null,
      moneda: txt(get(fila, 'moneda')),
      anioEjec: txt(get(fila, 'anioEjec')),
      mesEjec: txt(get(fila, 'mesEjec')),
      secEjec: txt(get(fila, 'secEjec')),
      secEjec2: txt(get(fila, 'secEjec2')),
      nombreEjec2: txt(get(fila, 'nombreEjec2')),
      modCompra: txt(get(fila, 'modCompra')),
      tipoProc: txt(get(fila, 'tipoProc')),
      area: txt(get(fila, 'area')),
      ciclo: txt(get(fila, 'ciclo')),
      origen: txt(get(fila, 'origen')),
      tipoFinanc: txt(get(fila, 'tipoFinanc')),
      tp: txt(get(fila, 'tp')),
      tipoRecurso: txt(get(fila, 'tipoRecurso')),
      tc: txt(get(fila, 'tc')),
      anioCta: txt(get(fila, 'anioCta')),
      banco: txt(get(fila, 'banco')),
      cuenta: txt(get(fila, 'cuenta')),
      tipoProv: txt(get(fila, 'tipoProv')),
      proy: txt(get(fila, 'proy')),
      tipoGiro: txt(get(fila, 'tipoGiro')),
      tipoCambio: parseMonto(get(fila, 'tipoCambio')),
      montoOrigen: parseMonto(get(fila, 'montoOrigen')),
      anioCtb: txt(get(fila, 'anioCtb')),
      mesCtb: txt(get(fila, 'mesCtb')),
      diaCtb: txt(get(fila, 'diaCtb')),
      prodPry: txt(get(fila, 'prodPry')),
      actAiObra: txt(get(fila, 'actAiObra')),
      programa: txt(get(fila, 'programa')),
      funcion: txt(get(fila, 'funcion')),
      divisionFunc: txt(get(fila, 'divisionFunc')),
      grupoFunc: txt(get(fila, 'grupoFunc')),
      meta: txt(get(fila, 'meta')),
      monto: parseMonto(get(fila, 'monto')),
      anioProceso: txt(get(fila, 'anioProceso')),
      mesProceso: txt(get(fila, 'mesProceso')),
      diaProceso: txt(get(fila, 'diaProceso')),
      estadoEnvio: txt(get(fila, 'estadoEnvio')),
      edicion: txt(get(fila, 'edicion')),
      filaOrigen: f + 1,
    });
  }

  const totalCalculado = movimientos.reduce((acc, m) => acc + (m.montoSoles ?? 0), 0);
  const reconciliaOk =
    totalDeclarado !== null && Math.abs(totalDeclarado - totalCalculado) < TOLERANCIA_RECONCILIACION;

  return {
    movimientos,
    advertencias,
    columnasNoReconocidas: [...new Set(columnasNoReconocidas)],
    totalDeclarado,
    totalCalculado: Math.round(totalCalculado * 100) / 100,
    reconciliaOk,
    encabezado: leerEncabezado(filas.slice(0, idxCabecera)),
  };
}
