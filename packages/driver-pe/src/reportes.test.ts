// govet-pe/reportes.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { partirCodigo, parseReporteGasto, parseCertificaciones, modelosCertificacion } from './reportes';
import { parseFormatoA } from './parser';

test('partirCodigo: separa código y nombre', () => {
  assert.deepEqual(partirCodigo('0002.SALUD MATERNO NEONATAL'), { cod: '0002', nom: 'SALUD MATERNO NEONATAL' });
  assert.deepEqual(partirCodigo('08. CUSCO'), { cod: '08', nom: 'CUSCO' });
  assert.deepEqual(partirCodigo('1'), { cod: '1', nom: null });
  assert.deepEqual(partirCodigo(null), { cod: null, nom: null });
});

const MESES = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
const CAB_GASTO = ['ano_eje', 'sec_ejec', 'sec_func', 'meta', 'rubro', 'generica', 'subgenerica', 'subgenerica_det',
  'especifica', 'especifica_det', 'mto_pia', 'mto_modificaciones', 'mto_pim', 'mto_certificado', 'mto_compro_anual',
  ...MESES.map((m) => 'mto_devenga_' + m)];
const mesesDev = (ene: number, feb: number) => [ene, feb, ...Array(10).fill(0)];

test('parseReporteGasto: arma el clasificador, suma los meses y los totales', () => {
  const r = parseReporteGasto([
    ['REPORTE DE GASTO'],
    CAB_GASTO,
    ['2026', '300691', '0060', '00060', '18.CANON Y SOBRECANON', '3.BIENES Y SERVICIOS', '2.CONTRATACION DE SERVICIOS', '1.SERVICIOS',
      '1.SERVICIOS BASICOS', '1.SUMINISTRO DE ENERGIA', 1000, 500, 1500, 1200, 900, ...mesesDev(300, 200)],
    ['2026', '300691', '0072', '00072', '18.CANON Y SOBRECANON', '6.ADQUISICION DE ACTIVOS NO FINANCIEROS', '3.ADQUISICION DE VEHICULOS',
      '2.MOBILIARIO', '5.MUEBLES', '1.MUEBLES', '2,000.00', 0, '2,000.00', 0, 0, ...mesesDev(0, 0)],
    [],
  ]);
  assert.equal(r.filas.length, 2);
  assert.equal(r.anio, '2026');
  assert.equal(r.filas[0].clasificador, '2.3.2.1.1.1');
  assert.deepEqual(r.filas[0].rubro, { cod: '18', nom: 'CANON Y SOBRECANON' });
  assert.equal(r.filas[0].devengado, 500);
  assert.equal(r.filas[1].pim, 2000);
  assert.equal(r.totales.pim, 3500);
  assert.equal(r.totales.devengado, 500);
});

test('parseReporteGasto: rechaza un archivo que no lo es', () => {
  assert.throws(() => parseReporteGasto([['Expediente SIAF', 'Fase']]), /No es un Reporte de Gasto/);
});

const CERT = [
  ['PLIEGO :', '008', 'MUNICIPALIDAD DISTRITAL (300691)'],
  ['CERTIFICACIONES Y COMPROMISO ANUAL 2026'],
  ['Certificado SIAF', 'Sec', 'Corr', 'Etapa', 'Monto S/', 'Est. Env.'],
  ['0000010', '1', '1', 'CERTIFICACIÓN', '1,000.00', 'A'],
  ['', '1', '2', 'COMPROMISO ANUAL', '600.00', 'A'],
  ['', '2', '1', 'COMPROMISO ANUAL', '400.00', 'A'],
  ['0000011', '1', '1', 'CERTIFICACIÓN', '500.00', 'A'],
  ['', '1', '2', 'COMPROMISO ANUAL', '100.00', 'V'],
];

test('parseCertificaciones: rellena el certificado hacia abajo y lee el encabezado', () => {
  const r = parseCertificaciones(CERT);
  assert.equal(r.movimientos.length, 5);
  assert.equal(r.movimientos[2].certificado, '0000010');
  assert.equal(r.movimientos[2].etapa, 'A');
  assert.equal(r.encabezado.anio, '2026');
  assert.equal(r.encabezado.secEjec, '300691');
});

test('modelosCertificacion: solo lo aprobado; por comprometer deja los certificados con saldo', () => {
  const { movimientos } = parseCertificaciones(CERT);
  const vs = modelosCertificacion.certificacionVsCompromiso(movimientos);
  assert.equal(vs.length, 4); // el compromiso pendiente de firma (V) no cuenta
  assert.equal(vs.reduce((a, f) => a + (f.saldoPorComprometer ?? 0), 0), 500);
  const pend = modelosCertificacion.certificacionesPorComprometer(movimientos);
  assert.deepEqual([...new Set(pend.map((f) => f.movimiento.certificado))], ['0000011']);
  assert.equal(modelosCertificacion.certificacionVsCompromiso(movimientos, { estadosValidos: null }).length, 5);
});

test('parseFormatoA: guarda la fecha DB Oracle sin la hora', () => {
  const r = parseFormatoA(['"Expediente SIAF",Fase,"Est Registro","Monto S/","Fecha DB Oracle"', '0000001,C,A,"10.00","15/03/2026 10:22:31"'].join('\n'));
  assert.equal(r.movimientos[0].fechaDbOracle?.getDate(), 15);
  assert.equal(r.movimientos[0].fechaDbOracle?.getMonth(), 2);
});
