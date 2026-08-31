#!/usr/bin/env node
/* ============================================================================
 * evidencia-f07.js - Genera TODA la evidencia numerica del informe de F-07.
 *
 * No prueba nada ni afecta a la aplicacion: imprime las tablas de
 * docs/f07-validacion-gpq.md para que cualquiera pueda regenerarlas y
 * comprobar que los numeros del informe salen de correr esto.
 *
 *   node tests/evidencia-f07.js            todo
 *   node tests/evidencia-f07.js <seccion>  una sola: exacta | mls | aiag |
 *                                          cobertura | diseno | semilla | modelo
 *
 * LAS DOS REFERENCIAS INDEPENDIENTES QUE USA
 *
 *   1. EXACTA. Para UN solo componente de varianza, el intervalo correcto se
 *      conoce en forma cerrada: [df*MS/chi2_{df,1-a/2}, df*MS/chi2_{df,a/2}].
 *      Si el GPQ esta bien construido tiene que converger a el. Aqui se
 *      implementa la chi2 inversa DESDE CERO -serie y fraccion continua de la
 *      gamma incompleta- sin usar stats.js ni interval.js, para que un error
 *      compartido no pueda pasar desapercibido.
 *
 *   2. MLS (Graybill-Wang), en forma cerrada, sobre la varianza total del
 *      Gage R&R. Es el metodo que usa Minitab, y aqui esta escrito a partir de
 *      su formulacion publicada, sin simular nada y sin tocar interval.js.
 *
 * Ninguna de las dos comparte una linea de codigo con interval.js.
 * ==========================================================================*/
'use strict';

var path = require('path');
var REPO = path.resolve(__dirname, '..');
require(path.join(REPO, 'assets/js/design.js'));
require(path.join(REPO, 'assets/js/stats.js'));
require(path.join(REPO, 'assets/js/anova.js'));
require(path.join(REPO, 'assets/js/anova-nested.js'));
require(path.join(REPO, 'assets/js/interval.js'));

/* =========================================================================
 * A. Chi-cuadrada inversa, implementacion independiente
 * ========================================================================= */

/** log(Gamma(a)) - Lanczos. */
function lgamma(a) {
  var g = [676.5203681218851, -1259.1392167224028, 771.32342877765313,
           -176.61502916214059, 12.507343278686905, -0.13857109526572012,
           9.9843695780195716e-6, 1.5056327351493116e-7];
  if (a < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * a)) - lgamma(1 - a);
  a -= 1;
  var x = 0.99999999999980993;
  for (var i = 0; i < g.length; i++) x += g[i] / (a + i + 1);
  var t = a + g.length - 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (a + 0.5) * Math.log(t) - t + Math.log(x);
}

/** P(a,x): gamma incompleta regularizada inferior. Serie + fraccion continua. */
function gammaP(a, x) {
  if (x <= 0) return 0;
  if (x < a + 1) {                                   // serie
    var ap = a, sum = 1 / a, del = sum;
    for (var n = 0; n < 500; n++) {
      ap++; del *= x / ap; sum += del;
      if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
    }
    return sum * Math.exp(-x + a * Math.log(x) - lgamma(a));
  }
  // fraccion continua para Q(a,x), luego P = 1 - Q
  var tiny = 1e-300;
  var b = x + 1 - a, c = 1 / tiny, d = 1 / b, h = d;
  for (var i = 1; i < 500; i++) {
    var an = -i * (i - a);
    b += 2;
    d = an * d + b; if (Math.abs(d) < tiny) d = tiny;
    c = b + an / c;  if (Math.abs(c) < tiny) c = tiny;
    d = 1 / d;
    var delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < 1e-15) break;
  }
  var Q = Math.exp(-x + a * Math.log(x) - lgamma(a)) * h;
  return 1 - Q;
}

function chi2cdf(x, k) { return gammaP(k / 2, x / 2); }

