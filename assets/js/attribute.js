/* ============================================================================
 * attribute.js - Motor de Attribute Agreement Analysis (concordancia por
 * atributos).
 *
 * QUE ES Y EN QUE SE DIFERENCIA DE LOS OTROS DOS
 *
 * En el cruzado y en el anidado la medicion es un numero y se descompone su
 * VARIANZA. Aqui la medicion es una categoria -pasa / no pasa, o una escala de
 * clases- y no hay varianza que repartir: lo que se mide es ACUERDO. Por eso
 * este motor no publica componentes, ni %GRR, ni NDC, ni ICC. No es que falten:
 * no existen en este diseno.
 *
 * Se calculan cuatro concordancias, que son las que reporta Minitab:
 *
 *   Dentro del evaluador   - un evaluador se repite a si mismo en las r
 *                            replicas. Es la repetibilidad del atributo.
 *   Evaluador vs estandar  - ademas de repetirse, acierta al valor verdadero
 *                            de la pieza en TODAS sus replicas.
 *   Entre evaluadores      - todos los evaluadores coinciden entre si, en
 *                            todas sus replicas. Es la reproducibilidad.
 *   Todos vs estandar      - todos coinciden y ademas aciertan.
 *
 * En las cuatro, la unidad es la PIEZA y el criterio es "todas las decisiones
 * coinciden". Una pieza con 2 aciertos y 1 fallo no cuenta como 2/3: cuenta
 * como pieza no concordante. Es deliberadamente severo, y es la convencion de
 * AIAG y de Minitab: en inspeccion, dudar es fallar.
 *
 * Cada porcentaje lleva intervalo exacto de Clopper-Pearson, porque con 30 o
 * 50 piezas la incertidumbre es grande y un 90 % pelon engana.
 *
 * KAPPA
 *
 * El porcentaje de acuerdo solo no basta: si el 95 % del lote es bueno, un
 * inspector que diga "pasa" siempre acierta el 95 % sin mirar. Kappa descuenta
 * el acuerdo que se explica por puro azar.
 *
 *   Entre evaluadores  -> kappa de Fleiss (varios evaluadores por pieza).
 *   Contra el estandar -> kappa de Cohen sobre los pares (decision, verdad).
 *
 * Se publica un kappa por categoria y uno global, con su error estandar bajo
 * la hipotesis nula, su z y su valor p.
 *
 * EFECTIVIDAD, ERROR DE FUGA Y FALSA ALARMA
 *
 * Solo cuando hay estandar y la escala es binaria. Son las tres cifras con las
 * que una planta decide, y no son simetricas: dejar pasar un defecto (fuga) le
 * cuesta al cliente; rechazar una pieza buena (falsa alarma) le cuesta a la
 * planta. Por eso AIAG les pone umbrales distintos.
 *
 * Sin dependencias. Sin DOM. Determinista. Reutilizable desde los tests.
 * ==========================================================================*/
