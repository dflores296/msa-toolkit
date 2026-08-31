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
    /* Avisos de suficiencia del diseno. Son INFORMATIVOS: ninguno bloquea el
       calculo ni el veredicto puntual. F-07 retiro el piso de 60 mediciones
       que si bloqueaba, porque medía la dimension equivocada -- un 2x15x2 de
       60 mediciones da un intervalo 2.7 veces mas ancho que un 3x10x2 de las
       mismas 60, y el piso los trataba igual. Cada dimension se avisa por
       separado, que es como se corrige un diseno. */
    if (nPart < 10) warnings.push('Con ' + nPart + ' piezas el intervalo de confianza del componente pieza-a-pieza es amplio; AIAG sugiere 10.');
    if (nOp < 3) warnings.push('Con ' + nOp + ' operadores la reproducibilidad se estima con poca precision; AIAG sugiere 3.');
    if (nRep < 3) warnings.push('Con ' + nRep + ' replicas la repetibilidad se estima con pocos grados de libertad; AIAG sugiere 3.');
    /* Este no sale de los datos, y por eso se dice siempre: si las piezas no
       cubren el rango del proceso, el %GRR sale bajo por la razon equivocada.
       Los numeros del estudio no pueden detectarlo. */
    warnings.push('Las piezas del estudio deben cubrir el rango de variacion esperado del proceso. ' +
      'Si no lo cubren, el % Study Variation sale optimista y ningun calculo de esta pagina puede ' +
      'detectarlo: es un juicio sobre como se eligieron las piezas, no sobre los datos.');

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
    var sdGrr = sqrt0(V_grr);   // sdPart ya solo lo usa ndcOf, por dentro
    var ndcInfo = ndcOf(V_part, V_grr, V_total);
    var ndcRaw = ndcInfo.raw, ndc = ndcInfo.ndc, ndcLabel = ndcInfo.label;

    /* Discriminacion: de que tamano es el escalon de lectura frente a lo que
       se esta midiendo, y si la repetibilidad llego siquiera a ser medible. */
    var cellList = [];
    operators.forEach(function (op) {
      parts.forEach(function (pt) { cellList.push(cell[op + '\u0000' + pt]); });
    });
    var disc = discrimination(cellList, all, V_grr, V_total, tol, k);

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
      ndc: ndc, ndcRaw: ndcRaw, ndcLabel: ndcLabel,
      discrimination: disc,
      inconclusive: disc.inconclusive,
      icc: icc,
      metrics: { pctStudyVar: pctSV, pctTolerance: pctPT, pctContribution: pctContrib },
      /* Sobre datos degenerados no se emite veredicto: no hay nada que juzgar,
         y un "Aceptable" o un "Monitor de cuarta clase" sobre cero informacion
         se leerian como conclusiones. Los numeros se siguen publicando; lo que
         se retira es la etiqueta que los califica. */
      assessment: disc.inconclusive
        ? { studyVar: null, tolerance: null, contribution: null, ndc: null, emp: null }
        : assess(pctSV, pctPT, pctContrib, ndc, icc),
      charts: buildChartData(operators, parts, cell, cellMean, cellRange, partMean, r),
      warnings: val.warnings.slice(),
      negativeComponents: negatives
    };

    /* Los de discriminacion van primero: si la repetibilidad no es medible,
       eso cambia como se lee todo lo demas de la pantalla. */
    discriminationWarnings(disc).forEach(function (w) { result.warnings.push(w); });

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

  /* ==========================================================================
   * DISCRIMINACION: que tan fino es el escalon que muestran los datos
   *
   * QUE PROBLEMA RESUELVE
   *
   * Var_GRR = 0 NO significa "instrumento deficiente". Puede salir de tres
   * situaciones distintas que en pantalla se veian identicas -- las tres daban
   * "%GRR = 0.00 %, Aceptable" -- y que exigen respuestas opuestas:
   *
   *   1. Instrumento extremadamente preciso. Su error real esta muy por debajo
   *      del escalon con que se registran las lecturas, asi que ninguna
   *      replica se mueve. El veredicto de aceptable es correcto.
   *   2. Cuantizacion gruesa: o el instrumento no resuelve mas fino, o los
   *      datos se redondearon antes de llegar aqui. Tampoco se mueve, pero por
   *      el motivo contrario.
   *   3. Datos degenerados. Todas las mediciones son el mismo numero. No hay
   *      informacion de ninguna clase.
   *
   * Nunca se puede observar una repetibilidad menor que el escalon con que se
   * anotaron las lecturas. Cuando ninguna replica se mueve, el cero que sale
   * no es una medicion: es una observacion CENSURADA. Publicarlo como
   * "0.00 %, Aceptable" presenta un no-estimado con la cara de un estimado.
   *
   * QUE ES -- Y QUE NO ES -- EL VALOR QUE SE INFIERE
   *
   * Es el ESCALON OBSERVADO EN LOS DATOS, tambien llamado aqui resolucion
   * aparente. NO es la resolucion nominal del instrumento y este modulo no
   * puede conocerla: los datos solo demuestran con que finura fueron
   * ANOTADOS. Un micrometro de 0.001 mm cuyas lecturas se exportaron
   * redondeadas a 0.01 mm produce un escalon observado de 0.01 mm, y eso es un
   * hecho sobre el archivo, no sobre el instrumento. Por eso el aviso habla de
   * "posible resolucion insuficiente O redondeo excesivo de los datos" y deja
   * la conclusion a quien conoce el equipo.
   *
   * COMO SE INFIERE, SIN PEDIRLE NADA AL USUARIO
   *
   * Es la minima diferencia no nula entre dos lecturas del MISMO OPERADOR
   * sobre la MISMA PIEZA en REPLICAS DISTINTAS. Esas dos lecturas comparten
   * todo salvo el acto de medir, asi que lo unico que puede separarlas es el
   * sistema de medicion. (Las replicas se toman en momentos distintos, y a
   * proposito: eso es justamente lo que la repetibilidad mide.)
   *
   * La minima diferencia entre mediciones CUALESQUIERA no sirve para esto. Si
   * ninguna celda varia, esa diferencia es la que hay entre dos PIEZAS, que no
   * dice nada del sistema de medicion. Medido: en un estudio con micrometro de
   * 0.001 mm sobre piezas repartidas en 2 mm, la minima diferencia global es
   * 0.222 -- 222 veces el escalon real -- y usarla levantaria una alarma sobre
   * un instrumento excelente. Cuando ninguna celda varia, el escalon
   * simplemente NO ES MEDIBLE, y eso es lo que se reporta.
   *
   * CONTRA QUE SE COMPARA EL 10 %
   *
   * Contra los DOS denominadores, cada uno cuando existe:
   *
   *   overStudyVar  = escalon / (k * sigma_total)   variacion del estudio,
   *                                                 con el k activo (6 o 5.15).
   *                                                 Siempre que sigma_total > 0.
   *   overTolerance = escalon / tol.width           solo si el usuario dio
   *                                                 LSL/USL o tolerancia
   *                                                 directa; si no, es null.
   *
   * El estado final es el PEOR de los dos: basta con que UNO supere el 10 %
   * para marcar 'gruesa' (un OR, no un AND). Un escalon que se come el 40 % de
   * la tolerancia es un problema aunque las piezas del estudio esten muy
   * dispersas y lo disimulen frente a la variacion del estudio, y al reves.
   * El aviso nombra cual o cuales de los dos criterios se rebaso, para que se
   * pueda comprobar. Sin tolerancia capturada solo se evalua el primero.
   *
   * UNIDADES
   *
   * V_grr y V_total son VARIANZAS (sigma cuadrada): salen de cuadrados medios
   * y de sumas de componentes de varianza, no de desviaciones estandar. Aqui
   * se convierten a sigma con una raiz antes de compararlas con el escalon,
   * que esta en unidades de medicion.
   * ========================================================================*/

  /* Criterio de discriminacion AIAG: el escalon de lectura no debe pasar del
     10 % de aquello contra lo que se mide. Esto SI es un criterio del manual. */
  var DISCRIMINATION_LIMIT = 0.10;

  /* Las dos constantes de abajo son PROTECCION NUMERICA, no criterios AIAG.
     No salen de ningun manual y no deben leerse como umbrales de calidad. */

  /* Var_GRR se considera cero cuando es esta fraccion de Var_Total o menos.
     No basta con "> 0": una cancelacion de sumas de cuadrados deja residuos
     del orden de 1e-30 que son ruido del punto flotante, y dividir entre
     ellos producia un NDC de quince cifras. */
  var ZERO_VARIANCE_RATIO = 1e-12;

  /* Dos lecturas se consideran iguales si difieren en menos que esta fraccion
     de la mayor magnitud del estudio. Dos numeros tecleados iguales dan dobles
     identicos, pero 10.3 - 10.2 no da 0.1 exacto, y sin esto una diferencia
     fantasma de 1e-17 pasaria por un escalon real. */
  var EQUALITY_EPS_RATIO = 1e-12;

  /* --------------------------------------------------------------------------
   * ndcOf(V_part, V_grr, V_total) - numero de categorias distintas.
   *
   * NDC = parte entera de 1.41 x sigma_pieza / sigma_GRR. Con Var_GRR en cero
   * o en el ruido del punto flotante ese cociente no significa nada: antes
   * salia null (y la tarjeta imprimia "inf") o un entero de quince cifras. Las
   * dos cosas se leen como "separa infinitas categorias", que es justo lo
   * contrario de lo que pasa: no es que separe infinito, es que no se puede
   * evaluar. Por encima de 100 el numero exacto tampoco aporta -- AIAG solo
   * pide 5 -- y sale de dividir entre una varianza practicamente nula, asi que
   * se publica como cota.
   *
   * Los tres argumentos son VARIANZAS.
   * ------------------------------------------------------------------------*/
  function ndcOf(V_part, V_grr, V_total) {
    var isZero = !(V_grr > V_total * ZERO_VARIANCE_RATIO);
    var raw = isZero ? Infinity : 1.41 * Math.sqrt(Math.max(0, V_part)) / Math.sqrt(V_grr);
    var ndc = isFinite(raw) ? Math.floor(raw) : null;
    return {
      raw: raw, ndc: ndc,
      label: ndc === null ? 'No evaluable' : (ndc > 100 ? '> 100' : String(ndc))
    };
  }

  /* --------------------------------------------------------------------------
   * discrimination(cells, values, V_grr, V_total, tol, k)
   *
   *   cells    [[replicas de una celda], ...] - una entrada por celda del diseno
   *   values   todas las mediciones del estudio, planas
   *   V_grr    VARIANZA del sistema de medicion
   *   V_total  VARIANZA total del estudio
   *   tol      objeto de resolveTolerance, o null si no se capturo ninguna
   *   k        multiplicador de la variacion del estudio (6 o 5.15)
   * ------------------------------------------------------------------------*/
  function discrimination(cells, values, V_grr, V_total, tol, k) {
    var i;
    var scale = 0;
    for (i = 0; i < values.length; i++) scale = Math.max(scale, Math.abs(values[i]));
    var eps = (scale || 1) * EQUALITY_EPS_RATIO;

    var sorted = values.slice().sort(function (a, b) { return a - b; });
    var distinct = sorted.length ? 1 : 0, last = sorted[0];
    for (i = 1; i < sorted.length; i++) {
      if (sorted[i] - last > eps) { distinct++; last = sorted[i]; }
    }

    /* El escalon: minima diferencia no nula entre replicas de una misma celda. */
    var step = Infinity, cellsWithSpread = 0;
    cells.forEach(function (v) {
      var s = v.slice().sort(function (a, b) { return a - b; }), moved = false;
      for (var t = 1; t < s.length; t++) {
        var d = s[t] - s[t - 1];
        if (d > eps) { moved = true; if (d < step) step = d; }
      }
      if (moved) cellsWithSpread++;
    });
    var measured = isFinite(step);

    var out = {
      distinctValues: distinct,
      measurements: values.length,
      cells: cells.length,
      cellsWithSpread: cellsWithSpread,
      zeroRangeCells: cells.length - cellsWithSpread,
      /* step: el escalon OBSERVADO EN LOS DATOS (resolucion aparente). No es
         la resolucion nominal del instrumento; ver el bloque de arriba. */
      step: measured ? step : null,
      stepSource: measured
        ? 'minima diferencia entre replicas distintas del mismo operador sobre la misma pieza'
        : 'no medible: ninguna replica difirio de otra',
      limit: DISCRIMINATION_LIMIT,
      overStudyVar: null, overTolerance: null,
      exceeds: [],
      /* Cuanto del % Study Variation explicaria por si sola la cuantizacion,
         tomandola como uniforme sobre un escalon (sigma ~ escalon / raiz 12).
         Es un orden de magnitud para leer el aviso, no una cota rigurosa: el
         denominador es el sigma_total observado, que ya incluye lo que el
         redondeo dejo pasar. */
      quantizationShare: null,
      state: 'ok', label: '', inconclusive: false
    };

    var sdTotal = Math.sqrt(Math.max(0, V_total));   // V_total es varianza
    if (measured) {
      if (sdTotal > 0) {
        out.overStudyVar = step / (k * sdTotal);
        out.quantizationShare = 100 * (step / Math.sqrt(12)) / sdTotal;
      }
      if (tol && tol.width > 0) out.overTolerance = step / tol.width;
      if (out.overStudyVar !== null && out.overStudyVar > DISCRIMINATION_LIMIT) {
        out.exceeds.push('variacion del estudio');
      }
      if (out.overTolerance !== null && out.overTolerance > DISCRIMINATION_LIMIT) {
        out.exceeds.push('tolerancia');
      }
    }

    if (distinct < 2) {
      out.state = 'degenerado';
      out.inconclusive = true;
      out.label = 'No concluyente';
    } else if (!measured) {
      out.state = 'censurado';
      out.label = 'Repetibilidad no medible';
    } else if (out.exceeds.length) {          // basta con que uno de los dos falle
      out.state = 'gruesa';
      out.label = 'Posible resolucion insuficiente o redondeo';
    } else {
      out.state = 'ok';
      out.label = 'Escalon observado adecuado';
    }
    return out;
  }

  /* Avisos de discriminacion. Se emiten SOLO cuando hay evidencia objetiva:
     un estudio con el escalon medido y chico no dice nada, que es el caso de
     casi todos. Ninguno acusa al instrumento por su cuenta: los datos no
     demuestran su resolucion nominal, solo con que finura se anotaron. */
  function discriminationWarnings(d) {
    var w = [], pc = function (x) { return (100 * x).toFixed(1) + ' %'; };
    if (d.state === 'degenerado') {
      w.push('Estudio no concluyente: los datos no contienen informacion suficiente para estimar ' +
        'la repetibilidad. Las ' + d.measurements + ' mediciones son el mismo valor, asi que no hay ' +
        'variacion de ninguna clase que repartir. Esto no dice que el instrumento sea bueno ni malo: ' +
        'dice que este estudio no lo evalua. Revisa que las piezas cubran el rango del proceso y que ' +
        'la captura no se haya rellenado con un solo numero.');
    } else if (d.state === 'censurado') {
      w.push('La repetibilidad no es medible con estos datos: en las ' + d.cells + ' celdas ' +
        'operador-pieza, ninguna replica difirio de otra. El %GRR de 0 % es una COTA, no un ' +
        'estimado: el error del sistema de medicion es menor que el escalon con que se anotaron ' +
        'las lecturas, pero el estudio no puede decir cuanto. Caben dos explicaciones y estos datos ' +
        'no las separan: un sistema mucho mas fino que ese escalon (bueno) o un escalon demasiado ' +
        'grueso para estas piezas (malo). Para distinguirlas hace falta la resolucion nominal del ' +
        'instrumento, o piezas que obliguen a la lectura a moverse.');
    } else if (d.state === 'gruesa') {
      var partes = [];
      if (d.overStudyVar !== null) partes.push(pc(d.overStudyVar) + ' de la variacion del estudio');
      if (d.overTolerance !== null) partes.push(pc(d.overTolerance) + ' de la tolerancia');
      w.push('Posible resolucion insuficiente o redondeo excesivo de los datos: el escalon mas fino ' +
        'observado entre replicas es ' + d.step.toPrecision(4) + ', que es ' + partes.join(' y ') +
        '. La regla de discriminacion AIAG pide que no pase del ' + (100 * d.limit).toFixed(0) +
        ' %, y aqui se rebasa contra ' + d.exceeds.join(' y ') + '. Los datos no dicen cual de las ' +
        'dos causas es: puede que el instrumento no resuelva mas fino, o que las lecturas se hayan ' +
        'anotado o exportado redondeadas. Comprueba con que resolucion se registro antes de ' +
        'concluir nada del equipo. En cualquiera de los dos casos el %GRR sale sesgado hacia abajo: ' +
        'parte del error de medicion se pierde en el redondeo.');
    }
    return w;
  }


  /* --- Clasificacion AIAG + clase de monitor EMP (Wheeler) --- */
  /* Bandas AIAG sobre la ESTIMACION PUNTUAL. Estas son las que dictaminan.
     Las fronteras son cerradas por arriba y por abajo en la banda condicional,
     y se escriben una sola vez aqui para que pantalla, impresion y pruebas no
     puedan divergir: 10.00 y 30.00 son CONDICIONAL, y solo lo estrictamente
     mayor que 30.00 es No aceptable. Lo mismo con 1.00 y 9.00 en contribucion.
     Antes de F-07 la contribucion usaba `< 9` y el criterio por intervalo
     usaba `<= 9`: en 9.00 exacto las dos tarjetas se contradecian. */
  function assess(pctSV, pctPT, pctContrib, ndc, icc) {
    function aiag(v) {
      if (v === null) return null;
      if (v < 10) return { level: 'ok',   label: 'Aceptable (menor que 10 %)' };
      if (v <= 30) return { level: 'warn', label: 'Condicional segun la aplicacion (10 a 30 %)' };
      return { level: 'bad', label: 'No aceptable (mayor que 30 %)' };
    }
    var empClass = icc >= 0.8 ? { level: 'ok',   label: 'Monitor de primera clase (ICC >= 0.80)' }
                 : icc >= 0.5 ? { level: 'warn', label: 'Monitor de segunda clase (0.50 <= ICC < 0.80)' }
                 : icc >= 0.2 ? { level: 'warn', label: 'Monitor de tercera clase (0.20 <= ICC < 0.50)' }
                 :              { level: 'bad',  label: 'Monitor de cuarta clase (ICC < 0.20)' };
    return {
      studyVar: aiag(pctSV),
      tolerance: aiag(pctPT),
      contribution: pctContrib === null ? null
                  : pctContrib < 1 ? { level: 'ok',   label: 'Aceptable (menor que 1 %)' }
                  : pctContrib <= 9 ? { level: 'warn', label: 'Condicional segun la aplicacion (1 a 9 %)' }
                  :                   { level: 'bad',  label: 'No aceptable (mayor que 9 %)' },
      ndc: ndc === null ? null
         : ndc >= 5 ? { level: 'ok',  label: 'NDC = ' + ndc + ' (>= 5)' }
                    : { level: 'bad', label: 'NDC = ' + ndc + ' (< 5)' },
      emp: empClass
    };
  }

  /* --- Series para las 6 graficas --- */
  function buildChartData(operators, parts, cell, cellMean, cellRange, partMean, r) {
    var labels = [], ranges = [], means = [], partSeq = [], groups = [];
    operators.forEach(function (op, oi) {
      groups.push({ label: op, from: oi * parts.length, to: (oi + 1) * parts.length - 1 });
      parts.forEach(function (pt) {
        labels.push(op + ' - ' + pt);              // conserva los nombres reales
        partSeq.push(pt);                          // eje de las cartas: solo la pieza
        ranges.push(cellRange[op + '\u0000' + pt]);
        means.push(cellMean[op + '\u0000' + pt]);
      });
    });
    var rBar = mean(ranges), xBar = mean(means);
    var c = CTRL[r] || null;

    return {
      labels: labels,
      /* Las cartas R y X-barra recorren operador por operador, pero su eje solo
         necesita la pieza: el operador se marca por bloques (como en Minitab),
         no repitiendo su nombre en cada punto. */
      partSequence: partSeq,
      operatorGroups: groups,
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
        return { operator: op, values: v, mean: mean(v), box: global.MSAStats.boxStats(v) };
      }),
      /* Rangos de cada celda operador-pieza, agrupados de las dos maneras que
         interesan: por operador dice quien repite peor, por pieza dice cual
         cuesta mas medir. Son los mismos rangos de la carta R, sin la
         secuencia. */
      rangesByOperator: operators.map(function (op) {
        var v = parts.map(function (pt) { return cellRange[op + '\u0000' + pt]; });
        return { label: op, values: v, mean: mean(v) };
      }),
      rangesByPart: parts.map(function (pt) {
        var v = operators.map(function (op) { return cellRange[op + '\u0000' + pt]; });
        return { label: pt, values: v, mean: mean(v) };
      }),
      constants: c
    };
  }

  /* assess, resolveTolerance, discrimination y discriminationWarnings se
     exportan porque el motor anidado (anova-nested.js) los usa tal cual: ni el
     criterio AIAG, ni la manera de resolver la tolerancia, ni el tamano del
     escalon de lectura dependen del diseno del estudio, y duplicarlos seria
     arriesgar que un metodo clasifique distinto que el otro. */
  global.MSAAnova = { compute: compute, validate: validate, CONTROL_CONSTANTS: CTRL,
                      assess: assess, resolveTolerance: resolveTolerance,
                      discrimination: discrimination,
                      discriminationWarnings: discriminationWarnings,
                      ndcOf: ndcOf,
                      DISCRIMINATION_LIMIT: DISCRIMINATION_LIMIT,
                      ZERO_VARIANCE_RATIO: ZERO_VARIANCE_RATIO };
})(typeof window !== 'undefined' ? window : globalThis);