/** chi2 inversa por biseccion. Robusta y suficiente: 200 iteraciones. */
function chi2inv(p, k) {
  var lo = 0, hi = Math.max(10 * k, 100);
  while (chi2cdf(hi, k) < p) hi *= 2;
  for (var i = 0; i < 200; i++) {
    var mid = (lo + hi) / 2;
    if (chi2cdf(mid, k) < p) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/* =========================================================================
 * B. Datos: el dataset AIAG y simuladores deterministas
 * ========================================================================= */
var AIAG = [
  [0.29, 0.41, 0.64, 0.08, 0.25, 0.07, 0.04, -0.11, -0.15],
  [-0.56, -0.68, -0.58, -0.47, -1.22, -0.68, -1.38, -1.13, -0.96],
  [1.34, 1.17, 1.27, 1.19, 0.94, 1.34, 0.88, 1.09, 0.67],
  [0.47, 0.50, 0.64, 0.01, 1.03, 0.20, 0.14, 0.20, 0.11],
  [-0.80, -0.92, -0.84, -0.56, -1.20, -1.28, -1.46, -1.07, -1.45],
  [0.02, -0.11, -0.21, -0.20, 0.22, 0.06, -0.29, -0.67, -0.49],
  [0.59, 0.75, 0.66, 0.47, 0.55, 0.83, 0.02, 0.01, 0.21],
  [-0.31, -0.20, -0.17, -0.63, 0.08, -0.34, -0.46, -0.56, -0.49],
  [2.26, 1.99, 2.01, 1.80, 2.12, 2.19, 1.77, 1.45, 1.87],
  [-1.36, -1.25, -1.31, -1.68, -1.62, -1.50, -1.49, -1.77, -2.16]
];
function aiagRows() {
  var rows = [];
  ['A', 'B', 'C'].forEach(function (op, oi) {
    for (var i = 0; i < 10; i++) for (var k = 0; k < 3; k++) {
      rows.push({ operator: op, part: 'Pieza ' + (i + 1), value: AIAG[i][oi * 3 + k] });
    }
  });
  return rows;
}

function maker(seed) {
  var s = seed >>> 0;
  function u() { s = (Math.imul(1103515245, s) + 12345) >>> 0; return (s + 0.5) / 4294967296; }
  function nrm() { return Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); }
  return { u: u, nrm: nrm };
}
function crossed(g, p, o, r, sPart, sOp, sInt, sRep) {
  var rows = [], pv = [], ov = [], iv = {}, i, j, k;
  for (i = 0; i < p; i++) pv.push(g.nrm() * sPart);
  for (j = 0; j < o; j++) ov.push(g.nrm() * sOp);
  for (j = 0; j < o; j++) for (i = 0; i < p; i++) iv[j + '|' + i] = g.nrm() * (sInt || 0);
  for (j = 0; j < o; j++) for (i = 0; i < p; i++) for (k = 0; k < r; k++) {
    rows.push({ operator: 'Op' + j, part: 'P' + i,
                value: 100 + pv[i] + ov[j] + iv[j + '|' + i] + g.nrm() * sRep });
  }
  return rows;
}
function nestedRows(g, n, o, r, sPart, sOp, sRep) {
  var rows = [], i, j, k;
  for (j = 0; j < o; j++) {
    var ob = g.nrm() * sOp;
    for (i = 0; i < n; i++) {
      var pv = g.nrm() * sPart;
      for (k = 0; k < r; k++) {
        rows.push({ operator: 'Op' + j, part: 'Op' + j + '-P' + i,
                    value: 100 + pv + ob + g.nrm() * sRep });
      }
    }
  }
  return rows;
}
function trueSV(sPart, sOp, sInt, sRep) {
  var grr = sOp * sOp + (sInt || 0) * (sInt || 0) + sRep * sRep;
  return 100 * Math.sqrt(grr / (grr + sPart * sPart));
}
function msOf(res) {
  var m = {};
  res.anova.forEach(function (row) { if (row.ms !== null) m[row.source] = { df: row.df, ms: row.ms }; });
  return m;
}
function fx(v, d) { return (v === null || v === undefined) ? '-' : Number(v).toFixed(d === undefined ? 4 : d); }

/* =========================================================================
 * 1. REFERENCIA EXACTA - un solo componente de varianza
 * ========================================================================= */
function seccionExacta() {
  console.log('\n### 1. Referencia EXACTA: el GPQ contra la chi2 en forma cerrada\n');
  console.log('Para un solo componente, sigma2 = MS_rep, el intervalo exacto es');
  console.log('[df*MS/chi2_{df,1-a/2}, df*MS/chi2_{df,a/2}]. El GPQ tiene que converger a el.\n');
  console.log('  df     MS       exacto inf   exacto sup   GPQ inf     GPQ sup     dif inf %  dif sup %');
  [[6, 1.0], [18, 2.5], [60, 0.03907], [200, 1.0]].forEach(function (c) {
    var df = c[0], ms = c[1], conf = 0.90, a = (1 - conf) / 2;
    var exLo = df * ms / chi2inv(1 - a, df), exHi = df * ms / chi2inv(a, df);
    /* El GPQ del modulo, aplicado a un solo MS: se replica el pivote con las
       funciones publicas de interval.js (rng y chi2) pero la referencia con la
       que se compara -chi2inv- es independiente. */
    var u = MSAInterval._rng(20260831), sim = [];
    for (var b = 0; b < 200000; b++) sim.push(ms * df / MSAInterval._chi2(u, df));
    sim.sort(function (x, y) { return x - y; });
    var gLo = MSAInterval._percentile(sim, a), gHi = MSAInterval._percentile(sim, 1 - a);
    console.log('  ' + String(df).padEnd(6) + fx(ms, 5).padEnd(9) +
      fx(exLo, 6).padStart(11) + fx(exHi, 6).padStart(13) +
      fx(gLo, 6).padStart(12) + fx(gHi, 6).padStart(12) +
      fx(100 * (gLo - exLo) / exLo, 3).padStart(11) + fx(100 * (gHi - exHi) / exHi, 3).padStart(11));
  });
  console.log('\n  (200 000 sorteos; la diferencia que queda es error Monte Carlo)');
}

/* =========================================================================
 * 2. REFERENCIA MLS (Graybill-Wang) - varianza total del Gage R&R
 * ========================================================================= */
/* MLS para theta = suma(c_i * MS_i) con todos los c_i > 0:
 *   L = theta - sqrt( suma( G_i^2 c_i^2 MS_i^2 ) )
 *   U = theta + sqrt( suma( H_i^2 c_i^2 MS_i^2 ) )
 *   G_i = 1 - df_i / chi2_{df_i, 1-a}      H_i = df_i / chi2_{df_i, a} - 1
 * Forma cerrada, sin simular, sin usar interval.js.                        */
function mlsSum(terms, conf) {
  var a = (1 - conf) / 2, theta = 0, sl = 0, su = 0;
  terms.forEach(function (t) {
    var G = 1 - t.df / chi2inv(1 - a, t.df);
    var H = t.df / chi2inv(a, t.df) - 1;
    theta += t.c * t.ms;
    sl += G * G * t.c * t.c * t.ms * t.ms;
    su += H * H * t.c * t.c * t.ms * t.ms;
  });
  return { lo: Math.max(0, theta - Math.sqrt(sl)), hi: theta + Math.sqrt(su), point: theta };
}

/** Los coeficientes c_i de sigma2_grr, por modelo. Todos positivos. */
function grrTerms(res) {
  var m = msOf(res), d = {
    o: res.design.operators.length,
    p: res.model === 'nested' ? res.design.partsPerOperator : res.design.parts.length,
    r: res.design.replicates
  };
  if (res.model === 'with-interaction') {
    // sigma2_grr = MS_O/(p r) + MS_PO (p-1)/(p r) + MS_E (r-1)/r
    return [{ c: 1 / (d.p * d.r), df: m['Operador'].df, ms: m['Operador'].ms },
            { c: (d.p - 1) / (d.p * d.r), df: m['Operador * Parte'].df, ms: m['Operador * Parte'].ms },
            { c: (d.r - 1) / d.r, df: m['Repetibilidad'].df, ms: m['Repetibilidad'].ms }];
  }
  if (res.model === 'without-interaction') {
    // sigma2_grr = MS_O/(p r) + MS_E (p r - 1)/(p r)
    return [{ c: 1 / (d.p * d.r), df: m['Operador'].df, ms: m['Operador'].ms },
            { c: (d.p * d.r - 1) / (d.p * d.r), df: m['Repetibilidad'].df, ms: m['Repetibilidad'].ms }];
  }
  return null;   // anidado: sigma2_grr lleva un coeficiente NEGATIVO, otro caso
}

/** El GPQ del modulo, pero devolviendo sigma2_grr en vez del %. */
function gpqGrr(res, conf, draws) {
  var m = msOf(res), d = {
    o: res.design.operators.length,
    p: res.model === 'nested' ? res.design.partsPerOperator : res.design.parts.length,
    r: res.design.replicates
  };
  var names = Object.keys(m);
  var u = MSAInterval._rng(20260831), out = [];
  for (var b = 0; b < (draws || 40000); b++) {
    var sim = {};
    names.forEach(function (n) { sim[n] = m[n].ms * m[n].df / MSAInterval._chi2(u, m[n].df); });
    var grr;
    if (res.model === 'with-interaction') {
      grr = sim['Repetibilidad'] +
            Math.max(0, (sim['Operador'] - sim['Operador * Parte']) / (d.p * d.r)) +
            Math.max(0, (sim['Operador * Parte'] - sim['Repetibilidad']) / d.r);
    } else {
      grr = sim['Repetibilidad'] +
            Math.max(0, (sim['Operador'] - sim['Repetibilidad']) / (d.p * d.r));
    }
    out.push(grr);
  }
  out.sort(function (x, y) { return x - y; });
  var a = (1 - conf) / 2;
  return { lo: MSAInterval._percentile(out, a), hi: MSAInterval._percentile(out, 1 - a) };
}

function seccionMLS() {
  console.log('\n### 2. Referencia MLS (Graybill-Wang) sobre sigma2 del Gage R&R\n');
  console.log('Forma cerrada, sin simular. Es el metodo que usa Minitab.\n');
  console.log('  caso                    modelo               punto      MLS [inf, sup]            GPQ [inf, sup]            dif inf %  dif sup %');
  var casos = [
    { n: 'AIAG 10x3x3', res: MSAAnova.compute(aiagRows(), { alpha: 0.25, interaction: 'auto' }) },
    { n: 'AIAG, interaccion forzada', res: MSAAnova.compute(aiagRows(), { interaction: 'include' }) },
    { n: 'sim 10x3x3 con interaccion',
      res: MSAAnova.compute(crossed(maker(4242), 10, 3, 3, 1, 0.10, 0.12, 0.25), { interaction: 'include' }) },
    { n: 'sim 25x4x3 sin interaccion',
      res: MSAAnova.compute(crossed(maker(99), 25, 4, 3, 1, 0.06, 0, 0.15), { interaction: 'exclude' }) },
    { n: 'sim 5x3x2 chico',
      res: MSAAnova.compute(crossed(maker(7), 5, 3, 2, 1, 0.05, 0, 0.14), { interaction: 'exclude' }) }
  ];
  casos.forEach(function (c) {
    var terms = grrTerms(c.res);
    if (!terms) return;
    var mls = mlsSum(terms, 0.90), gpq = gpqGrr(c.res, 0.90);
    console.log('  ' + c.n.padEnd(26) + c.res.model.padEnd(21) +
      fx(mls.point, 5).padStart(9) +
      ('[' + fx(mls.lo, 5) + ', ' + fx(mls.hi, 5) + ']').padStart(26) +
      ('[' + fx(gpq.lo, 5) + ', ' + fx(gpq.hi, 5) + ']').padStart(26) +
      fx(100 * (gpq.lo - mls.lo) / mls.lo, 1).padStart(11) +
      fx(100 * (gpq.hi - mls.hi) / mls.hi, 1).padStart(11));
  });
  console.log('\n  MLS y GPQ son metodos DISTINTOS: no tienen por que coincidir, solo concordar.');
  console.log('  Se comparan sobre sigma2_grr, que es donde MLS aplica en forma cerrada.');
}

/* =========================================================================
 * 3. Dataset AIAG, trazabilidad completa
 * ========================================================================= */
function seccionAIAG() {
  console.log('\n### 3. Dataset AIAG: trazabilidad numerica completa\n');
  var res = MSAAnova.compute(aiagRows(), { alpha: 0.25, interaction: 'auto', lsl: -5, usl: 5 });
  var d = { o: 3, p: 10, r: 3 };
  console.log('  modelo final: ' + res.model + '   (auto agrupo la interaccion: p = ' +
    fx((res.anovaFull.rows.filter(function (x) { return /Parte$/.test(x.source); })[0] || {}).ms, 4) + ')');
  console.log('\n  TABLA ANOVA usada por el intervalo');
  console.log('    fuente                gl        SC           CM');
  res.anova.forEach(function (row) {
    console.log('    ' + row.source.padEnd(22) + String(row.df).padEnd(10) +
      fx(row.ss, 5).padStart(11) + fx(row.ms, 7).padStart(14));
  });
  console.log('\n  COMPONENTES PUNTUALES');
  ['rep', 'repro', 'op', 'grr', 'part', 'total'].forEach(function (k) {
    var c = res.components.filter(function (x) { return x.key === k; })[0];
    if (c) console.log('    ' + c.source.padEnd(22) + fx(c.variance, 7).padStart(12) +
      '   sigma = ' + fx(c.stdDev, 6));
  });
  var m = msOf(res);
  console.log('\n  SEMILLA (FNV-1a sobre "df:MS" de cada fuente, en orden del modelo)');
  var sources = ['Parte', 'Operador', 'Repetibilidad'];
  var h = 2166136261;
  sources.forEach(function (n) {
    var text = m[n].df + ':' + m[n].ms.toPrecision(12);
    console.log('    ' + n.padEnd(16) + '"' + text + '"');
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  });
  console.log('    semilla = ' + (h >>> 0));

  var iv1 = MSAInterval.forResult(res);
  var iv2 = MSAInterval.forResult(MSAAnova.compute(aiagRows(),
    { alpha: 0.25, interaction: 'auto', lsl: -5, usl: 5 }));
  console.log('\n  INTERVALOS (conf ' + (100 * iv1.conf) + ' %, ' + iv1.draws + ' sorteos, percentiles ' +
    (100 * (1 - iv1.conf) / 2) + ' y ' + (100 - 100 * (1 - iv1.conf) / 2) + ')');
  console.log('    %StudyVar    punto ' + fx(res.metrics.pctStudyVar, 2).padStart(7) +
    '   [' + fx(iv1.studyVar.lo, 2) + ', ' + fx(iv1.studyVar.hi, 2) + ']');
  console.log('    %Contrib     punto ' + fx(res.metrics.pctContribution, 2).padStart(7) +
    '   [' + fx(iv1.contribution.lo, 2) + ', ' + fx(iv1.contribution.hi, 2) + ']');
  console.log('    %Tolerance   punto ' + fx(res.metrics.pctTolerance, 2).padStart(7) +
    '   [' + fx(iv1.tolerance.lo, 2) + ', ' + fx(iv1.tolerance.hi, 2) + ']');
  console.log('    segunda ejecucion identica: ' +
    (JSON.stringify(iv1.studyVar) === JSON.stringify(iv2.studyVar)));

  console.log('\n  DE DONDE SALE EL LIMITE SUPERIOR DE ' + fx(iv1.studyVar.hi, 2) + ' %');
  /* Se reconstruye el sorteo para ver que componente domina la cola alta. */
  var u = MSAInterval._rng(h >>> 0), reg = [];
  for (var b = 0; b < 4000; b++) {
    var sim = {};
    sources.forEach(function (n) { sim[n] = m[n].ms * m[n].df / MSAInterval._chi2(u, m[n].df); });
    var rep = sim['Repetibilidad'];
    var op = Math.max(0, (sim['Operador'] - sim['Repetibilidad']) / (d.p * d.r));
    var part = Math.max(0, (sim['Parte'] - sim['Repetibilidad']) / (d.o * d.r));
    var grr = rep + op, tot = grr + part;
    reg.push({ sv: 100 * Math.sqrt(grr / tot), op: op, rep: rep, part: part,
               wOp: m['Operador'].df / (sim['Operador'] / m['Operador'].ms * m['Operador'].df) });
  }
  reg.sort(function (x, y) { return x.sv - y.sv; });
  [0.05, 0.50, 0.95, 0.99].forEach(function (q) {
    var e = reg[Math.min(reg.length - 1, Math.round(q * (reg.length - 1)))];
    console.log('    percentil ' + String(100 * q).padStart(3) + ' %:  %SV = ' + fx(e.sv, 2).padStart(6) +
      '   sigma2_op = ' + fx(e.op, 5).padStart(9) + '   sigma2_rep = ' + fx(e.rep, 5).padStart(8) +
      '   sigma2_part = ' + fx(e.part, 5).padStart(8));
  });
  var a = 0.05;
  console.log('\n    gl del operador = ' + m['Operador'].df + '.  chi2_{2, 0.05} = ' +
    fx(chi2inv(a, m['Operador'].df), 5));
  console.log('    factor maximo del pivote al 5 %: df/chi2 = ' +
    fx(m['Operador'].df / chi2inv(a, m['Operador'].df), 2) + 'x');
  console.log('    CM_Operador = ' + fx(m['Operador'].ms, 5) + '  ->  hasta ' +
    fx(m['Operador'].ms * m['Operador'].df / chi2inv(a, m['Operador'].df), 5) + ' en el 5 % superior');
  console.log('    sigma2_op correspondiente = (ese CM - CM_rep)/(p*r) = ' +
    fx((m['Operador'].ms * m['Operador'].df / chi2inv(a, m['Operador'].df) - m['Repetibilidad'].ms) / 30, 5));
  var cGrr = res.variance.grr, cPart = res.variance.part;
  var opAlto = (m['Operador'].ms * m['Operador'].df / chi2inv(a, m['Operador'].df) - m['Repetibilidad'].ms) / 30;
  console.log('    con sigma2_part y sigma2_rep en su valor puntual, %SV seria ' +
    fx(100 * Math.sqrt((res.variance.repeatability + opAlto) /
       (res.variance.repeatability + opAlto + cPart)), 2) + ' %');
  console.log('    (el limite real, ' + fx(iv1.studyVar.hi, 2) + ' %, ademas mueve sigma2_part hacia abajo)');

  console.log('\n  CONTRASTE con la referencia MLS sobre sigma2_grr');
  var mls = mlsSum(grrTerms(res), 0.90);
  console.log('    sigma2_grr punto ' + fx(res.variance.grr, 6) +
    '   MLS [' + fx(mls.lo, 6) + ', ' + fx(mls.hi, 6) + ']');
  var g = gpqGrr(res, 0.90);
  console.log('                            ' + '   GPQ [' + fx(g.lo, 6) + ', ' + fx(g.hi, 6) + ']');
}

/* =========================================================================
 * 4. Cobertura por escenario
 * ========================================================================= */
function seccionCobertura() {
  console.log('\n### 4. Cobertura por escenario\n');
  var ESC = [
    { n: 'cruzado excelente lejos de 10', p: 10, o: 3, r: 3, sPart: 1, sOp: 0.02, sInt: 0, sRep: 0.05 },
    { n: 'cruzado JUSTO en 10 %',         p: 10, o: 3, r: 3, sPart: 1, sOp: 0.05, sInt: 0, sRep: 0.087 },
    { n: 'cruzado medio (20 %)',          p: 10, o: 3, r: 3, sPart: 1, sOp: 0.08, sInt: 0, sRep: 0.187 },
    { n: 'cruzado JUSTO en 30 %',         p: 10, o: 3, r: 3, sPart: 1, sOp: 0.12, sInt: 0, sRep: 0.288 },
    { n: 'cruzado malo (55 %)',           p: 10, o: 3, r: 3, sPart: 1, sOp: 0.35, sInt: 0, sRep: 0.55 },
    { n: 'cruzado CON interaccion',       p: 10, o: 3, r: 3, sPart: 1, sOp: 0.10, sInt: 0.15, sRep: 0.25 },
    { n: 'cruzado sigma_op = 0 exacto',   p: 10, o: 3, r: 3, sPart: 1, sOp: 0, sInt: 0, sRep: 0.20 },
    { n: 'cruzado sigma_op ~ 0',          p: 10, o: 3, r: 3, sPart: 1, sOp: 0.005, sInt: 0, sRep: 0.20 },
    { n: 'cruzado chico 5x3x2',           p: 5,  o: 3, r: 2, sPart: 1, sOp: 0.05, sInt: 0, sRep: 0.14 },
    { n: 'cruzado 2 operadores',          p: 10, o: 2, r: 3, sPart: 1, sOp: 0.10, sInt: 0, sRep: 0.28 },
    { n: 'cruzado 5 operadores',          p: 10, o: 5, r: 3, sPart: 1, sOp: 0.10, sInt: 0, sRep: 0.28 },
    { n: 'cruzado grande 25x4x4',         p: 25, o: 4, r: 4, sPart: 1, sOp: 0.10, sInt: 0, sRep: 0.28 },
    { n: 'anidado 10x3x3',   nested: true, p: 10, o: 3, r: 3, sPart: 1, sOp: 0.10, sInt: 0, sRep: 0.28 },
    { n: 'anidado 5x3x2',    nested: true, p: 5,  o: 3, r: 2, sPart: 1, sOp: 0.05, sInt: 0, sRep: 0.14 },
    { n: 'anidado malo',     nested: true, p: 10, o: 3, r: 3, sPart: 1, sOp: 0.35, sInt: 0, sRep: 0.55 }
  ];
  var N = 400, DRAWS = 1200, CONF = 0.90;
  console.log('  ' + N + ' estudios por escenario, ' + DRAWS + ' sorteos GPQ cada uno, conf ' +
    (100 * CONF) + ' %, semilla base 20260907');
  console.log('\n  escenario                     %GRR   cobert   EE     nulos  trunc   ACEP  INAC  NOCONC   aceptMal rechMal');
  ESC.forEach(function (e, idx) {
    var g = maker(20260907 + idx * 101);
    var tv = trueSV(e.sPart, e.sOp, e.sInt, e.sRep);
    var dentro = 0, hechos = 0, nulos = 0, trunc = 0;
    var acep = 0, inac = 0, noconc = 0, aceptMal = 0, rechMal = 0;
    for (var t = 0; t < N; t++) {
      var rows = e.nested ? nestedRows(g, e.p, e.o, e.r, e.sPart, e.sOp, e.sRep)
                          : crossed(g, e.p, e.o, e.r, e.sPart, e.sOp, e.sInt, e.sRep);
      var res;
      try {
        res = e.nested ? MSANested.compute(rows, {})
                       : MSAAnova.compute(rows, { alpha: 0.25, interaction: 'auto' });
      } catch (err) { nulos++; continue; }
      if ((res.negativeComponents || []).length) trunc++;
      var iv = MSAInterval.forResult(res, { draws: DRAWS, conf: CONF });
      if (!iv) { nulos++; continue; }
      hechos++;
      if (iv.studyVar.lo <= tv && tv <= iv.studyVar.hi) dentro++;
      var c = MSAInterval.classify(iv.studyVar, null, res.design.n);
      if (!c.conclusive) noconc++;
      else if (c.level === 'ok') { acep++; if (tv > 30) aceptMal++; }
      else if (c.level === 'bad') { inac++; if (tv < 10) rechMal++; }
      else { acep += 0; }
    }
    var cob = 100 * dentro / hechos;
    var ee = 100 * Math.sqrt((cob / 100) * (1 - cob / 100) / hechos);
    console.log('  ' + e.n.padEnd(30) + fx(tv, 1).padStart(5) + fx(cob, 1).padStart(8) +
      ('+-' + fx(ee, 1)).padStart(8) + String(nulos).padStart(7) +
      (fx(100 * trunc / N, 0) + '%').padStart(7) +
      String(acep).padStart(6) + String(inac).padStart(6) + String(noconc).padStart(8) +
      String(aceptMal).padStart(10) + String(rechMal).padStart(8));
  });
  console.log('\n  ACEP/INAC/NOCONC no suman ' + N + ': falta la banda marginal (10-30 %).');
  console.log('  aceptMal = declarado Aceptable con %GRR real > 30. rechMal = Inaceptable con real < 10.');
}

/* =========================================================================
 * 5. Sensibilidad a la ESTRUCTURA del diseno, no al total de mediciones
 * ========================================================================= */
function seccionDiseno() {
  console.log('\n### 5. Tres disenos con 60 mediciones no son el mismo estudio\n');
  var D = [
    { n: '3 op x 10 piezas x 2 rep', o: 3, p: 10, r: 2 },
    { n: '2 op x 15 piezas x 2 rep', o: 2, p: 15, r: 2 },
    { n: '10 op x 3 piezas x 2 rep', o: 10, p: 3, r: 2 },
    { n: '3 op x 5 piezas x 2 rep (N=30)', o: 3, p: 5, r: 2 },
    { n: '3 op x 10 piezas x 3 rep (N=90)', o: 3, p: 10, r: 3 }
  ];
  console.log('  diseno                            N    gl_parte gl_op gl_int gl_rep   ancho IC   concluye');
  D.forEach(function (d, idx) {
    var g = maker(555 + idx * 7), anchos = 0, conc = 0, n = 150, hechos = 0;
    for (var t = 0; t < n; t++) {
      var res = MSAAnova.compute(crossed(g, d.p, d.o, d.r, 1, 0.02, 0, 0.05),
                                 { alpha: 0.25, interaction: 'auto' });
      var iv = MSAInterval.forResult(res, { draws: 900, conf: 0.90 });
      if (!iv) continue;
      hechos++;
      anchos += iv.studyVar.hi - iv.studyVar.lo;
      /* Se mide la conclusividad SOLO por el intervalo, sin el piso de 60,
         para poder juzgar si el piso aporta algo. */
      if (MSAInterval.classify(iv.studyVar).conclusive) conc++;
    }
    console.log('  ' + d.n.padEnd(34) + String(d.o * d.p * d.r).padStart(4) +
      String(d.p - 1).padStart(9) + String(d.o - 1).padStart(6) +
      String((d.p - 1) * (d.o - 1)).padStart(7) + String(d.p * d.o * (d.r - 1)).padStart(7) +
      (fx(anchos / hechos, 1) + ' pp').padStart(11) +
      (fx(100 * conc / hechos, 0) + ' %').padStart(11));
  });
  console.log('\n  Gage excelente (%GRR real 5.4 %). "concluye" = solo por el intervalo, SIN el piso de 60.');
}

/* =========================================================================
 * 6. Semilla: que entra y que no
 * ========================================================================= */
function seccionSemilla() {
  console.log('\n### 6. Semilla: que entra hoy y que no\n');
  var res = MSAAnova.compute(aiagRows(), { alpha: 0.25, interaction: 'auto' });
  var a = MSAInterval.forResult(res, { conf: 0.90, draws: 4000 });
  var b = MSAInterval.forResult(res, { conf: 0.95, draws: 4000 });
  var c = MSAInterval.forResult(res, { conf: 0.90, draws: 20000 });
  console.log('  conf 0.90, 4000  -> [' + fx(a.studyVar.lo, 3) + ', ' + fx(a.studyVar.hi, 3) + ']');
  console.log('  conf 0.95, 4000  -> [' + fx(b.studyVar.lo, 3) + ', ' + fx(b.studyVar.hi, 3) +
    ']   mas ancho: ' + ((b.studyVar.hi - b.studyVar.lo) > (a.studyVar.hi - a.studyVar.lo)));
  console.log('  conf 0.90, 20000 -> [' + fx(c.studyVar.lo, 3) + ', ' + fx(c.studyVar.hi, 3) +
    ']   solo precision Monte Carlo');

  /* Colision deliberada: un anidado y un cruzado con los MISMOS df y CM. */
  console.log('\n  COLISION de semilla entre modelos distintos');
  console.log('  La semilla solo mira df y CM, no el modelo ni el diseno. Dos estudios de');
  console.log('  modelos distintos con los mismos df y CM comparten el flujo aleatorio.');
  var m = msOf(res);
  var h = 2166136261;
  ['Parte', 'Operador', 'Repetibilidad'].forEach(function (n) {
    var text = m[n].df + ':' + m[n].ms.toPrecision(12);
    for (var i = 0; i < text.length; i++) { h ^= text.charCodeAt(i); h = Math.imul(h, 16777619); }
  });
  console.log('    semilla del AIAG cruzado agrupado: ' + (h >>> 0));
  console.log('    (un anidado con df 9/20/60 y esos mismos CM daria la misma; los');
  console.log('     intervalos SERIAN distintos, porque las formulas difieren, pero la');
  console.log('     firma no es canonica: no distingue de que estudio salio)');

  console.log('\n  Lo que NO entra hoy en la semilla:');
  ['modelo (cruzado/anidado, con/sin interaccion)', 'numero de operadores, piezas y replicas',
   'nivel de confianza', 'numero de sorteos', 'version del algoritmo'].forEach(function (x) {
    console.log('    - ' + x);
  });
}

/* =========================================================================
 * 7. El intervalo corresponde al modelo del punto
 * ========================================================================= */
function seccionModelo() {
  console.log('\n### 7. El intervalo usa el MISMO modelo que el punto\n');
  var casos = [
    { n: 'auto -> agrupa', o: { alpha: 0.25, interaction: 'auto' } },
    { n: 'interaccion forzada', o: { interaction: 'include' } },
    { n: 'interaccion excluida', o: { interaction: 'exclude' } }
  ];
  console.log('  opcion                 modelo del punto      fuentes que usa el intervalo');
  casos.forEach(function (c) {
    var res = MSAAnova.compute(aiagRows(), c.o);
    var iv = MSAInterval.forResult(res);
    var m = msOf(res);
    console.log('  ' + c.n.padEnd(23) + res.model.padEnd(22) +
      Object.keys(m).join(', ') + '   -> IC [' + fx(iv.studyVar.lo, 2) + ', ' +
      fx(iv.studyVar.hi, 2) + ']');
  });

  console.log('\n  ANIDADO: identidad local contra global, y orden de filas');
  function nestedLocal(local) {
    var rows = [];
    ['Ana', 'Beto', 'Cruz'].forEach(function (op, oi) {
      for (var p = 0; p < 5; p++) for (var k = 0; k < 3; k++) {
        rows.push({ operator: op, part: local ? String(p + 1) : String(oi * 5 + p + 1),
                    value: 10 + p * 0.7 + oi * 0.04 + ((p * 7 + k * 3 + oi * 11) % 5) * 0.01 });
      }
    });
    return rows;
  }
  var loc = MSAInterval.forResult(MSANested.compute(nestedLocal(true), {}));
  var glo = MSAInterval.forResult(MSANested.compute(nestedLocal(false), {}));
  var rows = nestedLocal(true), mix = [];
  for (var i = 0; i < rows.length; i++) mix.push(rows[(i * 23) % rows.length]);
  var mez = MSAInterval.forResult(MSANested.compute(mix, {}));
  console.log('    piezas 1..5 por operador : [' + fx(loc.studyVar.lo, 4) + ', ' + fx(loc.studyVar.hi, 4) + ']');
  console.log('    piezas 1..15 corridas    : [' + fx(glo.studyVar.lo, 4) + ', ' + fx(glo.studyVar.hi, 4) + ']');
  console.log('    filas reordenadas        : [' + fx(mez.studyVar.lo, 4) + ', ' + fx(mez.studyVar.hi, 4) + ']');
  console.log('    identicos: ' +
    (JSON.stringify(loc.studyVar) === JSON.stringify(glo.studyVar) &&
     JSON.stringify(loc.studyVar) === JSON.stringify(mez.studyVar)));
  var nres = MSANested.compute(nestedLocal(true), {});
  console.log('    fuentes del anidado: ' + Object.keys(msOf(nres)).join(', '));
}

/* ========================================================================= */
var SEC = { exacta: seccionExacta, mls: seccionMLS, aiag: seccionAIAG,
            cobertura: seccionCobertura, diseno: seccionDiseno,
            semilla: seccionSemilla, modelo: seccionModelo };
var which = process.argv[2];
if (which && SEC[which]) SEC[which]();
else Object.keys(SEC).forEach(function (k) { SEC[k](); });
