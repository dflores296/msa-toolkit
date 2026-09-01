/* ============================================================================
 * interval.js - Intervalo de confianza de la razon V_GRR / V_Total.
 *
 * QUE METODO SE USA, Y CUANDO
 *
 * Cruzado (con o sin termino de interaccion): MLS (Modified Large Sample), con
 * la aproximacion de Satterthwaite cuando la cuadratica del MLS no tiene
 * solucion real. Es el metodo publicado por Minitab para los intervalos de
 * razones de varianza, transcrito de sus paginas de metodos y formulas. Vive
 * en mls.js; aqui solo se le da de comer la tabla ANOVA. NO es experimental.
 *
 * Anidado: tambien MLS, transcrito de las paginas propias que Minitab dedica
 * al estudio anidado. Cambia el reparto de indices -el pivote es el cuadrado
 * medio de pieza dentro de operador- y los coeficientes; la maquinaria es la
 * misma. Tampoco es experimental.
 *
 * El GPQ (generalized pivotal quantity, inferencia generalizada de Weerahandi)
 * sigue implementado y accesible con `options.method = 'GPQ'`. Ya no es el
 * metodo de ningun modelo: se conserva como SEGUNDA OPINION INDEPENDIENTE, que
 * es lo que le da valor -es la comparacion contra el GPQ la que caza los
 * errores de transcripcion del MLS, porque su matematica no comparte nada con
 * la de las cuadraticas-. Las pruebas lo usan de juez.
 *
 * Una version anterior de esta cabecera afirmaba que el GPQ era el metodo de
 * Minitab. Era falso y esta retirado. Ver docs/f07-validacion-gpq.md.
 *
 * POR QUE HAY UN INTERVALO
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
 * QUIEN DICTAMINA: la evaluacion puntual AIAG, en anova.js (`assess`). Tener
 * ya el metodo publicado NO reabre la politica de dictaminar por intervalo,
 * que se retiro por dos motivos medidos y ajenos al metodo:
 *
 *   1. La banda condicional [10 %, 30 %] mide 20 pp. Un intervalo mas ancho
 *      que 20 pp no cabe en ella POR GEOMETRIA, con cualquier metodo. Medido:
 *      un 10x3x3 con %GRR real 14.7 % tiene un IC medio de 20.8 pp; un 5x3x2,
 *      27.8 pp.
 *   2. La conclusividad dependia de la distancia del gage al umbral, no de la
 *      calidad del estudio.
 *
 * Ninguno de los dos lo arregla cambiar de metodo. Este archivo aporta el
 * intervalo y, cuando cruza un limite de evaluacion, una advertencia de
 * lectura. No emite categorias.
 *
 * UN SOLO INTERVALO, DOS ESCALAS
 *
 * Se calcula la RAZON  R = V_GRR / V_Total  y de ella salen las dos metricas:
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
 * puede derivar de aqui.
 *
 * LO QUE SIGUE PENDIENTE
 *
 *   1. El cotejo contra una corrida real de Minitab. Todo lo medido hasta hoy
 *      es interno o contra el GPQ; nada se ha comparado con el programa cuyas
 *      formulas se transcribieron. Los tres casos y los valores esperados
 *      estan en docs/f07-cabos-sueltos.md.
 *   2. La constante H*, que Minitab usa sin definir. Afecta solo al limite
 *      INFERIOR del %GRR (ver mls.js).
 *   3. El intervalo de %Tolerance, que necesita su propia referencia: no es
 *      una transformacion de esta razon y no se puede derivar de aqui.
 *
 * El MLS del anidado YA NO esta pendiente: se transcribio y esta en mls.js.
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

  /* ------------------------------------------------------------------------
   * statusLabel(iv) - como se nombra el intervalo en pantalla y en el reporte
   *
   * Vive aqui, y no en cada vista, porque el rotulo es una afirmacion sobre el
   * metodo: si la pantalla dice una cosa y el reporte impreso otra, una de las
   * dos miente. Fue exactamente el fallo que abrio F-07.
   *
   * Corto a proposito. El estandar de diseno dice que no se le explica al
   * lector lo que ya sabe, y a un ingeniero de calidad no hay que desarrollarle
   * las siglas en pantalla: nombra el metodo y dice lo unico que el lector
   * necesita saber para no equivocarse -que no dictamina-.
   *
   * NO NOMBRA A NINGUN PROVEEDOR, y es deliberado por dos razones. La primera
   * es de exactitud: el MLS es de Burdick & Graybill, y un programa comercial
   * es un implementador mas, no la fuente. La segunda es de prudencia: esta
   * aplicacion se publica en una pagina publica, y una marca ajena en una
   * cadena de interfaz insinua un respaldo que nadie ha dado. La procedencia
   * academica viaja en `source` y la transcripcion completa, con las paginas
   * de las que se leyo cada formula, esta en docs/mls-transcripcion.md, que es
   * documentacion interna y ahi la cita si corresponde.
   * ----------------------------------------------------------------------*/
  function statusLabel(iv) {
    if (!iv) return '';
    if (iv.method === 'MLS') {
      return 'Intervalo MLS (Modified Large Sample). No utilizado para el dictamen.';
    }
    if (iv.method === 'Satterthwaite') {
      return 'Intervalo Satterthwaite, la alternativa del MLS. No utilizado para el dictamen.';
    }
    return 'Intervalo GPQ experimental. No utilizado para el dictamen.';
  }

  /** Une la razon con sus dos escalas derivadas. Un solo sitio donde se pasa
      de razon a porcentajes, para que no puedan divergir. */
  function withScales(base, lo, hi) {
    /* El rotulo viaja DENTRO del intervalo. Asi el reporte no tiene que
       depender de este modulo para nombrarlo, y pantalla y papel no pueden
       decir metodos distintos. */
    base.statusLabel  = statusLabel(base);
    base.ratio        = { lo: lo, hi: hi };
    base.contribution = { lo: 100 * lo, hi: 100 * hi };
    base.studyVar     = { lo: 100 * Math.sqrt(lo), hi: 100 * Math.sqrt(hi) };
    return base;
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
  /* --- Puente al MLS -----------------------------------------------------
   * Traduce la tabla ANOVA a la notacion S1..S4 de Minitab y delega en mls.js.
   * Cubre los tres modelos. Devuelve null solo si mls.js no esta cargado, si
   * el modelo no esta en MLS_SOURCES o si falta alguna fila de la tabla; y
   * entonces forResult cae al GPQ.
   * --------------------------------------------------------------------- */
  var MLS_SOURCES = {
    'with-interaction':    [1, 'Parte', 2, 'Operador', 3, 'Operador * Parte', 4, 'Repetibilidad'],
    'without-interaction': [1, 'Parte', 2, 'Operador', 3, 'Repetibilidad'],
    /* En el anidado el orden de Minitab es otro: el operador es S1 y la pieza
       dentro del operador es S2, que ademas pasa a ser el pivote de la
       cuadratica. No es una reetiquetacion cosmetica; mls.js lo trata con su
       propio reparto de papeles. */
    'nested':              [1, 'Operador', 2, 'Pieza (Operador)', 3, 'Repetibilidad']
  };

  function mlsRatio(result, sources, d, conf) {
    var mls = global.MSAMls;
    var map = MLS_SOURCES[result.model];
    if (!mls || !map) return null;
    var byName = {};
    sources.forEach(function (s) { byName[s.name] = s; });
    var ms = {}, df = {};
    for (var i = 0; i < map.length; i += 2) {
      var row = byName[map[i + 1]];
      if (!row) return null;
      ms[map[i]] = row.ms;
      df[map[i]] = row.df;
    }
    /* I son las piezas, J los operadores, K las replicas: la notacion de
       Minitab. `d.p` ya trae las piezas que corresponden a cada modelo -las
       compartidas en el cruzado, las de cada operador en el anidado-, que es
       justo lo que la formula del anidado llama I. */
    return mls.gageTotal(ms, df, { I: d.p, J: d.o, K: d.r },
                         { conf: conf, model: result.model === 'nested' ? 'nested' : 'crossed' });
  }

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

    /* Metodo publicado primero, para los tres modelos. El GPQ solo sale si se
       pide a proposito con options.method = 'GPQ', o si el MLS no puede
       calcularse; no es la ruta de ningun modelo. */
    if (options.method !== 'GPQ') {
      var m = mlsRatio(result, sources, d, conf);
      if (m) return withScales({
        method: m.method,               // 'MLS' o 'Satterthwaite'
        experimental: false,
        source: 'Burdick & Graybill (1992); Burdick, Borror & Montgomery (2005)',
        hStar: m.hStar,
        withInteraction: m.withInteraction,
        conf: conf
      }, m.lo, m.hi);
    }

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

    /* Las dos metricas salen de ESTE intervalo, no de dos calculos distintos.
       La raiz es monotona creciente, asi que conserva el orden de los limites
       y no hace falta reordenarlos. */
    return withScales({
      method: 'GPQ',
      experimental: true,
      conf: conf,
      draws: ratios.length
    }, lo, hi);
  }

  /* ------------------------------------------------------------------------
   * crossings(iv, thresholds) - que limites de evaluacion cruza el intervalo
   *
   * NO clasifica. No devuelve "Aceptable", "Marginal", "Inaceptable" ni "No
   * concluyente": esa politica esta retirada (ver cabecera). Devuelve los
   * limites que el intervalo cruza y una frase que dice QUE SIGNIFICA cruzarlos
   * -que el estudio no separa dos zonas de evaluacion-, que es un hecho sobre
   * la resolucion del estudio, no una categoria.
   *
   * `conf` solo entra en el texto, para poder nombrar el nivel ("IC 95 %").
   * Es opcional: sin el, la frase dice "intervalo de confianza" y sigue siendo
   * correcta.
   *
   * Devuelve null si no cruza ninguno.
   * ----------------------------------------------------------------------*/
  function crossings(iv, thresholds, conf) {
    if (!iv || iv.lo === null || iv.hi === null) return null;
    var t = thresholds || { good: 10, bad: 30 };
    var cruza = [];
    if (iv.lo < t.good && iv.hi > t.good) cruza.push(t.good);
    if (iv.lo < t.bad && iv.hi > t.bad) cruza.push(t.bad);
    if (!cruza.length) return null;

    /* El mensaje dice QUE SIGNIFICA el cruce, no que hay que tener cuidado.
       "Interpreta con precaucion" obligaba al lector a deducir el resto: que
       zonas estan en juego y por que. Estas son las tres unicas formas que
       puede tomar, porque solo hay dos limites que cruzar. */
    var zonas = cruza.length > 1
      ? 'entre aceptable, condicional y no aceptable'
      : (cruza[0] === t.good ? 'entre aceptable y condicional'
                             : 'entre condicional y no aceptable');
    var nivel = conf ? 'IC ' + Math.round(100 * conf) + ' %' : 'intervalo de confianza';
    var limites = cruza.map(function (x) { return x + ' %'; }).join(' y ');

    return {
      crosses: cruza,
      label: 'El resultado no distingue completamente ' + zonas + ', porque el ' +
             nivel + ' cruza ' + (cruza.length > 1 ? 'los limites de ' : 'el limite de ') +
             limites + '.'
    };
  }

  global.MSAInterval = {
    forResult: forResult, crossings: crossings, statusLabel: statusLabel,
    DRAWS: DRAWS, DEFAULT_CONF: DEFAULT_CONF, CONF_LEVELS: CONF_LEVELS,
    _rng: rng, _chi2: chi2, _percentile: percentile, _seedFrom: seedFrom
  };
})(typeof window !== 'undefined' ? window : globalThis);
