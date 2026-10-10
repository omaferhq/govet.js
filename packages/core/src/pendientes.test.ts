// govet/pendientes.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MovimientoSiaf } from './types';
import { pendiente, modelos, diagnosticoEstados, ejecucionDetallada, modelosDetalle, etiquetaEstado } from './pendientes';

function mov(parcial: Partial<MovimientoSiaf>): MovimientoSiaf {
  return {
    expediente: '0000001',
    fase: 'C',
    subRegistro: null,
    correlativo: null,
    secuenciaPadre: null,
    certificado: null,
    certificadoSecuencia: null,
    codDoc: null,
    numDoc: null,
    fechaDoc: null,
    fechaAprobacion: null,
    fechaProceso: null,
    fechaDbOracle: null,
    tipoOperacion: null,
    estRegistro: 'A',
    tipoRegistro: 'N',
    proveedorRuc: null,
    proveedorNombre: null,
    clasificador: null,
    secFuncional: null,
    rubro: null,
    rubroNombre: null,
    montoSoles: 0,
    codDocB: null,
    numDocB: null,
    fechaDocB: null,
    proveedorBeneficiario: null,
    moneda: null,
    anioEjec: null,
    mesEjec: null,
    secEjec: null,
    secEjec2: null,
    nombreEjec2: null,
    modCompra: null,
    tipoProc: null,
    area: null,
    ciclo: null,
    origen: null,
    tipoFinanc: null,
    tp: null,
    tipoRecurso: null,
    tc: null,
    anioCta: null,
    banco: null,
    cuenta: null,
    tipoProv: null,
    proy: null,
    tipoGiro: null,
    tipoCambio: null,
    montoOrigen: null,
    anioCtb: null,
    mesCtb: null,
    diaCtb: null,
    prodPry: null,
    actAiObra: null,
    programa: null,
    funcion: null,
    divisionFunc: null,
    grupoFunc: null,
    meta: null,
    monto: null,
    anioProceso: null,
    mesProceso: null,
    diaProceso: null,
    estadoEnvio: null,
    edicion: null,
    filaOrigen: 1,
    ...parcial,
  };
}

test('pendiente: detecta saldo entre fase origen y destino para el mismo expediente', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E1', fase: 'C', montoSoles: 1000, fechaAprobacion: new Date('2026-01-01') }),
    mov({ expediente: 'E1', fase: 'D', montoSoles: 600 }),
  ];
  const r = pendiente('C', 'D', movs, { fechaCorte: new Date('2026-02-01') });
  assert.equal(r.length, 1);
  assert.equal(r[0].saldoPendiente, 400);
  assert.equal(r[0].diasTranscurridos, 31);
});

test('pendiente: nunca suma entre fases distintas', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E1', fase: 'C', montoSoles: 500 }),
    mov({ expediente: 'E1', fase: 'D', montoSoles: 500 }),
  ];
  const r = pendiente('C', 'D', movs);
  assert.equal(r.length, 0); // sin saldo pendiente
});

test('el candado: solo cuenta movimientos con estRegistro A por defecto', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E1', fase: 'C', montoSoles: 1000, estRegistro: 'A' }),
    mov({ expediente: 'E1', fase: 'C', montoSoles: 999999, estRegistro: 'P' }), // pendiente, no debe contar
  ];
  const r = pendiente('C', 'D', movs);
  assert.equal(r[0].montoOrigenFase, 1000);
});

test('diagnosticoEstados: nunca descarta en silencio, siempre reporta lo excluido', () => {
  const movs: MovimientoSiaf[] = [
    mov({ estRegistro: 'A' }),
    mov({ estRegistro: 'P' }),
    mov({ estRegistro: 'P' }),
  ];
  const d = diagnosticoEstados(movs);
  assert.equal(d.incluidos['A'], 1);
  assert.equal(d.excluidos['P'], 2);
});

test('el documento mostrado es el de la fase de ORIGEN, no cualquier movimiento del expediente', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E1', fase: 'C', montoSoles: 1000, codDoc: 'DOC-C', fechaAprobacion: new Date('2026-01-01') }),
    mov({ expediente: 'E1', fase: 'D', montoSoles: 400, codDoc: 'DOC-D', fechaAprobacion: new Date('2026-01-05') }),
  ];
  // Pendiente por Girar: origen es D, no C. El documento debe ser DOC-D.
  const r = pendiente('D', 'G', movs);
  assert.equal(r[0].codDocOrigen, 'DOC-D');
});

