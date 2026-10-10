# govet.js

Framework GovTech de código abierto para detectar **atascamiento presupuestal**
en la ejecución del gasto público peruano: expedientes que se quedan atrapados
en el ciclo **Compromiso → Devengado → Girado → Pagado / Rendido**.

Parsea directamente los exports del SIAF (Formato A) y corre los mismos
modelos que usan herramientas comerciales como Melissa — Pendientes por
Devengar/Girar/Pagar/Rendir y Ejecución Detallada (659/662) — 100% en el
navegador o en Node, **sin subir ningún archivo a ningún servidor**.

## Paquetes

Este es un monorepo con dos paquetes npm, instalables **sin scope**:

```bash
npm install govet govet-pe
```

- **`govet`** — el motor puro (cero dependencias externas). Implementa
  el "Contrato Universal de Datos" (`MovimientoSiaf`) y toda la lógica de
  negocio: Pendientes, Ejecución Detallada, el candado de `Est Registro`.
  No sabe nada de Perú, CSV, ni archivos — solo trabaja con datos ya
  normalizados.
- **`govet-pe`** — el driver para Perú. Parsea el CSV que exporta el
  SIAF (Formato A) y lo convierte al contrato que espera `govet`. También
  lee el **Reporte de Gasto** (marco presupuestal: PIA, PIM, certificado,
  compromiso anual y ejecución mensual, con el nombre de cada código) y el
  reporte de **Certificación y Compromiso Anual** (`parseReporteGasto`,
  `parseCertificaciones`; reciben las filas de la hoja como arreglo de
  arreglos, por ejemplo de SheetJS con `header: 1`).

La idea: un país nuevo (o un formato nuevo) solo necesita escribir su propio
driver que produzca `MovimientoSiaf[]`. El core nunca cambia.

## Uso rápido

```ts
import { readFileSync } from 'node:fs';
import { parseFormatoA } from 'govet-pe';
import { modelos, diagnosticoEstados } from 'govet';

const texto = readFileSync('formato-a-setiembre.csv', 'latin1');
const { movimientos, reconciliaOk, totalDeclarado, totalCalculado } = parseFormatoA(texto);

console.log('Reconcilia con el total del archivo:', reconciliaOk);

const pendientesPorGirar = modelos.pendientesPorGirar(movimientos);
for (const p of pendientesPorGirar) {
  console.log(`${p.expediente}: S/ ${p.saldoPendiente} pendiente, ${p.diasTranscurridos} días, ${p.nivelAlerta}`);
}
```

Corre el ejemplo completo:

```bash
npm install
npm run build
npm run demo
```

## Principios de diseño

- **El candado**: los montos solo se suman cuando `Est Registro == 'A'`
  (Aprobado). Todo lo demás se excluye de los cálculos, pero nunca en
  silencio — `diagnosticoEstados()` siempre reporta qué se incluyó y qué se
  excluyó.
- **Nunca `0` por defecto**: un monto que no se pudo leer es `null` +
  una entrada en `advertencias`, nunca `0`. Un cero falso en un sistema
  financiero es peor que un error visible.
- **Reconciliación automática**: la suma de todos los movimientos se
  compara contra la fila "TOTAL EN MONEDA NACIONAL" que trae el propio
  archivo, con una tolerancia de S/ 0.50.
- **Procesamiento 100% local**: todo corre en el cliente (navegador o Node).
  Ningún archivo SIAF se sube a un servidor de terceros.

## Estado del proyecto

Funcional y con tests para: Pendientes por Devengar/Girar/Pagar/Rendir,
Ejecución Detallada 659/662, el candado de estados, y el parser del
Formato A (incluye cabeceras multilínea entre comillas, montos con signo
negativo al final, y reconciliación de totales). El parser lee las 67
columnas del Formato A completo y los datos del encabezado del reporte
(Sector, Pliego, Ejecutora, Periodo, Fecha…); cada fila de Pendientes y de
Ejecución Detallada trae su `movimiento` de origen. `govet-pe` también lee
el Reporte de Gasto y Certificación y Compromiso Anual, con los modelos
645/646 (certificado vs. compromiso anual y certificados con saldo por
comprometer, solo lo aprobado: sus totales cuadran con el Reporte de Gasto).

Pendiente: catálogo de `Cod. Doc.`, Web Worker para archivos grandes
(60-70k filas), agregación de varios meses, y el "rastro" completo de las
3 fases en una sola fila de Pendientes.

## Licencia

MIT
