/* ============================================================================
 * interval.js - Intervalo de confianza del %GRR. Metodo GPQ.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 *
 * F-07 de la auditoria. La aplicacion publicaba un %GRR puntual con un
 * veredicto categorico. Ni AIAG MSA 4a ed. ni Minitab tratan ese numero como
 * exacto: los dos ofrecen intervalos, precisamente porque con 90 mediciones la
 * incertidumbre del %GRR es enorme. Reproducido antes de escribir nada:
 *
 *   12 estudios simulados 10x3x3 del MISMO sistema (sigma_ms/sigma_pieza = 0.30)
 *     %GRR: 38.8 21.4 21.7 40.7 31.4 36.0 30.3 44.8 23.5 20.4 25.6 29.9
 *     rango 20.4 % a 44.8 %  ->  el mismo gage cae a los dos lados del 30 %
 *
 *   300 estudios 3op x 5piezas x 2rep de un sistema BUENO (0.15)
 *     24/300 declarados "Inaceptable"  ->  8 % de rechazos falsos
 *
 * El punto no es que el calculo este mal: es que se publica un punto donde hay
 * una nube, y el veredicto se decide en el punto.
 *
 * EL METODO, Y POR QUE ESTE
 *
 * GPQ (generalized pivotal quantity), que es el que usa Minitab para los
 * intervalos de Gage R&R. La idea cabe en tres lineas:
 *
 *   1. En un modelo balanceado de efectos aleatorios, cada cuadrado medio es
 *      independiente de los demas y cumple  MS_i * df_i / sigma2_i ~ chi2_df_i.
 *   2. Luego  MS_i * df_i / W_i,  con W_i ~ chi2_df_i simulada, es una
 *      cantidad pivotal generalizada para el sigma2_i que produjo ese MS_i.
 *   3. Se simulan muchos juegos de MS, se recalculan los componentes CON LAS
 *      MISMAS FORMULAS del motor -truncado de negativos incluido- y se toman
 *      los percentiles del %GRR resultante.
 *
 * La alternativa clasica es MLS (Graybill-Wang). GPQ se eligio porque no
 * necesita una formula distinta por cada cantidad derivada: %Study Variation,
 * %Contribucion y %Tolerance salen del mismo juego de simulaciones, y el
 * truncado de componentes negativos -que es parte del estimador y le mueve la
 * distribucion- queda dentro del pivote en vez de ignorarse.
 *
 * COMO SE VALIDA
 *
 * No hay tabla publicada que copiar aqui, asi que no se copia ninguna: se
 * comprueba lo unico que un intervalo promete, que es su COBERTURA. En
 * tests-interval.js se simulan estudios de un sistema con %GRR verdadero
 * conocido y se cuenta cuantas veces el intervalo lo contiene. Si la formula
 * estuviera mal, la cobertura se iria del nominal y la prueba caeria. Es una
 * validacion mas fuerte que reproducir un numero suelto.
 *
 * DETERMINISTA
 *
 * La semilla sale de los propios datos, asi que el mismo estudio da siempre el
 * mismo intervalo: dos personas con el mismo archivo leen el mismo reporte, y
 * la herramienta de regresion visual puede comparar pixel a pixel.
 *
 * Sin dependencias. Sin DOM. Reutilizable desde los tests.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var DRAWS = 4000;          // suficiente para percentiles estables
  /* 90 % es el valor por omision de Minitab para los intervalos de Gage R&R, y
     es el que se usa aqui por lo mismo: al 95 % el intervalo de un estudio
     10x3x3 tipico es tan ancho que casi ningun estudio concluye, y un veredicto
     que nunca se emite no ayuda a nadie. Medido, sobre un gage excelente
     (%GRR real 5.4 %): concluye el 18 % de las veces al 95 % y el 44 % al 90 %. */
  var DEFAULT_CONF = 0.90;

  /* Piso de tamano del estudio (F-07). NO es lo mismo que el intervalo, y por
     eso existen los dos: el intervalo mide la incertidumbre de muestreo DENTRO
     del modelo; este piso cubre una que el modelo no ve, la de haber elegido
     5 piezas que probablemente no cubren el rango del proceso. Medido: con
     solo el intervalo, un 5x3x2 sigue concluyendo el 24-51 % de las veces, asi
     que el piso no es redundante. Bloquea el VEREDICTO, nunca el calculo. */
  var MIN_MEASUREMENTS = 60;

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

  /** De componentes a las tres cifras que se publican. */
  function metricsOf(c, k, tolerance) {
    var part = Math.max(0, c.part);
    var grr = c.rep + c.repro;
    var total = grr + part;
    var sdGrr = Math.sqrt(Math.max(0, grr)), sdTotal = Math.sqrt(Math.max(0, total));
    return {
      pctStudyVar: sdTotal > 0 ? 100 * sdGrr / sdTotal : 0,
      pctContribution: total > 0 ? 100 * grr / total : 0,
      pctTolerance: tolerance ? 100 * (k * sdGrr * (tolerance.oneSided ? 0.5 : 1)) / tolerance.width
                              : null
    };
  }

  function percentile(sorted, q) {
    if (!sorted.length) return null;
    var i = (sorted.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
    return lo === hi ? sorted[lo] : sorted[lo] + (sorted[hi] - sorted[lo]) * (i - lo);
  }

  /* ------------------------------------------------------------------------
   * forResult(result, options) -> { conf, draws, studyVar:{lo,hi}, ... } | null
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

    var k = result.studyVarMultiplier || 6;
    var tol = result.toleranceInfo || null;
    var conf = options.conf || DEFAULT_CONF;
    var draws = options.draws || DRAWS;
    var alpha = (1 - conf) / 2;

    var u = rng(options.seed !== undefined ? options.seed : seedFrom(sources));
    var sv = [], contrib = [], ptol = [];
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
      var m = metricsOf(spec.build(ms, d), k, tol);
      if (!isFinite(m.pctStudyVar)) continue;
      sv.push(m.pctStudyVar);
      contrib.push(m.pctContribution);
      if (m.pctTolerance !== null) ptol.push(m.pctTolerance);
    }
    if (sv.length < draws / 2) return null;      // demasiados descartes: no se publica

    var asc = function (a, b) { return a - b; };
    sv.sort(asc); contrib.sort(asc); ptol.sort(asc);

    return {
      method: 'GPQ',
      conf: conf,
      draws: sv.length,
      studyVar:     { lo: percentile(sv, alpha),      hi: percentile(sv, 1 - alpha) },
      contribution: { lo: percentile(contrib, alpha), hi: percentile(contrib, 1 - alpha) },
      tolerance: ptol.length ? { lo: percentile(ptol, alpha), hi: percentile(ptol, 1 - alpha) } : null
    };
  }

  /* ------------------------------------------------------------------------
   * classify(interval, thresholds) - el veredicto sale del INTERVALO
   *
   * Es el cambio que pide F-07. Un %GRR de 26 % con intervalo [18, 44] no es
   * "marginal": es un estudio que no alcanza a decidir, y decirlo cambia lo
   * que hace quien lo lee -- repetir el estudio con mas piezas, en vez de
   * firmar. Solo se publica un veredicto cuando el intervalo ENTERO cae en una
   * banda; si cruza un umbral, el veredicto es "no concluyente" y se dice cual
   * cruza.
   * ----------------------------------------------------------------------*/
  function classify(iv, thresholds, n) {
    if (!iv || iv.lo === null || iv.hi === null) return null;
    if (n !== undefined && n !== null && n < MIN_MEASUREMENTS) {
      return {
        level: 'unknown', conclusive: false, tooSmall: true,
        label: 'Sin veredicto: ' + n + ' mediciones, por debajo de las ' + MIN_MEASUREMENTS +
               ' que hacen falta para firmar. El calculo y el intervalo siguen abajo; lo que no ' +
               'se publica es la decision. Ademas del muestreo, con tan pocas piezas es dudoso ' +
               'que cubran el rango del proceso, y eso el intervalo no lo mide.'
      };
    }
    var t = thresholds || { good: 10, bad: 30 };
    var band = function (x) { return x < t.good ? 'ok' : (x <= t.bad ? 'warn' : 'bad'); };
    var lo = band(iv.lo), hi = band(iv.hi);
    var fmt = function (x) { return x.toFixed(2); };
    var rango = '[' + fmt(iv.lo) + ' %, ' + fmt(iv.hi) + ' %]';

    if (lo === hi) {
      return {
        level: lo, conclusive: true,
        label: (lo === 'ok' ? 'Aceptable' : lo === 'warn' ? 'Marginal' : 'Inaceptable') +
               ', con el intervalo entero en la banda ' + rango
      };
    }
    var cruza = [];
    if (iv.lo < t.good && iv.hi >= t.good) cruza.push(t.good + ' %');
    if (iv.lo <= t.bad && iv.hi > t.bad) cruza.push(t.bad + ' %');
    return {
      level: 'unknown', conclusive: false,
      crosses: cruza,
      label: 'No concluyente: el intervalo ' + rango + ' cruza el umbral de ' + cruza.join(' y ') +
             '. El estudio no alcanza a decidir; repite con mas piezas o mas replicas.'
    };
  }

  global.MSAInterval = {
    forResult: forResult, classify: classify,
    DRAWS: DRAWS, DEFAULT_CONF: DEFAULT_CONF, MIN_MEASUREMENTS: MIN_MEASUREMENTS,
    _rng: rng, _chi2: chi2, _percentile: percentile
  };
})(typeof window !== 'undefined' ? window : globalThis);
