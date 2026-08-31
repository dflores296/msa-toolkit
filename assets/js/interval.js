/* ============================================================================
 * interval.js - Intervalo de confianza de la razon V_GRR / V_Total.
 *
 * ESTADO: IMPLEMENTACION EXPERIMENTAL. NO DICTAMINA.
 *
 * QUE ES ESTE ARCHIVO Y QUE NO ES
 *
 * Implementa un intervalo por GPQ (generalized pivotal quantity). El GPQ es un
 * metodo estadistico publicado -inferencia generalizada, Weerahandi- y es una
 * implementacion EXPERIMENTAL DE ESTA APLICACION.
 *
 * NO es "el metodo de Minitab". Minitab documenta, para los intervalos de
 * razones de varianza, el metodo MLS (Modified Large Sample) como metodo
 * principal, y utiliza Satterthwaite u otra aproximacion publicada cuando no
 * se cumplen las condiciones del metodo principal. Este archivo no implementa
 * ninguno de los dos. Una version anterior de este comentario afirmaba que el
 * GPQ era el metodo de Minitab y que el 90 % era su nivel por omision: las dos
 * afirmaciones eran falsas y estan retiradas. Ver docs/f07-validacion-gpq.md.
 *
 * POR QUE SIGUE EXISTIENDO UN INTERVALO
 *
 * Porque el %GRR puntual de un estudio de 90 mediciones tiene una
 * incertidumbre grande y publicarlo solo invita a leerlo como exacto:
 *
 *   12 estudios simulados 10x3x3 del MISMO sistema (sigma_ms/sigma_pieza = 0.30)
 *     %GRR: 38.8 21.4 21.7 40.7 31.4 36.0 30.3 44.8 23.5 20.4 25.6 29.9
 *     rango 20.4 % a 44.8 %  ->  el mismo gage a los dos lados del 30 %
 *
 * El intervalo se muestra para que esa nube se vea. Lo que NO hace es decidir.
 *
 * QUE CAMBIO, Y POR QUE
 *
 * Hasta F-07 este archivo clasificaba: si el intervalo entero caia en una
 * banda emitia "Aceptable", "Marginal" o "Inaceptable", y si cruzaba un umbral
 * emitia "No concluyente". Esa politica esta RETIRADA por dos motivos medidos:
 *
 *   1. La banda condicional [10 %, 30 %] mide 20 pp. Un intervalo mas ancho
 *      que 20 pp no cabe en ella POR GEOMETRIA, con cualquier dato. Medido: un
 *      10x3x3 con %GRR real 14.7 % tiene un IC medio de 20.8 pp y concluia el
 *      10 % de las veces; un 5x3x2, 27.8 pp, y concluia el 0 %. La etiqueta
 *      condicional era inalcanzable en los disenos que AIAG recomienda.
 *   2. La conclusividad dependia de la distancia del gage al umbral, no de la
 *      calidad del estudio. Medido a %GRR real 28.5 % (1.5 pp del umbral de
 *      30 %), tres disenos muy distintos concluian igual de poco: 5x3x2 el
 *      7 %, 10x3x3 el 8 %, 25x4x4 el 9 %. El mismo 25x4x4 concluia el 82 % a
 *      %GRR 5.4 %. La regla premiaba la suerte del gage, no el rigor.
 *
 * Ademas, la razon que ese veredicto usaba no esta validada contra ninguna
 * referencia externa. Un metodo sin validar no dictamina.
 *
 * QUIEN DICTAMINA AHORA: la evaluacion puntual AIAG, en anova.js (`assess`).
 * Este archivo solo aporta un intervalo informativo y, cuando cruza un limite
 * de evaluacion, una advertencia de lectura. No emite categorias.
 *
 * UN SOLO INTERVALO, DOS ESCALAS
 *
 * Se simula la RAZON  R = V_GRR / V_Total  y de ella salen las dos metricas:
 *
 *     %Contribution   = 100 * R
 *     %StudyVariation = 100 * sqrt(R)
 *
 * No son dos pruebas independientes: son la misma razon en dos escalas, y por
 * eso se derivan del mismo intervalo. Calcularlas por separado permitia que se
 * contradijeran, que es exactamente lo que pasaba antes.
 *
 * %Tolerance NO tiene intervalo. Su denominador es la tolerancia de
 * especificacion, no V_Total, asi que no es una transformacion de R y no se
 * puede derivar de aqui. Queda su resultado puntual, y el intervalo pendiente
 * de referencia validada.
 *
 * LO QUE FALTA PARA QUE ESTO DICTAMINE
 *
 * Implementar MLS como metodo principal y Satterthwaite como alternativa,
 * siguiendo las formulas publicadas para el modelo correspondiente, y validar
 * contra ellas. Mientras tanto este intervalo se rotula como experimental en
 * pantalla y en el reporte, y no participa del dictamen ni sirve de respaldo
 * silencioso de nada.
 *
 * Sin dependencias. Sin DOM. Reutilizable desde los tests.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var DRAWS = 4000;

  /* 95 % es el valor por omision. Es el nivel convencional para intervalos de
     confianza y el que la documentacion de Minitab describe como el que
     normalmente funciona bien; no se elige por cuantas veces deja concluir,
     que no es un criterio estadistico. */
  var DEFAULT_CONF = 0.95;
  var CONF_LEVELS = [0.90, 0.95, 0.99];

  /* --- Aleatoriedad reproducible ---------------------------------------- */

  /** mulberry32: PRNG de 32 bits, barato y de calidad sobrada para esto. */
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* La semilla sale de los cuadrados medios y sus grados de libertad: mismo
     estudio, mismo intervalo, siempre. Un intervalo que cambiara al recargar
     la pagina seria imposible de citar en un reporte. */
  function seedFrom(sources) {
    var h = 2166136261;
    sources.forEach(function (s) {
      var text = s.df + ':' + s.ms.toPrecision(12);
      for (var i = 0; i < text.length; i++) {
        h ^= text.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
    });
    return h >>> 0;
  }

  function normal(u) {
    var a = u(), b = u();
    if (a < 1e-12) a = 1e-12;
    return Math.sqrt(-2 * Math.log(a)) * Math.cos(2 * Math.PI * b);
  }

  /** Gamma(shape, 1) por Marsaglia-Tsang. shape > 0. */
  function gamma1(u, shape) {
    if (shape < 1) return gamma1(u, shape + 1) * Math.pow(u(), 1 / shape);
    var d = shape - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      var x = normal(u), v = 1 + c * x;
      if (v <= 0) continue;
      v = v * v * v;
      var w = u();
      if (w < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(w) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }

  /** chi2 con k grados de libertad = 2 * Gamma(k/2, 1). */
  function chi2(u, k) { return 2 * gamma1(u, k / 2); }

  /* --- Los tres modelos, cada uno con sus componentes -------------------- */
  /* Las formulas son LAS MISMAS de anova.js y anova-nested.js. No se derivan
     aqui otra vez a mano: se leen de ahi y se copian tal cual, porque dos
     derivaciones del mismo modelo acaban divergiendo. Cada `build` recibe los
     cuadrados medios (reales o simulados) y devuelve los componentes. */
  var MODELS = {
    'with-interaction': {
      sources: ['Parte', 'Operador', 'Operador * Parte', 'Repetibilidad'],
      build: function (ms, d) {
        var part = (ms['Parte'] - ms['Operador * Parte']) / (d.o * d.r);
        var op = (ms['Operador'] - ms['Operador * Parte']) / (d.p * d.r);
        var inter = (ms['Operador * Parte'] - ms['Repetibilidad']) / d.r;
        return { part: part, repro: Math.max(0, op) + Math.max(0, inter),
                 rep: ms['Repetibilidad'] };
      }
    },
    'without-interaction': {
      sources: ['Parte', 'Operador', 'Repetibilidad'],
      build: function (ms, d) {
        var part = (ms['Parte'] - ms['Repetibilidad']) / (d.o * d.r);
        var op = (ms['Operador'] - ms['Repetibilidad']) / (d.p * d.r);
        return { part: part, repro: Math.max(0, op), rep: ms['Repetibilidad'] };
      }
    },
    'nested': {
      sources: ['Operador', 'Pieza (Operador)', 'Repetibilidad'],
      build: function (ms, d) {
        var part = (ms['Pieza (Operador)'] - ms['Repetibilidad']) / d.r;
        var op = (ms['Operador'] - ms['Pieza (Operador)']) / (d.p * d.r);
        return { part: part, repro: Math.max(0, op), rep: ms['Repetibilidad'] };
      }
    }
  };

  /** De componentes a la razon R = V_GRR / V_Total, acotada a [0, 1]. */
  function ratioOf(c) {
    var part = Math.max(0, c.part);
    var grr = Math.max(0, c.rep + c.repro);
    var total = grr + part;
    if (!(total > 0)) return 0;
    var r = grr / total;
    return r < 0 ? 0 : (r > 1 ? 1 : r);
  }

  function percentile(sorted, q) {
    if (!sorted.length) return null;
    var i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  /* ------------------------------------------------------------------------
   * forResult(result, options) -> { conf, draws, ratio, contribution, studyVar }
   *
   * Lee la tabla ANOVA del propio resultado, asi que no hace falta tocar los
   * motores: cualquiera de los dos que publique `anova` y `design` sirve.
   * Devuelve null cuando el modelo no admite el metodo (grados de libertad
   * cero, o un estudio degenerado sin varianza que repartir); ahi la respuesta
   * honesta es no publicar intervalo, no publicar uno inventado.
   * ----------------------------------------------------------------------*/
  function forResult(result, options) {
    options = options || {};
    if (!result || !result.anova || !result.design) return null;
    var spec = MODELS[result.model];
    if (!spec) return null;

    var byName = {};
    result.anova.forEach(function (row) { byName[row.source] = row; });
    var sources = [];
    for (var i = 0; i < spec.sources.length; i++) {
      var row = byName[spec.sources[i]];
      if (!row || !(row.df > 0) || row.ms === null || !isFinite(row.ms)) return null;
      sources.push({ name: spec.sources[i], df: row.df, ms: row.ms });
    }

    var d = {
      o: result.design.operators.length,
      /* En el cruzado `p` son las piezas compartidas; en el anidado, las de
         cada operador. Es el mismo papel en la formula del componente. */
      p: result.model === 'nested' ? result.design.partsPerOperator
                                   : result.design.parts.length,
      r: result.design.replicates
    };
    if (!(d.o > 1) || !(d.p > 1) || !(d.r > 1)) return null;

    var conf = options.conf || DEFAULT_CONF;
    var draws = options.draws || DRAWS;
    var alpha = (1 - conf) / 2;

    var u = rng(options.seed !== undefined ? options.seed : seedFrom(sources));
    var ratios = [];
    var ms = {};
    for (var b = 0; b < draws; b++) {
      var ok = true;
      for (var j = 0; j < sources.length; j++) {
        var s = sources[j], w = chi2(u, s.df);
        if (!(w > 0) || !isFinite(w)) { ok = false; break; }
        /* La cantidad pivotal: MS observado * df / chi2 simulada. */
        ms[s.name] = s.ms * s.df / w;
      }
      if (!ok) continue;
      var r = ratioOf(spec.build(ms, d));
      if (!isFinite(r)) continue;
      ratios.push(r);
    }
    if (ratios.length < draws / 2) return null;      // demasiados descartes

    ratios.sort(function (a, b2) { return a - b2; });
    var lo = percentile(ratios, alpha), hi = percentile(ratios, 1 - alpha);

    /* Las dos metricas salen de ESTE intervalo, no de dos simulaciones
       distintas. La raiz es monotona creciente, asi que conserva el orden de
       los limites y no hace falta reordenarlos. */
    return {
      method: 'GPQ',
      experimental: true,
      conf: conf,
      draws: ratios.length,
      ratio:        { lo: lo, hi: hi },
      contribution: { lo: 100 * lo, hi: 100 * hi },
      studyVar:     { lo: 100 * Math.sqrt(lo), hi: 100 * Math.sqrt(hi) }
    };
  }

  /* ------------------------------------------------------------------------
   * crossings(iv, thresholds) - que limites de evaluacion cruza el intervalo
   *
   * NO clasifica. No devuelve "Aceptable", "Marginal", "Inaceptable" ni "No
   * concluyente": esa politica esta retirada (ver cabecera). Devuelve solo los
   * limites que el intervalo cruza, para poder advertir al lector de que la
   * clasificacion puntual cae cerca de una frontera.
   *
   * Devuelve null si no cruza ninguno.
   * ----------------------------------------------------------------------*/
  function crossings(iv, thresholds) {
    if (!iv || iv.lo === null || iv.hi === null) return null;
    var t = thresholds || { good: 10, bad: 30 };
    var cruza = [];
    if (iv.lo < t.good && iv.hi > t.good) cruza.push(t.good);
    if (iv.lo < t.bad && iv.hi > t.bad) cruza.push(t.bad);
    if (!cruza.length) return null;
    return {
      crosses: cruza,
      label: 'El intervalo de confianza cruza ' +
             (cruza.length > 1 ? 'los limites de evaluacion de ' : 'el limite de evaluacion de ') +
             cruza.map(function (x) { return x + ' %'; }).join(' y ') +
             '. Interpreta la clasificacion puntual con precaucion.'
    };
  }

  global.MSAInterval = {
    forResult: forResult, crossings: crossings,
    DRAWS: DRAWS, DEFAULT_CONF: DEFAULT_CONF, CONF_LEVELS: CONF_LEVELS,
    _rng: rng, _chi2: chi2, _percentile: percentile, _seedFrom: seedFrom
  };
})(typeof window !== 'undefined' ? window : globalThis);
