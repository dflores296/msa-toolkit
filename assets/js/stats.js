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

  /* --------------------------------------------------------------------- *
   * Normal estandar y proporciones (para el metodo de atributos)
   * --------------------------------------------------------------------- */

  /** erfc por fraccion continua de Chebyshev (Numerical Recipes, erfcc).
      Error relativo < 1.2e-7, de sobra para un valor p reportado a 4 cifras. */
  function erfc(x) {
    var z = Math.abs(x), t = 2 / (2 + z);
    var ty = 4 * t - 2;
    var cof = [-1.3026537197817094, 6.4196979235649026e-1, 1.9476473204185836e-2,
               -9.561514786808631e-3, -9.46595344482036e-4, 3.66839497852761e-4,
               4.2523324806907e-5, -2.0278578112534e-5, -1.624290004647e-6,
               1.303655835580e-6, 1.5626441722e-8, -8.5238095915e-8,
               6.529054439e-9, 5.059343495e-9, -9.91364156e-10];
    var d = 0, dd = 0, tmp;
    for (var j = cof.length - 1; j > 0; j--) { tmp = d; d = ty * d - dd + cof[j]; dd = tmp; }
    var ans = t * Math.exp(-z * z + 0.5 * (cof[0] + ty * d) - dd);
    return x >= 0 ? ans : 2 - ans;
  }

  /** Valor p a dos colas de un estadistico z normal estandar. */
  function normalTwoSided(z) {
    if (!isFinite(z)) return NaN;
    return erfc(Math.abs(z) / Math.SQRT2);
  }

  /** Inversa de la beta incompleta regularizada: x tal que betai(a,b,x) = p.
      Biseccion sobre una funcion monotona creciente; 200 pasos dejan el
      intervalo en 2^-200, mucho mas fino que la precision de betai. */
  function betaInv(a, b, p) {
    if (p <= 0) return 0;
    if (p >= 1) return 1;
    var lo = 0, hi = 1, mid;
    for (var i = 0; i < 200; i++) {
      mid = 0.5 * (lo + hi);
      if (betai(a, b, mid) < p) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  /* --------------------------------------------------------------------- *
   * Cuantiles de chi-cuadrada y de F
   *
   * Los necesita el metodo MLS (mls.js) para sus constantes G y H. La
   * convencion es la de Minitab y la usual: chi2Inv(p, k) devuelve el
   * PERCENTIL p*100, es decir el valor x con P(X <= x) = p.
   * --------------------------------------------------------------------- */

  /** P(a, x): gamma incompleta regularizada inferior. Serie cuando x < a+1,
      fraccion continua para la cola en el resto; es el corte habitual porque
      cada una converge rapido justo donde la otra no. */
  function gammaP(a, x) {
    if (x <= 0) return 0;
    if (x < a + 1) {
      var ap = a, sum = 1 / a, del = sum;
      for (var n = 0; n < 500; n++) {
        ap++; del *= x / ap; sum += del;
        if (Math.abs(del) < Math.abs(sum) * 1e-15) break;
      }
      return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
    }
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
    return 1 - Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
  }

  function chi2CDF(x, k) { return gammaP(k / 2, x / 2); }

  /** Percentil p*100 de la chi-cuadrada con k grados de libertad. Biseccion
      sobre una CDF monotona: lenta de sobra para lo que se usa aqui (unas
      pocas llamadas por intervalo) y sin los casos de borde de una serie
      asintotica. */
  function chi2Inv(p, k) {
    if (!(k > 0)) return NaN;
    if (p <= 0) return 0;
    if (p >= 1) return Infinity;
    var lo = 0, hi = Math.max(10 * k, 100);
    while (chi2CDF(hi, k) < p && hi < 1e12) hi *= 2;
    for (var i = 0; i < 200; i++) {
      var mid = 0.5 * (lo + hi);
      if (chi2CDF(mid, k) < p) lo = mid; else hi = mid;
    }
    return 0.5 * (lo + hi);
  }

  /** Percentil p*100 de la F con d1 y d2 grados de libertad. Se invierte la
      relacion  P(F <= f) = betai(d1/2, d2/2, d1*f / (d1*f + d2)). */
  function fInv(p, d1, d2) {
    if (!(d1 > 0) || !(d2 > 0)) return NaN;
    if (p <= 0) return 0;
    if (p >= 1) return Infinity;
    var x = betaInv(d1 / 2, d2 / 2, p);
    if (x >= 1) return Infinity;
    return (d2 * x) / (d1 * (1 - x));
  }

  /** Intervalo de confianza exacto de Clopper-Pearson para una proporcion.
      Exacto en el sentido de que su cobertura nunca baja de 1 - alfa; es el
      que reporta Minitab en el analisis de concordancia por atributos. Se
      construye invirtiendo la binomial, que en forma cerrada es la beta:
        inferior = BetaInv(alfa/2;  x,     n - x + 1)
        superior = BetaInv(1-alfa/2; x + 1, n - x)
      con los extremos x = 0 y x = n resueltos aparte, donde esa beta no
      existe y el limite correspondiente es exactamente 0 o 1. */
  function proportionCI(x, n, alpha) {
    if (!(n > 0) || x < 0 || x > n) return { lo: NaN, hi: NaN };
    var a = alpha === undefined ? 0.05 : alpha;
    return {
      lo: x === 0 ? 0 : betaInv(x, n - x + 1, a / 2),
      hi: x === n ? 1 : betaInv(x + 1, n - x, 1 - a / 2)
    };
  }

  /** P(X <= k) para X ~ Binomial(n, p). Se usa en las pruebas para comprobar
      que el intervalo de Clopper-Pearson cumple su definicion. */
  function binomialCDF(k, n, p) {
    if (k < 0) return 0;
    if (k >= n) return 1;
    return betai(n - k, k + 1, 1 - p);
  }

  global.MSAStats = { fSurvival: fSurvival, logGamma: logGamma, betai: betai,
                      quantile: quantile, boxStats: boxStats,
                      erfc: erfc, normalTwoSided: normalTwoSided, betaInv: betaInv,
                      gammaP: gammaP, chi2CDF: chi2CDF, chi2Inv: chi2Inv, fInv: fInv,
                      proportionCI: proportionCI, binomialCDF: binomialCDF };
})(typeof window !== 'undefined' ? window : globalThis);
