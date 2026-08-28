/* ============================================================================
 * stats.js — utilidades estadísticas mínimas (sin dependencias)
 * Distribución F: función de supervivencia p = P(F_{d1,d2} > f)
 * vía la función beta incompleta regularizada (Numerical Recipes, betacf).
 * ==========================================================================*/
(function (global) {
  'use strict';

  function logGamma(x) {
    // Lanczos g=7, n=9
    var g = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
             771.32342877765313, -176.61502916214059, 12.507343278686905,
             -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
    if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
    x -= 1;
    var a = g[0], t = x + 7.5;
    for (var i = 1; i < 9; i++) a += g[i] / (x + i);
    return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
  }

  function betacf(a, b, x) {
    var MAXIT = 300, EPS = 3e-16, FPMIN = 1e-300;
    var qab = a + b, qap = a + 1, qam = a - 1;
    var c = 1, d = 1 - qab * x / qap;
    if (Math.abs(d) < FPMIN) d = FPMIN;
    d = 1 / d;
    var h = d;
    for (var m = 1; m <= MAXIT; m++) {
      var m2 = 2 * m;
      var aa = m * (b - m) * x / ((qam + m2) * (a + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d; h *= d * c;
      aa = -(a + m) * (qab + m) * x / ((a + m2) * (qap + m2));
      d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
      c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
      d = 1 / d;
      var del = d * c; h *= del;
      if (Math.abs(del - 1) < EPS) break;
    }
    return h;
  }

  function betai(a, b, x) {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    var bt = Math.exp(logGamma(a + b) - logGamma(a) - logGamma(b) +
                      a * Math.log(x) + b * Math.log(1 - x));
    if (x < (a + 1) / (a + b + 2)) return bt * betacf(a, b, x) / a;
    return 1 - bt * betacf(b, a, 1 - x) / b;
  }

  /** p-valor de cola superior para F con d1 (num) y d2 (den) grados de libertad. */
  function fSurvival(f, d1, d2) {
    if (!isFinite(f)) return 0;
    if (f <= 0 || d1 <= 0 || d2 <= 0) return 1;
    return betai(d2 / 2, d1 / 2, d2 / (d2 + d1 * f));
  }

  /* --------------------------------------------------------------------- *
   * Cuartiles y resumen de caja (para el diagrama de caja por operador)
   * --------------------------------------------------------------------- */

  /** Cuantil por interpolacion lineal sobre la posicion (n+1)p, la convencion
      que usa Minitab para sus cuartiles y sus diagramas de caja. */
  function quantile(sorted, p) {
    var n = sorted.length;
    if (!n) return NaN;
    if (n === 1) return sorted[0];
    var pos = p * (n + 1);
    if (pos <= 1) return sorted[0];
    if (pos >= n) return sorted[n - 1];
    var lo = Math.floor(pos), frac = pos - lo;
    return sorted[lo - 1] + frac * (sorted[lo] - sorted[lo - 1]);
  }

  /** Resumen de caja al estilo Minitab: caja Q1-Q3, mediana, media, bigotes
      hasta el dato mas lejano dentro de 1.5 RIC y los demas como atipicos. */
  function boxStats(values) {
    var v = values.filter(function (x) { return isFinite(x); }).slice().sort(function (a, b) { return a - b; });
    if (!v.length) return null;
    var q1 = quantile(v, 0.25), med = quantile(v, 0.5), q3 = quantile(v, 0.75);
    var iqr = q3 - q1, loFence = q1 - 1.5 * iqr, hiFence = q3 + 1.5 * iqr;
    var inliers = v.filter(function (x) { return x >= loFence && x <= hiFence; });
    var sum = 0;
    v.forEach(function (x) { sum += x; });
    return {
      n: v.length, min: v[0], max: v[v.length - 1],
      q1: q1, median: med, q3: q3, iqr: iqr, mean: sum / v.length,
      whiskerLow: inliers.length ? inliers[0] : v[0],
      whiskerHigh: inliers.length ? inliers[inliers.length - 1] : v[v.length - 1],
      outliers: v.filter(function (x) { return x < loFence || x > hiFence; })
    };
  }

  global.MSAStats = { fSurvival: fSurvival, logGamma: logGamma, betai: betai,
                      quantile: quantile, boxStats: boxStats };
})(typeof window !== 'undefined' ? window : globalThis);