test('pendientesPorRendir incluye el tipo C (caja chica), no solo AV/A', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E1', fase: 'G', montoSoles: 500, tipoOperacion: 'C', fechaAprobacion: new Date('2026-01-01') }),
  ];
  const r = modelos.pendientesPorRendir(movs, { fechaCorte: new Date('2026-02-01') });
  assert.equal(r.length, 1);
  assert.equal(r[0].montoOrigenFase, 500);
});

test('pendientesPorRendir excluye tipos de operación fuera de AV/A/C', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E1', fase: 'G', montoSoles: 500, tipoOperacion: 'Z' }),
  ];
  const r = modelos.pendientesPorRendir(movs);
  assert.equal(r.length, 0);
});

test('ejecucionDetallada: cada movimiento es su propia fila, el monto va solo en su columna de fase', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E1', fase: 'C', montoSoles: 1000 }),
    mov({ expediente: 'E1', fase: 'D', montoSoles: 900 }),
  ];
  const filas = ejecucionDetallada(movs);
  assert.equal(filas.length, 2);
  const filaC = filas.find((f) => f.fase === 'C')!;
  assert.equal(filaC.comprometido, 1000);
  assert.equal(filaC.devengado, null);
});

test('modelosDetalle.ejecucionDetallada659 excluye Pagado y Rendido', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E1', fase: 'C', montoSoles: 100 }),
    mov({ expediente: 'E1', fase: 'P', montoSoles: 100 }),
  ];
  const filas = modelosDetalle.ejecucionDetallada659(movs);
  assert.equal(filas.length, 1);
  assert.equal(filas[0].fase, 'C');
});

test('etiquetaEstado: nunca inventa un nombre para un código no mapeado', () => {
  assert.equal(etiquetaEstado('A'), 'APROBADO');
  assert.equal(etiquetaEstado('Z'), '(desconocido: Z)');
  // F aparece en datos reales pero su nombre no está confirmado.
  assert.equal(etiquetaEstado('F'), '(desconocido: F)');
  assert.equal(etiquetaEstado(null), '(vacío)');
});

test('pendiente: ordenado por expediente, como Melissa', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E2', fase: 'C', montoSoles: 100, fechaAprobacion: new Date('2026-01-01') }),
    mov({ expediente: 'E1', fase: 'C', montoSoles: 100, fechaAprobacion: new Date('2026-03-01') }),
  ];
  const r = pendiente('C', 'D', movs, { fechaCorte: new Date('2026-04-01') });
  assert.deepEqual(r.map((p) => p.expediente), ['E1', 'E2']);
});

test('pendiente: cada fila lleva su movimiento de origen', () => {
  const origen = mov({ expediente: 'E1', fase: 'D', montoSoles: 100, codDoc: 'DOC-D', meta: '0001' });
  const r = pendiente('D', 'G', [origen]);
  assert.equal(r[0].movimiento, origen);
  assert.equal(r[0].movimiento?.meta, '0001');
});

test('ejecucionDetallada: ordena por expediente, fase del ciclo, secuencia y correlativo; lleva el movimiento', () => {
  const movs: MovimientoSiaf[] = [
    mov({ expediente: 'E1', fase: 'G', subRegistro: '1', correlativo: '1', montoSoles: 1 }),
    mov({ expediente: 'E1', fase: 'C', subRegistro: '2', correlativo: '1', montoSoles: 1 }),
    mov({ expediente: 'E1', fase: 'C', subRegistro: '1', correlativo: '2', montoSoles: 1 }),
    mov({ expediente: 'E1', fase: 'C', subRegistro: '1', correlativo: '1', montoSoles: 1 }),
    mov({ expediente: 'E0', fase: 'D', subRegistro: '1', correlativo: '1', montoSoles: 1 }),
  ];
  const filas = ejecucionDetallada(movs);
  assert.deepEqual(
    filas.map((f) => `${f.expediente}${f.fase}${f.subRegistro}${f.movimiento.correlativo}`),
    ['E0D11', 'E1C11', 'E1C12', 'E1C21', 'E1G11']
  );
  assert.equal(filas[0].movimiento, movs[4]);
});
