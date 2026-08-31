/* ============================================================================
 * anova-nested.js - Motor de calculo Gage R&R, metodo ANOVA anidado (nested).
 *
 * Para pruebas destructivas: medir la pieza la destruye, asi que ningun
 * operador puede repetir la misma pieza. Cada operador recibe SUS piezas de un
 * lote que se supone homogeneo, y las replicas son varias mediciones de esa
 * pieza (o de pedazos de ella) tomadas por el mismo operador.
 *
 * Consecuencia del diseno, no del programa: piezas anidadas dentro de operador
 * NO permiten estimar la interaccion operador x pieza. La reproducibilidad
 * sale como efecto de operador y nada mas.
 *
 * Modelo:
 *   SC_Total = SC_Operador + SC_Pieza(Operador) + SC_Repetibilidad
 *   gl_Operador        = o - 1
 *   gl_Pieza(Operador) = o (n - 1)
 *   gl_Repetibilidad   = o n (r - 1)
 * con o operadores, n piezas por operador y r replicas por pieza.
 *
 * Componentes (cuadrados medios esperados del modelo de efectos aleatorios):
 *   Var_Repetibilidad     = CM_Rep
 *   Var_Pieza             = (CM_Pieza(Op) - CM_Rep) / r
 *   Var_Reproducibilidad  = (CM_Op - CM_Pieza(Op)) / (n r)
 *
 * Sin dependencias. Sin DOM. Determinista. Reutilizable desde los tests.
 * Reutiliza de anova.js las constantes de carta, la clasificacion AIAG
 * (assess) y la resolucion de tolerancia: no dependen del diseno.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var mean = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
  var sqrt0 = function (v) { return Math.sqrt(Math.max(0, v)); };
  var SEP = '\u0000';

  /* ------------------------------------------------------------------------
   * validate(rows) - rows: [{operator, part, value}, ...]
   * Devuelve { ok, errors[], warnings[], meta{operators, partsByOperator,
   *            parts, partsPerOperator, replicates, n} }
   *
   * La regla que separa este diseno del cruzado: cada pieza pertenece a UN
   * solo operador. Una pieza que aparece bajo dos operadores no es un nombre
   * repetido por descuido, es un estudio cruzado capturado en el metodo
   * equivocado, y por eso el mensaje manda al otro metodo.
   * ----------------------------------------------------------------------*/
  function validate(rows) {
    var errors = [], warnings = [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: false, errors: ['No hay datos que analizar.'], warnings: warnings, meta: null };
    }

    var operators = [], partsOf = Object.create(null), ownerOf = Object.create(null);
    var shared = [], cells = Object.create(null);

    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], line = i + 1;
      var op = (r.operator === undefined || r.operator === null) ? '' : String(r.operator).trim();
      var pt = (r.part === undefined || r.part === null) ? '' : String(r.part).trim();
      var v = r.value;

      if (!op) errors.push('Fila ' + line + ': falta el operador.');
      if (!pt) errors.push('Fila ' + line + ': falta la pieza.');
      if (v === '' || v === null || v === undefined || !isFinite(Number(v))) {
        errors.push('Fila ' + line + ': la medicion "' + v + '" no es un numero valido.');
        continue;
      }
      if (!op || !pt) continue;

      if (operators.indexOf(op) < 0) { operators.push(op); partsOf[op] = []; }
      if (ownerOf[pt] === undefined) { ownerOf[pt] = op; partsOf[op].push(pt); }
      else if (ownerOf[pt] !== op && shared.indexOf(pt) < 0) shared.push(pt);

      var key = op + SEP + pt;
      (cells[key] || (cells[key] = [])).push(Number(v));
    }
    if (errors.length) return { ok: false, errors: errors, warnings: warnings, meta: null };

    var o = operators.length;
    if (o < 2) errors.push('Se requieren al menos 2 operadores para estimar reproducibilidad (hay ' + o + ').');
    if (shared.length) {
      errors.push('En un estudio anidado cada pieza pertenece a un solo operador, y ' +
        shared.length + ' pieza(s) aparecen bajo varios (' + shared.slice(0, 5).join('; ') +
        (shared.length > 5 ? '; ...' : '') + '). Si los operadores midieron las mismas piezas, ' +
        'el estudio es cruzado: usa el metodo Cruzado.');
    }
    if (errors.length) return { ok: false, errors: errors, warnings: warnings, meta: null };

    // Diseno balanceado: mismo numero de piezas por operador y mismas replicas
    // en toda celda. El motor implementa el caso balanceado, como el cruzado.
    var perOp = operators.map(function (op) { return partsOf[op].length; });
    var n = perOp[0];
    if (n < 2) {
      errors.push('Se requieren al menos 2 piezas por operador (hay ' + n + ' en ' + operators[0] + ').');
    }
    var unevenOp = perOp.some(function (c) { return c !== n; });
    if (unevenOp) {
      errors.push('Diseno desbalanceado: el numero de piezas por operador varia entre ' +
        Math.min.apply(null, perOp) + ' y ' + Math.max.apply(null, perOp) +
        '. Este motor implementa ANOVA anidado balanceado; corrige los datos o usa un metodo REML.');
    }

    var counts = [];
    operators.forEach(function (op) {
      partsOf[op].forEach(function (pt) { counts.push(cells[op + SEP + pt].length); });
    });
    var uniq = counts.filter(function (x, k, s) { return s.indexOf(x) === k; });
    if (!unevenOp && uniq.length > 1) {
      errors.push('Diseno desbalanceado: el numero de replicas varia entre ' +
        Math.min.apply(null, counts) + ' y ' + Math.max.apply(null, counts) +
        '. Este motor implementa ANOVA anidado balanceado; corrige los datos o usa un metodo REML.');
    }
    var rep = counts[0] || 0;
    if (!unevenOp && uniq.length === 1 && rep < 2) {
      errors.push('Se requieren al menos 2 replicas por pieza para estimar repetibilidad. ' +
        'Si cada pieza solo admite una medicion, el estudio no puede separar repetibilidad ' +
        'de variacion entre piezas.');
    }
    if (errors.length) return { ok: false, errors: errors, warnings: warnings, meta: null };

    if (!global.MSAAnova.CONTROL_CONSTANTS[rep]) {
      warnings.push('Sin constantes tabuladas para ' + rep +
        ' replicas (la tabla cubre 2 a 25): se omiten las cartas R y X-barra.');
    }
    var N = o * n * rep;
    if (N < 40) {
      warnings.push('Solo ' + N + ' mediciones: por debajo de 40 el %GRR es muy impreciso. ' +
        'En destructivas AIAG sugiere al menos 3 operadores y 10 piezas por operador.');
    }
    if (n < 10) {
      warnings.push('Con ' + n + ' piezas por operador el intervalo de confianza del componente ' +
        'pieza a pieza es amplio; AIAG sugiere 10.');
    }
    if (o < 3) {
      warnings.push('Con ' + o + ' operadores la reproducibilidad se estima con poca precision; ' +
        'AIAG sugiere 3.');
    }

    var flat = [];
    operators.forEach(function (op) { flat = flat.concat(partsOf[op]); });

    return {
      ok: true, errors: [], warnings: warnings,
      meta: {
        operators: operators,
        partsByOperator: operators.map(function (op) { return partsOf[op].slice(); }),
        parts: flat,
        partsPerOperator: n,
        replicates: rep,
        n: N
      }
    };
  }

  /* ------------------------------------------------------------------------
   * compute(rows, options)
   * options: las mismas de anova.js que aplican a este diseno -
   *   studyVarMultiplier, lsl, usl, tolerance, processMean, historicalSigma.
   * No hay alpha ni interaction ni fDenominator: sin interaccion estimable no
   * hay nada que probar ni que agrupar, y los denominadores de las dos F del
   * modelo anidado los fija el modelo (CM_Pieza(Op) para operador, CM_Rep para
   * pieza dentro de operador).
   * ----------------------------------------------------------------------*/
  function compute(rows, options) {
    options = options || {};
    var val = validate(rows);
    if (!val.ok) { var err = new Error(val.errors[0]); err.details = val.errors; throw err; }

    var operators = val.meta.operators, partsByOp = val.meta.partsByOperator;
    var o = operators.length, n = val.meta.partsPerOperator, r = val.meta.replicates;
    var N = o * n * r;
    var k = options.studyVarMultiplier || 6;

    // --- Celdas y medias. Sin redondeo intermedio, igual que en el cruzado. ---
    var cell = Object.create(null), all = [];
    rows.forEach(function (row) {
      var key = String(row.operator).trim() + SEP + String(row.part).trim();
      (cell[key] || (cell[key] = [])).push(Number(row.value));
      all.push(Number(row.value));
    });

    var grand = mean(all);
    var opMean = {}, cellMean = {}, cellRange = {};
    operators.forEach(function (op, oi) {
      var acc = [];
      partsByOp[oi].forEach(function (pt) {
        var key = op + SEP + pt, v = cell[key];
        acc = acc.concat(v);
        cellMean[key] = mean(v);
        cellRange[key] = Math.max.apply(null, v) - Math.min.apply(null, v);
      });
      opMean[op] = mean(acc);
    });

    // --- Sumas de cuadrados ---
    var SS_op = 0, SS_partop = 0, SS_rep = 0, SS_total = 0;
    operators.forEach(function (op) { SS_op += Math.pow(opMean[op] - grand, 2); });
    SS_op *= n * r;
    operators.forEach(function (op, oi) {
      partsByOp[oi].forEach(function (pt) {
        SS_partop += Math.pow(cellMean[op + SEP + pt] - opMean[op], 2);
      });
    });
    SS_partop *= r;
    operators.forEach(function (op, oi) {
      partsByOp[oi].forEach(function (pt) {
        var key = op + SEP + pt;
        cell[key].forEach(function (x) { SS_rep += Math.pow(x - cellMean[key], 2); });
      });
    });
    all.forEach(function (x) { SS_total += Math.pow(x - grand, 2); });

    // Comprobacion de la identidad del ANOVA anidado.
    var decomposition = SS_op + SS_partop + SS_rep;
    var decompositionError = Math.abs(decomposition - SS_total) / Math.max(SS_total, 1e-300);

    var df_op = o - 1, df_partop = o * (n - 1), df_rep = o * n * (r - 1);
    var MS_op = SS_op / df_op, MS_partop = SS_partop / df_partop, MS_rep = SS_rep / df_rep;

    function mkRow(source, df, ss, ms, f, d1, d2) {
      return {
        source: source, df: df, ss: ss, ms: ms,
        f: (f === null || !isFinite(f)) ? null : f,
        p: (f === null || !isFinite(f)) ? null : global.MSAStats.fSurvival(f, d1, d2)
      };
    }

    /* Los denominadores de F los fija el modelo anidado: el operador se prueba
       contra la pieza dentro de operador (es el estrato que lo contiene), y la
       pieza dentro de operador contra la repetibilidad. */
    var F_op = MS_partop > 0 ? MS_op / MS_partop : Infinity;
    var F_partop = MS_rep > 0 ? MS_partop / MS_rep : Infinity;

    var table = [
      mkRow('Operador',         df_op,     SS_op,     MS_op,     F_op,     df_op,     df_partop),
      mkRow('Pieza (Operador)', df_partop, SS_partop, MS_partop, F_partop, df_partop, df_rep),
      mkRow('Repetibilidad',    df_rep,    SS_rep,    MS_rep,    null, null, null),
      mkRow('Total',            N - 1,     SS_total,  null,      null, null, null)
    ];

    // --- Componentes de varianza a partir de los cuadrados medios esperados ---
    var raw = {
      op:   (MS_op - MS_partop) / (n * r),
      part: (MS_partop - MS_rep) / r,
      rep:  MS_rep
    };
    var negatives = [];
    if (raw.op < 0) negatives.push('Reproducibilidad (Operador)');
    if (raw.part < 0) negatives.push('Pieza a pieza');

    var V_op = Math.max(0, raw.op);
    var V_part = Math.max(0, raw.part);
    var V_rep = raw.rep;
    var V_repro = V_op;                       // sin interaccion estimable
    var V_grr = V_rep + V_repro;
    var V_total = V_grr + V_part;

    var tol = global.MSAAnova.resolveTolerance(options, grand);
    var histSigma = (options.historicalSigma !== undefined && options.historicalSigma !== null &&
                     options.historicalSigma !== '' && Number(options.historicalSigma) > 0)
                    ? Number(options.historicalSigma) : null;

    var sdTotal = sqrt0(V_total);
    var components = [
      { source: 'Total Gage R&R',   key: 'grr',   variance: V_grr,   indent: 0 },
      { source: 'Repetibilidad',    key: 'rep',   variance: V_rep,   indent: 1 },
      { source: 'Reproducibilidad', key: 'repro', variance: V_repro, indent: 1 },
      { source: 'Operador',         key: 'op',    variance: V_op,    indent: 2 },
      { source: 'Pieza a pieza',    key: 'part',  variance: V_part,  indent: 0 },
      { source: 'Variacion total',  key: 'total', variance: V_total, indent: 0 }
    ];

    components.forEach(function (c) {
      c.pctContribution = V_total > 0 ? c.variance / V_total : 0;
      c.stdDev = sqrt0(c.variance);
      c.studyVar = k * c.stdDev;
      c.pctStudyVar = sdTotal > 0 ? c.stdDev / sdTotal : 0;
      c.pctTolerance = tol ? (c.studyVar * (tol.oneSided ? 0.5 : 1)) / tol.width : null;
      c.pctProcess = histSigma ? c.stdDev / histSigma : null;
    });

    var sdGrr = sqrt0(V_grr);   // sdPart ya solo lo usa ndcOf, por dentro
    /* NDC y discriminacion salen de las mismas funciones que el cruzado: las
       celdas del anidado son operador x SU pieza, pero la pregunta es la
       misma, y dos copias acabarian clasificando distinto el mismo equipo. */
    var ndcInfo = global.MSAAnova.ndcOf(V_part, V_grr, V_total);
    var ndcRaw = ndcInfo.raw, ndc = ndcInfo.ndc, ndcLabel = ndcInfo.label;

    var cellList = [];
    operators.forEach(function (op, oi) {
      partsByOp[oi].forEach(function (pt) { cellList.push(cell[op + SEP + pt]); });
    });
    var disc = global.MSAAnova.discrimination(cellList, all, V_grr, V_total, tol, k);

    var pctSV = sdTotal > 0 ? 100 * sdGrr / sdTotal : 0;
    var pctPT = tol ? 100 * (k * sdGrr * (tol.oneSided ? 0.5 : 1)) / tol.width : null;
    var pctContrib = 100 * (V_total > 0 ? V_grr / V_total : 0);
    var icc = V_total > 0 ? V_part / V_total : 0;

    var result = {
      method: 'anidado',
      design: {
        operators: operators, parts: val.meta.parts, partsByOperator: partsByOp,
        partsPerOperator: n, replicates: r, n: N, grandMean: grand
      },
      model: 'nested',
      modelReason: 'Diseno anidado: las piezas pertenecen a un solo operador, asi que la ' +
        'interaccion operador x pieza no es estimable y la reproducibilidad es el efecto de ' +
        'operador. La F del operador usa CM Pieza(Operador) como denominador; la de ' +
        'Pieza(Operador) usa CM Repetibilidad.',
      anova: table,
      anovaFull: {
        rows: [
          { source: 'Operador',         df: df_op,     ss: SS_op,     ms: MS_op },
          { source: 'Pieza (Operador)', df: df_partop, ss: SS_partop, ms: MS_partop },
          { source: 'Repetibilidad',    df: df_rep,    ss: SS_rep,    ms: MS_rep },
          { source: 'Total',            df: N - 1,     ss: SS_total,  ms: null }
        ],
        decompositionError: decompositionError,
        identity: 'SC_Total = SC_Operador + SC_Pieza(Operador) + SC_Repetibilidad'
      },
      components: components,
      variance: { part: V_part, operator: V_op, interaction: 0, repeatability: V_rep,
                  reproducibility: V_repro, grr: V_grr, total: V_total },
      studyVarMultiplier: k,
      tolerance: tol ? tol.width : null,
      toleranceInfo: tol,
      historicalSigma: histSigma,
      ndc: ndc, ndcRaw: ndcRaw, ndcLabel: ndcLabel,
      discrimination: disc,
      inconclusive: disc.inconclusive,
      icc: icc,
      metrics: { pctStudyVar: pctSV, pctTolerance: pctPT, pctContribution: pctContrib },
      assessment: disc.inconclusive
        ? { studyVar: null, tolerance: null, contribution: null, ndc: null, emp: null }
        : global.MSAAnova.assess(pctSV, pctPT, pctContrib, ndc, icc),
      charts: buildChartData(operators, partsByOp, cell, cellMean, cellRange, r),
      warnings: val.warnings.slice(),
      negativeComponents: negatives
    };

    /* Aviso fijo, no resultado: la homogeneidad del lote es el supuesto que
       sostiene todo el metodo y este estudio no la puede comprobar. Si las
       piezas de un operador vienen de otro lote, su diferencia se cuenta como
       reproducibilidad y el sistema de medicion carga con la culpa. */
    result.warnings.push('El anidado supone que las piezas de todos los operadores salen de un lote ' +
      'homogeneo, y este estudio no lo puede comprobar: cualquier diferencia real entre los lotes de ' +
      'cada operador se contabiliza como reproducibilidad. Reparte las piezas al azar sobre un mismo ' +
      'lote y en el mismo orden de produccion.');
    result.warnings.push('El diseno anidado no separa la interaccion operador x pieza: ninguna pieza ' +
      'la miden dos operadores. La reproducibilidad que se reporta es el efecto de operador. Es una ' +
      'limitacion del diseno, no del calculo.');

    global.MSAAnova.discriminationWarnings(disc).forEach(function (w) { result.warnings.push(w); });

    if (negatives.length) {
      result.warnings.push('Componente(s) de varianza negativo(s) truncado(s) a cero: ' + negatives.join(', ') +
        '. Indica que el efecto no se distingue del ruido; considera un estimador REML si se repite.');
    }
    if (decompositionError > 1e-9) {
      result.warnings.push('La descomposicion de sumas de cuadrados no cierra (error relativo ' +
        decompositionError.toExponential(2) + '). Revisa los datos capturados.');
    }
    if (ndc !== null && ndc < 5) {
      result.warnings.push('NDC = ' + ndc + ' (menor que 5): el sistema no separa las piezas. ' +
        'Revisa la resolucion del instrumento y las piezas elegidas.');
    }
    if (tol === null) {
      result.warnings.push('Sin LSL/USL ni tolerancia directa: no se calcula %Tolerance (P/T).');
    } else if (tol.oneSided) {
      result.warnings.push('Especificacion unilateral (' + tol.mode.replace('unilateral-', '') +
        '): el %Tolerance compara media dispersion (' + (k / 2) + ' sigma) contra ' +
        tol.label + ' = ' + tol.width.toPrecision(6) + '. Si usas otra convencion, captura la ' +
        'tolerancia directa.');
      if (tol.centerFromStudy) {
        result.warnings.push('Centro del proceso tomado de la media del estudio (' +
          grand.toPrecision(6) + '), que depende de las piezas elegidas. Captura la media ' +
          'historica para un %Tolerance mas estable.');
      }
    }
    return result;
  }

  /* --- Series para las graficas del anidado ---------------------------------
   * Se van la de interaccion y las que agrupan por pieza compartida: aqui
   * ninguna pieza la miden dos operadores, asi que cruzarlas no significa
   * nada. Quedan la carta R, la X-barra (con sus bloques por operador), la
   * caja por operador y los rangos por operador.
   * ------------------------------------------------------------------------*/
  function buildChartData(operators, partsByOp, cell, cellMean, cellRange, r) {
    var labels = [], ranges = [], means = [], partSeq = [], groups = [], at = 0;
    operators.forEach(function (op, oi) {
      var pts = partsByOp[oi];
      groups.push({ label: op, from: at, to: at + pts.length - 1 });
      at += pts.length;
      pts.forEach(function (pt) {
        labels.push(op + ' - ' + pt);
        partSeq.push(pt);
        ranges.push(cellRange[op + SEP + pt]);
        means.push(cellMean[op + SEP + pt]);
      });
    });
    var rBar = mean(ranges), xBar = mean(means);
    var c = global.MSAAnova.CONTROL_CONSTANTS[r] || null;

    return {
      labels: labels,
      partSequence: partSeq,
      operatorGroups: groups,
      allParts: partSeq.slice(),
      rChart: c ? { values: ranges, center: rBar, ucl: c.D4 * rBar, lcl: c.D3 * rBar, available: true }
                : { values: ranges, center: rBar, available: false },
      xbarChart: c ? { values: means, center: xBar, ucl: xBar + c.A2 * rBar, lcl: xBar - c.A2 * rBar, available: true }
                   : { values: means, center: xBar, available: false },
      byOperator: operators.map(function (op, oi) {
        var v = [];
        partsByOp[oi].forEach(function (pt) { v = v.concat(cell[op + SEP + pt]); });
        return { operator: op, values: v, mean: mean(v), box: global.MSAStats.boxStats(v) };
      }),
      rangesByOperator: operators.map(function (op, oi) {
        var v = partsByOp[oi].map(function (pt) { return cellRange[op + SEP + pt]; });
        return { label: op, values: v, mean: mean(v) };
      }),
      constants: c
    };
  }

  global.MSANested = { compute: compute, validate: validate };
})(typeof window !== 'undefined' ? window : globalThis);