(function (global) {
  'use strict';

  /* Mismo separador que los otros dos motores: un caracter que no puede
     aparecer en un nombre escrito por el usuario. Con un espacio, "A B" + "C"
     y "A" + "B C" darian la misma clave. */
  var SEP = '\u0000';

  /* Umbrales AIAG MSA 4a ed. para estudios por atributos. Los de kappa son la
     referencia habitual (mas de 0.75 buen acuerdo, menos de 0.40 pobre); los
     de efectividad, fuga y falsa alarma vienen de la tabla de criterios de
     aceptacion del manual. Las tres no comparten umbral a proposito. */
  var LIMITS = {
    kappa:      { ok: 0.75, warn: 0.40 },
    agreement:  { ok: 90,   warn: 80 },
    effective:  { ok: 90,   warn: 80 },
    miss:       { ok: 2,    warn: 5 },
    falseAlarm: { ok: 5,    warn: 10 }
  };

  function level(value, lim, lowerIsBetter) {
    if (value === null || !isFinite(value)) return null;
    if (lowerIsBetter) {
      if (value <= lim.ok) return 'ok';
      return value <= lim.warn ? 'warn' : 'bad';
    }
    if (value >= lim.ok) return 'ok';
    return value >= lim.warn ? 'warn' : 'bad';
  }

  function tag(value, lim, lowerIsBetter, labels) {
    var l = level(value, lim, lowerIsBetter);
    return l === null ? null : { level: l, label: labels[l] };
  }

  var KAPPA_LABELS = { ok: 'Buen acuerdo (mayor que 0.75)',
                       warn: 'Marginal (0.40 a 0.75)',
                       bad: 'Pobre (menor que 0.40)' };
  var PCT_LABELS   = { ok: 'Aceptable (90 % o mas)',
                       warn: 'Marginal (80 a 90 %)',
                       bad: 'Inaceptable (menos de 80 %)' };
  var MISS_LABELS  = { ok: 'Aceptable (2 % o menos)',
                       warn: 'Marginal (2 a 5 %)',
                       bad: 'Inaceptable (mas de 5 %)' };
  var FA_LABELS    = { ok: 'Aceptable (5 % o menos)',
                       warn: 'Marginal (5 a 10 %)',
                       bad: 'Inaceptable (mas de 10 %)' };

  /* ------------------------------------------------------------------------
   * validate(rows, opts) - rows: [{operator, part, replicate, value, standard}]
   *
   * `value` es una CATEGORIA, no un numero: se compara como texto recortado.
   * `standard` es el valor verdadero de la pieza; es opcional, pero si viene
   * para una pieza tiene que venir igual para todas sus filas, porque es una
   * propiedad de la pieza y no de la medicion.
   * ----------------------------------------------------------------------*/
  function validate(rows, opts) {
    var o = opts || {};
    var errors = [], warnings = [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: false, errors: ['No hay datos que analizar.'], warnings: warnings, meta: null };
    }

    var operators = [], parts = [], cats = [];
    var cell = Object.create(null);          // op + SEP + pieza -> [categorias]
    var standardOf = Object.create(null);    // pieza -> categoria
    var stdConflict = [];

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], line = i + 1;
      var op = r.operator === undefined || r.operator === null ? '' : String(r.operator).trim();
      var pt = r.part === undefined || r.part === null ? '' : String(r.part).trim();
      var v  = r.value === undefined || r.value === null ? '' : String(r.value).trim();
      var st = r.standard === undefined || r.standard === null ? '' : String(r.standard).trim();

      if (!op) errors.push('Fila ' + line + ': falta el evaluador.');
      if (!pt) errors.push('Fila ' + line + ': falta la pieza.');
      if (!v)  errors.push('Fila ' + line + ': falta la clasificacion.');
      if (!op || !pt || !v) continue;

      if (operators.indexOf(op) < 0) operators.push(op);
      if (parts.indexOf(pt) < 0) parts.push(pt);
      if (cats.indexOf(v) < 0) cats.push(v);

      var key = op + SEP + pt;
      if (!cell[key]) cell[key] = [];
      cell[key].push(v);

      if (st) {
        if (cats.indexOf(st) < 0) cats.push(st);
        if (standardOf[pt] === undefined) standardOf[pt] = st;
        else if (standardOf[pt] !== st && stdConflict.indexOf(pt) < 0) stdConflict.push(pt);
      }
    }

    if (errors.length) return { ok: false, errors: errors, warnings: warnings, meta: null };

    stdConflict.forEach(function (pt) {
      errors.push('La pieza "' + pt + '" trae dos estandares distintos. El estandar es el valor ' +
                  'verdadero de la pieza: solo puede haber uno.');
    });

    if (operators.length < 1) errors.push('Se necesita al menos un evaluador.');
    if (parts.length < 2) errors.push('Se necesitan al menos 2 piezas.');
    if (cats.length < 2) {
      errors.push('Todas las clasificaciones son "' + cats[0] + '". Sin al menos dos categorias ' +
                  'distintas no hay nada que evaluar: el estudio necesita piezas buenas y malas.');
    }

    /* Balanceado: mismo numero de replicas en cada celda. Igual que en los
       otros dos metodos, un hueco no se rellena a la brava. */
    var reps = null, ragged = [];
    operators.forEach(function (op) {
      parts.forEach(function (pt) {
        var c = cell[op + SEP + pt];
        if (!c) { ragged.push(op + ' / ' + pt + ' (sin datos)'); return; }
        if (reps === null) reps = c.length;
        else if (c.length !== reps) ragged.push(op + ' / ' + pt + ' (' + c.length + ')');
      });
    });
    if (ragged.length) {
      errors.push('El estudio esta desbalanceado. Cada evaluador debe clasificar cada pieza el ' +
                  'mismo numero de veces. Revisa: ' + ragged.slice(0, 5).join(', ') +
                  (ragged.length > 5 ? ' y ' + (ragged.length - 5) + ' mas.' : '.'));
    }
    if (reps !== null && reps < 2) {
      warnings.push('Con una sola replica por pieza no se puede medir si el evaluador se repite a ' +
                    'si mismo: la concordancia dentro del evaluador no se calcula.');
    }

    var stdParts = Object.keys(standardOf);
    var hasStandard = stdParts.length > 0;
    if (hasStandard && stdParts.length !== parts.length) {
      errors.push('Hay estandar para ' + stdParts.length + ' de ' + parts.length + ' piezas. ' +
                  'O lo traen todas o no lo trae ninguna: un estudio a medias mezclaria dos ' +
                  'analisis distintos.');
    }

    if (errors.length) return { ok: false, errors: errors, warnings: warnings, meta: null };

    /* Avisos que no bloquean. */
    if (!hasStandard) {
      warnings.push('Sin estandar solo se mide si los evaluadores coinciden, no si aciertan. ' +
                    'Pueden estar todos de acuerdo y todos equivocados.');
    }
    if (parts.length < 20) {
      warnings.push('El estudio trae ' + parts.length + ' piezas. AIAG sugiere alrededor de 50 ' +
                    'para atributos, porque cada pieza aporta un acierto o un fallo y con pocas ' +
                    'el intervalo de confianza sale muy ancho.');
    }
    if (hasStandard) {
      var counts = {};
      parts.forEach(function (pt) { counts[standardOf[pt]] = (counts[standardOf[pt]] || 0) + 1; });
      var keys = Object.keys(counts), least = Infinity;
      keys.forEach(function (k) { least = Math.min(least, counts[k]); });
      if (keys.length < 2) {
        warnings.push('Todas las piezas del estandar son "' + keys[0] + '". Un inspector que ' +
                      'conteste siempre eso acierta el 100 % sin mirar: el estudio no puede ' +
                      'distinguirlo de uno que si inspecciona.');
      } else if (least / parts.length < 0.2) {
        warnings.push('El lote esta muy desbalanceado (la categoria menos frecuente es ' + least +
                      ' de ' + parts.length + ' piezas). AIAG sugiere una mezcla cercana a mitad ' +
                      'y mitad, con piezas de la zona limite.');
      }
    }
    if (operators.length < 2) {
      warnings.push('Con un solo evaluador no hay concordancia entre evaluadores que medir.');
    }

    /* Orden de categorias: el que pida quien llama, si trae todas las vistas;
       si no, el orden de aparicion, que es estable y no depende del idioma. */
    var categories = cats.slice();
    if (Array.isArray(o.categories) && o.categories.length) {
      var wanted = o.categories.map(function (c) { return String(c).trim(); })
                               .filter(function (c) { return c; });
      var missing = cats.filter(function (c) { return wanted.indexOf(c) < 0; });
      if (!missing.length) categories = wanted.filter(function (c, k) { return wanted.indexOf(c) === k; });
    }

    return {
      ok: true, errors: [], warnings: warnings,
      meta: {
        operators: operators, parts: parts, categories: categories,
        replicates: reps, hasStandard: hasStandard, standardOf: standardOf,
        cell: cell, n: rows.length
      }
    };
  }

  /* ------------------------------------------------------------------------
   * Concordancias. La unidad es la pieza y el criterio es "todo coincide".
   * ----------------------------------------------------------------------*/
  function allEqual(list, target) {
    if (!list.length) return false;
    var ref = target === undefined ? list[0] : target;
    for (var i = 0; i < list.length; i++) if (list[i] !== ref) return false;
    return true;
  }

  function agreement(matched, inspected, alpha) {
    var ci = global.MSAStats.proportionCI(matched, inspected, alpha);
    return {
      inspected: inspected, matched: matched,
      pct: inspected ? 100 * matched / inspected : NaN,
      ciLow: 100 * ci.lo, ciHigh: 100 * ci.hi
    };
  }

  function kappaEntry(kappa, se, category) {
    var z = se > 0 ? kappa / se : null;
    return {
      category: category,
      kappa: kappa, se: se, z: z,
      p: z === null ? null : global.MSAStats.normalTwoSided(z),
      level: level(kappa, LIMITS.kappa, false)
    };
  }

  /* ------------------------------------------------------------------------
   * Kappa de Fleiss: varios evaluadores clasifican cada pieza. Aqui las n
   * calificaciones de una pieza son todas las decisiones tomadas sobre ella
   * (evaluadores x replicas).
   *
   *   p_j  = proporcion global de la categoria j
   *   P_i  = acuerdo observado dentro de la pieza i
   *   k    = (Pbar - Pe) / (1 - Pe)
   * ----------------------------------------------------------------------*/
  function fleiss(ratingsByPart, categories) {
    var N = ratingsByPart.length;
    if (!N) return null;
    var n = ratingsByPart[0].length;
    if (n < 2) return null;

    var k = categories.length, i, j;
    var counts = ratingsByPart.map(function (list) {
      var row = [];
      for (var jj = 0; jj < k; jj++) row.push(0);
      list.forEach(function (v) {
        var idx = categories.indexOf(v);
        if (idx >= 0) row[idx]++;
      });
      return row;
    });

    var p = [];
    for (j = 0; j < k; j++) {
      var s = 0;
      for (i = 0; i < N; i++) s += counts[i][j];
      p.push(s / (N * n));
    }

    var Pbar = 0;
    for (i = 0; i < N; i++) {
      var sq = 0;
      for (j = 0; j < k; j++) sq += counts[i][j] * counts[i][j];
      Pbar += (sq - n) / (n * (n - 1));
    }
    Pbar /= N;

    var Pe = 0, p3 = 0;
    for (j = 0; j < k; j++) { Pe += p[j] * p[j]; p3 += p[j] * p[j] * p[j]; }

    var overall = null;
    if (Pe < 1) {
      var kap = (Pbar - Pe) / (1 - Pe);
      var se = Math.sqrt(2 / (N * n * (n - 1))) *
               Math.sqrt(Math.max(0, Pe - (2 * n - 3) * Pe * Pe + 2 * (n - 2) * p3)) / (1 - Pe);
      overall = kappaEntry(kap, se);
    }

    var byCategory = categories.map(function (cat, jj) {
      var q = p[jj] * (1 - p[jj]);
      if (q <= 0) {
        return { category: cat, kappa: null, se: null, z: null, p: null, level: null,
                 note: 'la categoria no varia' };
      }
      var num = 0;
      for (var ii = 0; ii < N; ii++) num += counts[ii][jj] * (n - counts[ii][jj]);
      var kj = 1 - num / (N * n * (n - 1) * q);
      return kappaEntry(kj, Math.sqrt(2 / (N * n * (n - 1))), cat);
    });

    return { overall: overall, byCategory: byCategory, subjects: N, ratingsPerSubject: n };
  }

  /* ------------------------------------------------------------------------
   * Kappa de Cohen sobre pares (decision, verdad). Cada replica de cada
   * evaluador aporta un par: su clasificacion contra el estandar de la pieza.
   * ----------------------------------------------------------------------*/
  function cohen(pairs, categories) {
    var m = pairs.length;
    if (!m) return null;
    var k = categories.length, i, j;
    var tab = [], rowSum = [], colSum = [];
    for (i = 0; i < k; i++) {
      var row = [];
      for (j = 0; j < k; j++) row.push(0);
      tab.push(row); rowSum.push(0); colSum.push(0);
    }
    pairs.forEach(function (pr) {
      var a = categories.indexOf(pr[0]), b = categories.indexOf(pr[1]);
      if (a >= 0 && b >= 0) { tab[a][b]++; rowSum[a]++; colSum[b]++; }
    });

    var Po = 0, Pe = 0, extra = 0;
    for (i = 0; i < k; i++) {
      Po += tab[i][i] / m;
      var ri = rowSum[i] / m, ci = colSum[i] / m;
      Pe += ri * ci;
      extra += ri * ci * (ri + ci);
    }
    if (Pe >= 1) return { overall: null, byCategory: [], table: tab, pairs: m };

    var kap = (Po - Pe) / (1 - Pe);
    var se = Math.sqrt(Math.max(0, Pe + Pe * Pe - extra)) / ((1 - Pe) * Math.sqrt(m));

    /* Por categoria: se colapsa a 2x2 -esta categoria contra el resto- y se
       repite la misma cuenta. Asi se lee que tan bien detecta CADA tipo de
       pieza, que no siempre es igual de bueno en los dos sentidos. */
    var byCategory = k === 2 ? [] : categories.map(function (cat) {
      var binPairs = pairs.map(function (pr) {
        return [pr[0] === cat ? cat : 'otro', pr[1] === cat ? cat : 'otro'];
      });
      var sub = cohen(binPairs, [cat, 'otro']);
      if (!sub || !sub.overall) return { category: cat, kappa: null, se: null, z: null, p: null, level: null };
      var e = sub.overall;
      return { category: cat, kappa: e.kappa, se: e.se, z: e.z, p: e.p, level: e.level };
    });

    return { overall: kappaEntry(kap, se), byCategory: byCategory, table: tab, pairs: m };
  }

  /* ------------------------------------------------------------------------
   * compute(rows, opts)
   *
   * opts: { alpha, categories, rejectCategory }
   *   alpha           nivel del intervalo de confianza (0.05 por defecto)
   *   categories      orden preferido de las categorias
   *   rejectCategory  cual significa "no conforme", para efectividad, fuga y
   *                   falsa alarma. Solo aplica con estandar y escala binaria.
   * ----------------------------------------------------------------------*/
  function compute(rows, opts) {
    var o = opts || {};
    var v = validate(rows, o);
    if (!v.ok) {
      var err = new Error('Los datos no pasan la validacion.');
      err.details = v.errors;
      throw err;
    }
    var meta = v.meta;
    var alpha = isFinite(o.alpha) && o.alpha > 0 && o.alpha < 1 ? o.alpha : 0.05;
    var ops = meta.operators, parts = meta.parts, cats = meta.categories;
    var reps = meta.replicates, cell = meta.cell, std = meta.standardOf;
    var warnings = v.warnings.slice();

    var ratingsOf = function (op, pt) { return cell[op + SEP + pt] || []; };

    /* --- Dentro del evaluador ------------------------------------------- */
    var withinAppraiser = reps >= 2 ? ops.map(function (op) {
      var m = 0;
      parts.forEach(function (pt) { if (allEqual(ratingsOf(op, pt))) m++; });
      var a = agreement(m, parts.length, alpha);
      a.operator = op;
      a.assessment = tag(a.pct, LIMITS.agreement, false, PCT_LABELS);
      return a;
    }) : [];

    /* --- Evaluador contra el estandar ----------------------------------- */
    var vsStandard = meta.hasStandard ? ops.map(function (op) {
      var m = 0;
      parts.forEach(function (pt) { if (allEqual(ratingsOf(op, pt), std[pt])) m++; });
      var a = agreement(m, parts.length, alpha);
      a.operator = op;
      a.assessment = tag(a.pct, LIMITS.effective, false, PCT_LABELS);
      return a;
    }) : [];

    /* --- Entre evaluadores ---------------------------------------------- */
    var allRatingsByPart = parts.map(function (pt) {
      var list = [];
      ops.forEach(function (op) { list = list.concat(ratingsOf(op, pt)); });
      return list;
    });
    var betweenMatched = 0;
    allRatingsByPart.forEach(function (list) { if (allEqual(list)) betweenMatched++; });
    var betweenAppraisers = agreement(betweenMatched, parts.length, alpha);
    betweenAppraisers.assessment = tag(betweenAppraisers.pct, LIMITS.agreement, false, PCT_LABELS);

    /* --- Todos contra el estandar --------------------------------------- */
    var allVsStandard = null;
    if (meta.hasStandard) {
      var m2 = 0;
      parts.forEach(function (pt, i) { if (allEqual(allRatingsByPart[i], std[pt])) m2++; });
      allVsStandard = agreement(m2, parts.length, alpha);
      allVsStandard.assessment = tag(allVsStandard.pct, LIMITS.effective, false, PCT_LABELS);
    }

    /* --- Kappa ----------------------------------------------------------- */
    var kappaBetween = ops.length > 1 ? fleiss(allRatingsByPart, cats) : null;

    var kappaVsStandard = [], kappaAllVsStandard = null;
    if (meta.hasStandard) {
      kappaVsStandard = ops.map(function (op) {
        var pairs = [];
        parts.forEach(function (pt) {
          ratingsOf(op, pt).forEach(function (r) { pairs.push([r, std[pt]]); });
        });
        var c = cohen(pairs, cats);
        return { operator: op, overall: c && c.overall, byCategory: (c && c.byCategory) || [],
                 table: c && c.table };
      });
      var allPairs = [];
      ops.forEach(function (op) {
        parts.forEach(function (pt) {
          ratingsOf(op, pt).forEach(function (r) { allPairs.push([r, std[pt]]); });
        });
      });
      kappaAllVsStandard = cohen(allPairs, cats);
    }

    /* --- Efectividad, fuga y falsa alarma (binario con estandar) --------- */
    var effectiveness = [], reject = null, accept = null;
    if (meta.hasStandard && cats.length === 2) {
      reject = o.rejectCategory && cats.indexOf(String(o.rejectCategory).trim()) >= 0
             ? String(o.rejectCategory).trim() : cats[1];
      accept = cats[0] === reject ? cats[1] : cats[0];

      effectiveness = ops.map(function (op) {
        var correct = 0, missed = 0, badCalls = 0, nRej = 0, nAcc = 0;
        parts.forEach(function (pt) {
          var list = ratingsOf(op, pt), truth = std[pt];
          if (allEqual(list, truth)) correct++;
          list.forEach(function (r) {
            if (truth === reject) { nRej++; if (r === accept) missed++; }
            else { nAcc++; if (r === reject) badCalls++; }
          });
        });
        var eff = 100 * correct / parts.length;
        var miss = nRej ? 100 * missed / nRej : null;
        var fa = nAcc ? 100 * badCalls / nAcc : null;
        return {
          operator: op,
          effectiveness: eff, correct: correct, inspected: parts.length,
          missRate: miss, missed: missed, rejectDecisions: nRej,
          falseAlarmRate: fa, falseAlarms: badCalls, acceptDecisions: nAcc,
          assessment: {
            effectiveness: tag(eff, LIMITS.effective, false, PCT_LABELS),
            missRate: tag(miss, LIMITS.miss, true, MISS_LABELS),
            falseAlarmRate: tag(fa, LIMITS.falseAlarm, true, FA_LABELS)
          }
        };
      });
    } else if (meta.hasStandard) {
      warnings.push('La escala tiene ' + cats.length + ' categorias. La efectividad, el error de ' +
                    'fuga y la falsa alarma son cifras de decision binaria (conforme / no ' +
                    'conforme), asi que no se calculan aqui; el acuerdo y kappa si aplican.');
    }

    /* --- Tarjetas de veredicto ------------------------------------------ */
    var worstWithin = withinAppraiser.length
      ? Math.min.apply(null, withinAppraiser.map(function (a) { return a.pct; })) : null;
    var kOverall = kappaAllVsStandard && kappaAllVsStandard.overall
      ? kappaAllVsStandard.overall.kappa
      : (kappaBetween && kappaBetween.overall ? kappaBetween.overall.kappa : null);

    var metrics = {
      worstWithin: worstWithin,
      between: betweenAppraisers.pct,
      allVsStandard: allVsStandard ? allVsStandard.pct : null,
      kappa: kOverall,
      kappaSource: kappaAllVsStandard && kappaAllVsStandard.overall ? 'contra el estandar'
                                                                   : 'entre evaluadores',
      worstEffectiveness: effectiveness.length
        ? Math.min.apply(null, effectiveness.map(function (e) { return e.effectiveness; })) : null,
      worstMiss: effectiveness.length && effectiveness[0].missRate !== null
        ? Math.max.apply(null, effectiveness.map(function (e) { return e.missRate; })) : null,
      worstFalseAlarm: effectiveness.length && effectiveness[0].falseAlarmRate !== null
        ? Math.max.apply(null, effectiveness.map(function (e) { return e.falseAlarmRate; })) : null
    };

    var assessment = {
      within: tag(metrics.worstWithin, LIMITS.agreement, false, PCT_LABELS),
      between: tag(metrics.between, LIMITS.agreement, false, PCT_LABELS),
      allVsStandard: tag(metrics.allVsStandard, LIMITS.effective, false, PCT_LABELS),
      kappa: tag(metrics.kappa, LIMITS.kappa, false, KAPPA_LABELS),
      effectiveness: tag(metrics.worstEffectiveness, LIMITS.effective, false, PCT_LABELS),
      missRate: tag(metrics.worstMiss, LIMITS.miss, true, MISS_LABELS),
      falseAlarmRate: tag(metrics.worstFalseAlarm, LIMITS.falseAlarm, true, FA_LABELS)
    };

    /* --- Series para las graficas ---------------------------------------- */
    var charts = {
      labels: ops.slice(),
      withinAppraiser: withinAppraiser.map(function (a) {
        return { label: a.operator, pct: a.pct, lo: a.ciLow, hi: a.ciHigh };
      }),
      vsStandard: vsStandard.map(function (a) {
        return { label: a.operator, pct: a.pct, lo: a.ciLow, hi: a.ciHigh };
      }),
      errorRates: effectiveness.map(function (e) {
        return { label: e.operator, effectiveness: e.effectiveness,
                 missRate: e.missRate, falseAlarmRate: e.falseAlarmRate };
      })
    };

    return {
      ok: true,
      model: 'attribute',
      method: 'atributos',
      meta: {
        operators: ops, parts: parts, categories: cats, replicates: reps,
        hasStandard: meta.hasStandard, standardOf: std,
        rejectCategory: reject, acceptCategory: accept,
        decisions: ops.length * parts.length * reps, alpha: alpha
      },
      withinAppraiser: withinAppraiser,
      vsStandard: vsStandard,
      betweenAppraisers: betweenAppraisers,
      allVsStandard: allVsStandard,
      kappaBetween: kappaBetween,
      kappaVsStandard: kappaVsStandard,
      kappaAllVsStandard: kappaAllVsStandard,
      effectiveness: effectiveness,
      metrics: metrics,
      assessment: assessment,
      charts: charts,
      warnings: warnings
    };
  }

  /* cohenKappa y fleissKappa se exportan porque la suite los prueba contra
     tablas resueltas a mano. Son las dos piezas donde un error se veria como
     un numero plausible pero equivocado, asi que conviene poder atacarlas
     directamente y no solo a traves de un estudio completo. */
  global.MSAAttribute = { compute: compute, validate: validate, LIMITS: LIMITS,
                          cohenKappa: cohen, fleissKappa: fleiss };
})(typeof window !== 'undefined' ? window : globalThis);
