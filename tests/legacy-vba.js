/* ============================================================================
 * legacy-vba.js - Reimplementacion FIEL del motor VBA original del libro
 * Gage_RR_Study.xlsm, incluidos sus errores. NO se usa en la aplicacion:
 * existe solo para mostrar lado a lado el efecto de cada correccion.
 *
 * Reproduce exactamente, sobre los datos del propio libro del usuario, los
 * valores de las hojas SS_Calculos y Varianza (SC_Parte = 0.0019037,
 * Total Gage R&R = 0.26 %, %Study Variation = 5.09 %, NDC = 27).
 * ==========================================================================*/
(function (global) {
  'use strict';

  function mean(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; }
  // VBA Round() usa redondeo bancario (half-to-even).
  function vbaRound(v, d) {
    var m = Math.pow(10, d), x = v * m, f = Math.floor(x), diff = x - f;
    var r = diff > 0.5 ? f + 1 : diff < 0.5 ? f : (f % 2 === 0 ? f : f + 1);
    return r / m;
  }

  function compute(rows) {
    var ops = [], parts = [], cell = Object.create(null), all = [];
    rows.forEach(function (r) {
      var o = String(r.operator).trim(), p = String(r.part).trim(), v = Number(r.value);
      if (ops.indexOf(o) < 0) ops.push(o);
      if (parts.indexOf(p) < 0) parts.push(p);
      (cell[o + '|' + p] || (cell[o + '|' + p] = [])).push(v);
      all.push(v);
    });
    var o_ = ops.length, p_ = parts.length, N = all.length;
    var r_ = Math.round(N / (o_ * p_));

    // CalculoMedias.bas: las medias se escriben con Round(x, 6).
    var mp = {}, mo = {}, mpo = {};
    parts.forEach(function (pt) {
      var acc = [];
      ops.forEach(function (op) { acc = acc.concat(cell[op + '|' + pt]); });
      mp[pt] = vbaRound(mean(acc), 6);
    });
    ops.forEach(function (op) {
      var acc = [];
      parts.forEach(function (pt) { acc = acc.concat(cell[op + '|' + pt]); });
      mo[op] = vbaRound(mean(acc), 6);
    });
    ops.forEach(function (op) {
      parts.forEach(function (pt) { mpo[op + '|' + pt] = vbaRound(mean(cell[op + '|' + pt]), 6); });
    });
    var grand = mean(all);   // el promedio global NO se redondea

    // CalcularSumasDeCuadrados.bas
    var SSp = 0, SSo = 0, SSi = 0, SSe = 0;
    parts.forEach(function (pt) { SSp += o_ * Math.pow(mp[pt] - grand, 2); });        // BUG: falta * r
    ops.forEach(function (op) { SSo += p_ * Math.pow(mo[op] - grand, 2); });          // BUG: falta * r
    ops.forEach(function (op) {
      parts.forEach(function (pt) {
        SSi += r_ * Math.pow(mpo[op + '|' + pt] - mo[op] - mp[pt] + grand, 2);
      });
    });
    ops.forEach(function (op) {
      parts.forEach(function (pt) {
        cell[op + '|' + pt].forEach(function (x) { SSe += Math.pow(x - mpo[op + '|' + pt], 2); });
      });
    });

    var MSp = SSp / (p_ - 1), MSo = SSo / (o_ - 1);
    var MSi = SSi / ((o_ - 1) * (p_ - 1)), MSe = SSe / (N - o_ * p_);

    // CalculoVarianza.bas - divisores incorrectos, sin prueba F, sin agrupamiento
    var Vp = Math.max(0, (MSp - MSi) / o_);   // BUG: deberia ser / (o * r)
    var Vo = Math.max(0, (MSo - MSi) / p_);   // BUG: deberia ser / (p * r)
    var Vi = Math.max(0, MSi - MSe);          // BUG: falta / r
    var Ve = MSe;

    var grr = Ve + Vo + Vi, total = grr + Vp;
    var sd = function (v) { return Math.sqrt(Math.max(0, v)); };
    var ndc = sd(grr) > 0 ? Math.floor(1.41 * sd(Vp) / sd(grr)) : 0;

    return {
      SS: { part: SSp, op: SSo, inter: SSi, rep: SSe, sumOfParts: SSp + SSo + SSi + SSe },
      MS: { part: MSp, op: MSo, inter: MSi, rep: MSe },
      variance: { part: Vp, operator: Vo, interaction: Vi, repeatability: Ve },
      varGrr: grr, varTotal: total,
      pctContribution: total > 0 ? 100 * grr / total : 0,
      pctStudyVar: total > 0 ? 100 * sd(grr) / sd(total) : 0,
      ndc: ndc
    };
  }

  global.MSALegacyVBA = { compute: compute };
})(typeof window !== 'undefined' ? window : globalThis);
