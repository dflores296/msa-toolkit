/* ============================================================================
 * anova.js - Motor de calculo Gage R&R, metodo ANOVA cruzado (crossed).
 *
 * Reemplaza el motor VBA del libro Gage_RR_Study.xlsm corrigiendo los errores
 * documentados en docs/auditoria-motor-excel.md. Validado contra el dataset
 * del apendice del manual AIAG MSA 4a ed. (= gageaiag.mtw de Minitab).
 *
 * Sin dependencias. Sin DOM. Determinista. Reutilizable desde los tests.
 * ==========================================================================*/
(function (global) {
  'use strict';

  /* --- Constantes de cartas de control por tamano de subgrupo (replicas) ---
   * d2, D3, D4, A2 estandar (ASTM / AIAG). El VBA original solo llegaba a 10
   * y caia silenciosamente a los valores de n=2 fuera de rango. */
  var CTRL = {
    2:  { d2: 1.128, D3: 0,     D4: 3.267, A2: 1.880 },
    3:  { d2: 1.693, D3: 0,     D4: 2.574, A2: 1.023 },
    4:  { d2: 2.059, D3: 0,     D4: 2.282, A2: 0.729 },
    5:  { d2: 2.326, D3: 0,     D4: 2.114, A2: 0.577 },
    6:  { d2: 2.534, D3: 0,     D4: 2.004, A2: 0.483 },
    7:  { d2: 2.704, D3: 0.076, D4: 1.924, A2: 0.419 },
    8:  { d2: 2.847, D3: 0.136, D4: 1.864, A2: 0.373 },
    9:  { d2: 2.970, D3: 0.184, D4: 1.816, A2: 0.337 },
    10: { d2: 3.078, D3: 0.223, D4: 1.777, A2: 0.308 },
    11: { d2: 3.173, D3: 0.256, D4: 1.744, A2: 0.285 },
    12: { d2: 3.258, D3: 0.283, D4: 1.717, A2: 0.266 },
    13: { d2: 3.336, D3: 0.307, D4: 1.693, A2: 0.249 },
    14: { d2: 3.407, D3: 0.328, D4: 1.672, A2: 0.235 },
    15: { d2: 3.472, D3: 0.347, D4: 1.653, A2: 0.223 },
    16: { d2: 3.532, D3: 0.363, D4: 1.637, A2: 0.212 },
    17: { d2: 3.588, D3: 0.378, D4: 1.622, A2: 0.203 },
    18: { d2: 3.640, D3: 0.391, D4: 1.608, A2: 0.194 },
    19: { d2: 3.689, D3: 0.403, D4: 1.597, A2: 0.187 },
    20: { d2: 3.735, D3: 0.415, D4: 1.585, A2: 0.180 },
    21: { d2: 3.778, D3: 0.425, D4: 1.575, A2: 0.173 },
    22: { d2: 3.819, D3: 0.434, D4: 1.566, A2: 0.167 },
    23: { d2: 3.858, D3: 0.443, D4: 1.557, A2: 0.162 },
    24: { d2: 3.895, D3: 0.451, D4: 1.548, A2: 0.157 },
    25: { d2: 3.931, D3: 0.459, D4: 1.541, A2: 0.153 }
  };

  var mean = function (a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return s / a.length; };
  var sqrt0 = function (v) { return Math.sqrt(Math.max(0, v)); };

  /* ------------------------------------------------------------------------
   * validate(rows) - rows: [{operator, part, value}, ...]
   * Devuelve { ok, errors[], warnings[], meta{operators,parts,replicates,n} }
   * Los errores bloquean el calculo; los avisos no.
   * ----------------------------------------------------------------------*/
  function validate(rows) {
    var errors = [], warnings = [];
    if (!Array.isArray(rows) || rows.length === 0) {
      return { ok: false, errors: ['No hay datos que analizar.'], warnings: warnings, meta: null };
    }

    var operators = [], parts = [], cells = Object.create(null);
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

      if (operators.indexOf(op) < 0) operators.push(op);
      if (parts.indexOf(pt) < 0) parts.push(pt);
      var key = op + '\u0000' + pt;
      (cells[key] || (cells[key] = [])).push(Number(v));
    }
    if (errors.length) return { ok: false, errors: errors, warnings: warnings, meta: null };

    var nOp = operators.length, nPart = parts.length;
    if (nOp < 2) errors.push('Se requieren al menos 2 operadores para estimar reproducibilidad (hay ' + nOp + ').');
    if (nPart < 2) errors.push('Se requieren al menos 2 piezas (hay ' + nPart + ').');

    // Diseno balanceado: toda combinacion operador x pieza con el mismo numero de replicas.
    var counts = [], missing = [];
    for (var a = 0; a < nOp; a++) {
      for (var b = 0; b < nPart; b++) {
        var c = cells[operators[a] + '\u0000' + parts[b]];
        if (!c) { missing.push(operators[a] + ' / ' + parts[b]); counts.push(0); }
        else counts.push(c.length);
      }
    }
    if (missing.length) {
      errors.push('Diseno incompleto: faltan mediciones para ' + missing.length +
        ' combinacion(es) operador-pieza (' + missing.slice(0, 5).join('; ') +
        (missing.length > 5 ? '; ...' : '') + '). El ANOVA balanceado requiere la matriz completa.');
    }
    var uniq = counts.filter(function (x, k, s) { return s.indexOf(x) === k; });
    if (!missing.length && uniq.length > 1) {
      errors.push('Diseno desbalanceado: el numero de replicas varia entre ' +
        Math.min.apply(null, counts) + ' y ' + Math.max.apply(null, counts) +
        '. Este motor implementa ANOVA balanceado; corrige los datos o usa un metodo REML.');
    }
    var nRep = counts[0] || 0;
    if (!missing.length && uniq.length === 1 && nRep < 2) {
      errors.push('Se requieren al menos 2 replicas por combinacion operador-pieza para estimar repetibilidad.');
    }
    if (errors.length) return { ok: false, errors: errors, warnings: warnings, meta: null };

    if (!CTRL[nRep]) {
      warnings.push('Sin constantes tabuladas para ' + nRep +
        ' replicas (la tabla cubre 2 a 25): se omiten las cartas R y X-barra.');
    }
    if (nPart * nOp * nRep < 40) {
      warnings.push('Solo ' + (nPart * nOp * nRep) + ' mediciones: por debajo de 40 el %GRR es ' +
        'muy impreciso. AIAG sugiere 10x3x3 = 90.');
    }
    if (nPart < 10) warnings.push(nPart + ' piezas: la variacion pieza a pieza queda mal estimada. AIAG sugiere 10.');
    if (nOp < 3) warnings.push(nOp + ' operadores: la reproducibilidad queda mal estimada. AIAG sugiere 3.');

    return {
      ok: true, errors: [], warnings: warnings,
      meta: { operators: operators, parts: parts, replicates: nRep, n: nOp * nPart * nRep }
    };
  }

  /* ------------------------------------------------------------------------
   * compute(rows, options)
   * options:
   *   alpha            alfa para descartar la interaccion (default 0.25, AIAG).
   *                    Usa 0.05 para replicar el default de Minitab.
   *   interaction      'auto' (default, prueba F) | 'include' | 'exclude'
   *   studyVarMultiplier  6 (AIAG 4a ed., default) o 5.15 (3a ed.)
   *   lsl, usl         limites de especificacion (opcionales)
   *   tolerance        tolerancia directa; tiene prioridad sobre usl-lsl
   *   historicalSigma  sigma historica del proceso (opcional) para %Process
   *   fDenominator     'interaction' (default, Minitab/Montgomery)
   *                    | 'repeatability' (ejemplo AIAG p.127)
   * ----------------------------------------------------------------------*/
  function compute(rows, options) {
    options = options || {};
    var val = validate(rows);
    if (!val.ok) { var err = new Error(val.errors[0]); err.details = val.errors; throw err; }

    var operators = val.meta.operators, parts = val.meta.parts;
    var o = operators.length, p = parts.length, r = val.meta.replicates;
    var N = o * p * r;
    var k = options.studyVarMultiplier || 6;

    // --- Celdas y medias. Sin redondeo intermedio (el VBA redondeaba a 6 dp). ---
    var cell = Object.create(null), all = [];
    rows.forEach(function (row) {
      var key = String(row.operator).trim() + '\u0000' + String(row.part).trim();
      (cell[key] || (cell[key] = [])).push(Number(row.value));
      all.push(Number(row.value));
    });

    var grand = mean(all);
    var partMean = {}, opMean = {}, cellMean = {}, cellRange = {};
    parts.forEach(function (pt) {
      var acc = [];
      operators.forEach(function (op) { acc = acc.concat(cell[op + '\u0000' + pt]); });
      partMean[pt] = mean(acc);
    });
    operators.forEach(function (op) {
      var acc = [];
      parts.forEach(function (pt) { acc = acc.concat(cell[op + '\u0000' + pt]); });
      opMean[op] = mean(acc);
    });
    operators.forEach(function (op) {
      parts.forEach(function (pt) {
        var v = cell[op + '\u0000' + pt], key = op + '\u0000' + pt;
        cellMean[key] = mean(v);
        cellRange[key] = Math.max.apply(null, v) - Math.min.apply(null, v);
      });
    });

    // --- Sumas de cuadrados (con el factor de replicas) ---
    var SS_part = 0, SS_op = 0, SS_int = 0, SS_rep = 0, SS_total = 0;
    parts.forEach(function (pt) { SS_part += Math.pow(partMean[pt] - grand, 2); });
    SS_part *= o * r;
    operators.forEach(function (op) { SS_op += Math.pow(opMean[op] - grand, 2); });
    SS_op *= p * r;
    operators.forEach(function (op) {
      parts.forEach(function (pt) {
        SS_int += Math.pow(cellMean[op + '\u0000' + pt] - opMean[op] - partMean[pt] + grand, 2);
      });
    });
    SS_int *= r;
    operators.forEach(function (op) {
      parts.forEach(function (pt) {
        var key = op + '\u0000' + pt;
        cell[key].forEach(function (x) { SS_rep += Math.pow(x - cellMean[key], 2); });
      });
    });
    all.forEach(function (x) { SS_total += Math.pow(x - grand, 2); });

    // Comprobacion de la identidad del ANOVA
    var decomposition = SS_part + SS_op + SS_int + SS_rep;
    var decompositionError = Math.abs(decomposition - SS_total) / Math.max(SS_total, 1e-300);

    var df_part = p - 1, df_op = o - 1, df_int = (p - 1) * (o - 1), df_rep = p * o * (r - 1);
    var MS_part = SS_part / df_part, MS_op = SS_op / df_op;
    var MS_int = SS_int / df_int, MS_rep = SS_rep / df_rep;

    function mkRow(source, df, ss, ms, f, d1, d2) {
      return {
        source: source, df: df, ss: ss, ms: ms,
        f: (f === null || !isFinite(f)) ? null : f,
        p: (f === null || !isFinite(f)) ? null : global.MSAStats.fSurvival(f, d1, d2)
      };
    }

    // --- Prueba F de la interaccion y decision de agrupamiento (pooling) ---
    var F_int = MS_rep > 0 ? MS_int / MS_rep : Infinity;
    var P_int = global.MSAStats.fSurvival(F_int, df_int, df_rep);
    var alpha = (options.alpha === undefined || options.alpha === null) ? 0.25 : options.alpha;
    var mode = options.interaction || 'auto';
    var withInteraction = mode === 'include' ? true
                        : mode === 'exclude' ? false
                        : !(P_int > alpha);

    // --- Componentes de varianza a partir de los cuadrados medios esperados ---
    var V_part, V_op, V_int, V_rep, table, negatives = [], raw;
    if (withInteraction) {
      raw = {
        part: (MS_part - MS_int) / (o * r),
        op:   (MS_op   - MS_int) / (p * r),
        inter:(MS_int  - MS_rep) / r,
        rep:  MS_rep
      };
      V_part = Math.max(0, raw.part); V_op = Math.max(0, raw.op);
      V_int = Math.max(0, raw.inter); V_rep = raw.rep;
      var useRep = options.fDenominator === 'repeatability';
      var den = useRep ? MS_rep : MS_int;
      var dfDen = useRep ? df_rep : df_int;
      table = [
        mkRow('Parte',            df_part, SS_part,  MS_part, MS_part / den,   df_part, dfDen),
        mkRow('Operador',         df_op,   SS_op,    MS_op,   MS_op / den,     df_op,   dfDen),
        mkRow('Operador * Parte', df_int,  SS_int,   MS_int,  MS_int / MS_rep, df_int,  df_rep),
        mkRow('Repetibilidad',    df_rep,  SS_rep,   MS_rep,  null, null, null),
        mkRow('Total',            N - 1,   SS_total, null,    null, null, null)
      ];
    } else {
      var df_pooled = df_int + df_rep;
      var MS_pooled = (SS_int + SS_rep) / df_pooled;
      raw = {
        part: (MS_part - MS_pooled) / (o * r),
        op:   (MS_op   - MS_pooled) / (p * r),
        inter: 0,
        rep:  MS_pooled
      };
      V_part = Math.max(0, raw.part); V_op = Math.max(0, raw.op);
      V_int = 0; V_rep = MS_pooled;
      table = [
        mkRow('Parte',         df_part,   SS_part,         MS_part,   MS_part / MS_pooled, df_part, df_pooled),
        mkRow('Operador',      df_op,     SS_op,           MS_op,     MS_op / MS_pooled,   df_op,   df_pooled),
        mkRow('Repetibilidad', df_pooled, SS_int + SS_rep, MS_pooled, null, null, null),
        mkRow('Total',         N - 1,     SS_total,        null,      null, null, null)
      ];
    }
    if (raw.part < 0) negatives.push('Parte');
    if (raw.op < 0) negatives.push('Operador');
    if (withInteraction && raw.inter < 0) negatives.push('Operador * Parte');

    // --- Tablas de resultados ---
    var V_repro = V_op + V_int;
    var V_grr = V_rep + V_repro;
    var V_total = V_grr + V_part;

    var tol = resolveTolerance(options, grand);

    var histSigma = (options.historicalSigma !== undefined && options.historicalSigma !== null &&
                     options.historicalSigma !== '' && Number(options.historicalSigma) > 0)
                    ? Number(options.historicalSigma) : null;

    var sdTotal = sqrt0(V_total);
    var components = [
      { source: 'Total Gage R&R',   key: 'grr',   variance: V_grr,   indent: 0 },
      { source: 'Repetibilidad',    key: 'rep',   variance: V_rep,   indent: 1 },
      { source: 'Reproducibilidad', key: 'repro', variance: V_repro, indent: 1 },
      { source: 'Operador',         key: 'op',    variance: V_op,    indent: 2 },
      { source: 'Operador * Parte', key: 'int',   variance: V_int,   indent: 2, onlyWithInteraction: true },
      { source: 'Pieza a pieza',    key: 'part',  variance: V_part,  indent: 0 },
      { source: 'Variacion total',  key: 'total', variance: V_total, indent: 0 }
    ].filter(function (c) { return withInteraction || !c.onlyWithInteraction; });

    components.forEach(function (c) {
      c.pctContribution = V_total > 0 ? c.variance / V_total : 0;  // base varianza - suma 100 %
      c.stdDev = sqrt0(c.variance);
      c.studyVar = k * c.stdDev;                                    // 6 sigma (o 5.15 sigma)
      c.pctStudyVar = sdTotal > 0 ? c.stdDev / sdTotal : 0;         // base desviacion estandar
      // P/T. En unilateral se compara media dispersion contra medio margen.
      c.pctTolerance = tol ? (c.studyVar * (tol.oneSided ? 0.5 : 1)) / tol.width : null;
      c.pctProcess = histSigma ? c.stdDev / histSigma : null;
    });

    // --- NDC, ICC y clasificacion ---
    var sdPart = sqrt0(V_part), sdGrr = sqrt0(V_grr);
    var ndcRaw = sdGrr > 0 ? 1.41 * sdPart / sdGrr : Infinity;
    var ndc = isFinite(ndcRaw) ? Math.floor(ndcRaw) : null;

    var pctSV = sdTotal > 0 ? 100 * sdGrr / sdTotal : 0;
    var pctPT = tol ? 100 * (k * sdGrr * (tol.oneSided ? 0.5 : 1)) / tol.width : null;
    var pctContrib = 100 * (V_total > 0 ? V_grr / V_total : 0);
    var icc = V_total > 0 ? V_part / V_total : 0;  // correlacion intraclase (EMP, Wheeler)

    var result = {
      design: { operators: operators, parts: parts, replicates: r, n: N, grandMean: grand },
      model: withInteraction ? 'with-interaction' : 'without-interaction',
      modelReason: mode === 'auto'
        ? ('Prueba F de la interaccion: p = ' + P_int.toFixed(4) + (P_int > alpha
            ? ' > alfa = ' + alpha + ', se agrupa con la repetibilidad.'
            : ' <= alfa = ' + alpha + ', se conserva la interaccion.'))
        : ('Modelo fijado manualmente: ' + (withInteraction ? 'con interaccion.' : 'sin interaccion.')),
      interactionTest: { f: F_int, p: P_int, alpha: alpha, df1: df_int, df2: df_rep },
      anova: table,
      anovaFull: {
        rows: [
          { source: 'Parte',            df: df_part, ss: SS_part,  ms: MS_part },
          { source: 'Operador',         df: df_op,   ss: SS_op,    ms: MS_op },
          { source: 'Operador * Parte', df: df_int,  ss: SS_int,   ms: MS_int },
          { source: 'Repetibilidad',    df: df_rep,  ss: SS_rep,   ms: MS_rep },
          { source: 'Total',            df: N - 1,   ss: SS_total, ms: null }
        ],
        decompositionError: decompositionError
      },
      components: components,
      variance: { part: V_part, operator: V_op, interaction: V_int, repeatability: V_rep,
                  reproducibility: V_repro, grr: V_grr, total: V_total },
      studyVarMultiplier: k,
      tolerance: tol ? tol.width : null,
      toleranceInfo: tol,
      historicalSigma: histSigma,
      ndc: ndc, ndcRaw: ndcRaw,
      icc: icc,
      metrics: { pctStudyVar: pctSV, pctTolerance: pctPT, pctContribution: pctContrib },
      assessment: assess(pctSV, pctPT, pctContrib, ndc, icc),
      charts: buildChartData(operators, parts, cell, cellMean, cellRange, partMean, r),
      warnings: val.warnings.slice(),
      negativeComponents: negatives
    };

    if (negatives.length) {
      result.warnings.push('Varianza negativa truncada a cero en ' + negatives.join(', ') +
        ': ese efecto no se distingue del ruido.');
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

  /* ------------------------------------------------------------------------
   * resolveTolerance - decide contra que se compara el sistema de medicion.
   *
   * Bilateral (LSL y USL): la ventana es USL - LSL y se compara contra la
   * dispersion completa (k sigma). Caso sin ambiguedad.
   *
   * Unilateral (un solo limite): no existe una ventana completa. Se usa el
   * margen entre el limite y el centro del proceso, y se compara contra la
   * MITAD de la dispersion (k sigma / 2), porque media dispersion es lo que
   * ocupa el error de medicion de un solo lado del centro. Mantener el
   * criterio comparable exige que ambos lados de la razon sean "medios".
   *
   * El centro se toma de processMean si se da; si no, de la media global del
   * estudio, que depende de las piezas elegidas (se avisa).
   *
   * Advertencia honesta: para especificaciones unilaterales NO hay una
   * convencion unica en la industria. AIAG MSA no la prescribe. Quien
   * necesite otra convencion puede dar la tolerancia directa.
   * ----------------------------------------------------------------------*/
  function resolveTolerance(options, grandMean) {
    var num = function (v) {
      if (v === undefined || v === null || v === '') return null;
      var n = Number(v);
      return isFinite(n) ? n : null;
    };
    var explicit = num(options.tolerance);
    var lsl = num(options.lsl), usl = num(options.usl);
    var center = num(options.processMean);
    var centerFromStudy = center === null;
    if (center === null) center = grandMean;

    if (explicit !== null) {
      if (!(explicit > 0)) return null;
      return { width: explicit, oneSided: false, mode: 'directa',
               label: 'tolerancia directa', lsl: lsl, usl: usl, center: null,
               centerFromStudy: false };
    }
    if (lsl !== null && usl !== null) {
      var w = usl - lsl;
      if (!(w > 0)) return null;
      return { width: w, oneSided: false, mode: 'bilateral',
               label: 'USL - LSL', lsl: lsl, usl: usl, center: null,
               centerFromStudy: false };
    }
    if (usl !== null) {
      var mu = usl - center;
      if (!(mu > 0)) return null;
      return { width: mu, oneSided: true, mode: 'unilateral-superior',
               label: 'USL - centro del proceso', lsl: null, usl: usl,
               center: center, centerFromStudy: centerFromStudy };
    }
    if (lsl !== null) {
      var ml = center - lsl;
      if (!(ml > 0)) return null;
      return { width: ml, oneSided: true, mode: 'unilateral-inferior',
               label: 'centro del proceso - LSL', lsl: lsl, usl: null,
               center: center, centerFromStudy: centerFromStudy };
    }
    return null;
  }

  /* --- Clasificacion AIAG + clase de monitor EMP (Wheeler) --- */
  function assess(pctSV, pctPT, pctContrib, ndc, icc) {
    function aiag(v) {
      if (v === null) return null;
      if (v < 10) return { level: 'ok',   label: 'Aceptable (menor que 10 %)' };
      if (v <= 30) return { level: 'warn', label: 'Marginal (10 a 30 %)' };
      return { level: 'bad', label: 'Inaceptable (mayor que 30 %)' };
    }
    var empClass = icc >= 0.8 ? { level: 'ok',   label: 'Monitor de primera clase (ICC >= 0.80)' }
                 : icc >= 0.5 ? { level: 'warn', label: 'Monitor de segunda clase (0.50 <= ICC < 0.80)' }
                 : icc >= 0.2 ? { level: 'warn', label: 'Monitor de tercera clase (0.20 <= ICC < 0.50)' }
                 :              { level: 'bad',  label: 'Monitor de cuarta clase (ICC < 0.20)' };
    return {
      studyVar: aiag(pctSV),
      tolerance: aiag(pctPT),
      contribution: pctContrib < 1 ? { level: 'ok',   label: 'Excelente (menor que 1 %)' }
                  : pctContrib < 9 ? { level: 'warn', label: 'Aceptable (1 a 9 %)' }
                  :                  { level: 'bad',  label: 'Pobre (mayor que 9 %)' },
      ndc: ndc === null ? null
         : ndc >= 5 ? { level: 'ok',  label: 'NDC = ' + ndc + ' (>= 5)' }
                    : { level: 'bad', label: 'NDC = ' + ndc + ' (< 5)' },
      emp: empClass
    };
  }

  /* --- Series para las 6 graficas --- */
  function buildChartData(operators, parts, cell, cellMean, cellRange, partMean, r) {
    var labels = [], ranges = [], means = [];
    operators.forEach(function (op) {
      parts.forEach(function (pt) {
        labels.push(op + ' - ' + pt);              // conserva los nombres reales
        ranges.push(cellRange[op + '\u0000' + pt]);
        means.push(cellMean[op + '\u0000' + pt]);
      });
    });
    var rBar = mean(ranges), xBar = mean(means);
    var c = CTRL[r] || null;

    return {
      labels: labels,
      rChart: c ? { values: ranges, center: rBar, ucl: c.D4 * rBar, lcl: c.D3 * rBar, available: true }
                : { values: ranges, center: rBar, available: false },
      xbarChart: c ? { values: means, center: xBar, ucl: xBar + c.A2 * rBar, lcl: xBar - c.A2 * rBar, available: true }
                   : { values: means, center: xBar, available: false },
      partMeans: { labels: parts.slice(), values: parts.map(function (pt) { return partMean[pt]; }) },
      interaction: {
        parts: parts.slice(),
        series: operators.map(function (op) {
          return { operator: op, values: parts.map(function (pt) { return cellMean[op + '\u0000' + pt]; }) };
        })
      },
      byOperator: operators.map(function (op) {
        var v = [];
        parts.forEach(function (pt) { v = v.concat(cell[op + '\u0000' + pt]); });
        return { operator: op, values: v, mean: mean(v) };
      }),
      constants: c
    };
  }

  global.MSAAnova = { compute: compute, validate: validate, CONTROL_CONSTANTS: CTRL };
})(typeof window !== 'undefined' ? window : globalThis);
