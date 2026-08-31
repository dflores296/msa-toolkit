/* ============================================================================
 * tests.js - Suite de regresion del motor ANOVA cruzado.
 * Corre igual en el navegador (tests/index.html) y en Node (node tests/run-node.js).
 * El arnes (test / near / assert / report) vive en harness.js, compartido con
 * la suite del motor anidado.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var test = global.MSATestKit.test, near = global.MSATestKit.near,
      assert = global.MSATestKit.assert;

  function rowOf(res, source) {
    var f = res.anova.filter(function (r) { return r.source === source; });
    if (!f.length) throw new Error('No existe la fila "' + source + '" en la tabla ANOVA');
    return f[0];
  }
  function fullRow(res, source) {
    return res.anovaFull.rows.filter(function (r) { return r.source === source; })[0];
  }

  /* --- Dataset del apendice del manual AIAG MSA 4a ed. (= gageaiag.mtw) --- */
  var AIAG_RAW = [
    [0.29, 0.41, 0.64, 0.08, 0.25, 0.07, 0.04, -0.11, -0.15],
    [-0.56, -0.68, -0.58, -0.47, -1.22, -0.68, -1.38, -1.13, -0.96],
    [1.34, 1.17, 1.27, 1.19, 0.94, 1.34, 0.88, 1.09, 0.67],
    [0.47, 0.50, 0.64, 0.01, 1.03, 0.20, 0.14, 0.20, 0.11],
    [-0.80, -0.92, -0.84, -0.56, -1.20, -1.28, -1.46, -1.07, -1.45],
    [0.02, -0.11, -0.21, -0.20, 0.22, 0.06, -0.29, -0.67, -0.49],
    [0.59, 0.75, 0.66, 0.47, 0.55, 0.83, 0.02, 0.01, 0.21],
    [-0.31, -0.20, -0.17, -0.63, 0.08, -0.34, -0.46, -0.56, -0.49],
    [2.26, 1.99, 2.01, 1.80, 2.12, 2.19, 1.77, 1.45, 1.87],
    [-1.36, -1.25, -1.31, -1.68, -1.62, -1.50, -1.49, -1.77, -2.16]
  ];
  function aiagRows() {
    var rows = [], ops = ['A', 'B', 'C'];
    AIAG_RAW.forEach(function (vals, i) {
      ops.forEach(function (op, oi) {
        for (var k = 0; k < 3; k++) {
          rows.push({ operator: op, part: 'Pieza ' + (i + 1), value: vals[oi * 3 + k] });
        }
      });
    });
    return rows;
  }
  /* ==========================================================================
   * F-01: Var_GRR = 0 no es un veredicto, es tres situaciones distintas.
   *
   * Las tres daban la misma pantalla ("%GRR 0.00 %, Aceptable, NDC inf") y
   * exigen respuestas opuestas. Estas pruebas fijan que se separen, y sobre
   * todo que el caso 1 -- instrumento excelente -- NO se degrade.
   * ========================================================================*/

  /* Cuantiza al paso del instrumento, que es lo que hace una lectura digital. */
  function quant(x, d) { return Math.round(x / d) * d; }

  /* Estudio 3 x 10 x 3 con piezas repartidas linealmente y ruido determinista. */
  function estudioResolucion(lo, hi, sigmaMs, delta) {
    var seed = 20260831;
    var rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    var nrm = function (m, sd) {
      return m + sd * Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    };
    var partTrue = [], i;
    for (i = 0; i < 10; i++) partTrue.push(lo + (hi - lo) * i / 9);
    var rows = [];
    ['A', 'B', 'C'].forEach(function (op) {
      partTrue.forEach(function (pv, p) {
        for (var k = 0; k < 3; k++) {
          rows.push({ operator: op, part: 'P' + (p + 1), value: quant(nrm(pv, sigmaMs), delta) });
        }
      });
    });
    return rows;
  }

  function estudioPlano(valor) {
    var rows = [];
    ['A', 'B', 'C'].forEach(function (op) {
      for (var p = 1; p <= 10; p++) for (var k = 0; k < 3; k++) {
        rows.push({ operator: op, part: 'P' + p, value: valor });
      }
    });
    return rows;
  }

  test('F-01 caso 1: instrumento muy preciso -> censurado, NO degradado', function () {
    /* Micrometro de 0.001 mm cuyo error real (0.00002) esta 50 veces por
       debajo de su propia resolucion: ninguna replica se mueve. El veredicto
       de aceptable es correcto y tiene que sobrevivir. */
    var r = MSAAnova.compute(estudioResolucion(9, 11, 0.00002, 0.001), { tolerance: 2.0 });
    var d = r.discrimination;
    assert(d.state === 'censurado', 'estado censurado, se obtuvo ' + d.state);
    assert(d.zeroRangeCells === d.cells, 'ninguna celda debe variar');
    assert(d.step === null, 'el escalon NO es medible con estos datos');
    assert(r.inconclusive === false, 'no es un estudio no concluyente: hay senal de pieza');
    /* Requisito 6: no se degrada ni se bloquea. */
    assert(r.assessment.studyVar && r.assessment.studyVar.level === 'ok',
           'el veredicto de aceptable se conserva');
    /* Requisito 5: no se acusa al instrumento de falta de resolucion. */
    var acusa = r.warnings.some(function (w) { return w.indexOf('falta de resolucion') >= 0; });
    assert(!acusa, 'no debe levantar alarma de resolucion sobre un instrumento excelente');
    /* Pero si se dice que el 0 % es una cota y no un estimado. */
    var dice = r.warnings.some(function (w) { return w.indexOf('no es medible') >= 0; });
    assert(dice, 'debe avisar que la repetibilidad no es medible');
  });

  test('F-01 caso 1: el min-diff GLOBAL sobreestimaria el escalon, por eso no se usa', function () {
    /* Es la razon de que el escalon se busque DENTRO de la celda y no entre
       mediciones cualesquiera: aqui la minima diferencia global es la que hay
       entre dos piezas (~0.22), 222 veces la resolucion real de 0.001, y
       usarla levantaria una alarma falsa sobre un instrumento excelente. */
    var rows = estudioResolucion(9, 11, 0.00002, 0.001);
    var vals = rows.map(function (x) { return x.value; }).sort(function (a, b) { return a - b; });
    var minGlobal = Infinity;
    for (var i = 1; i < vals.length; i++) {
      var g = vals[i] - vals[i - 1];
      if (g > 1e-12 && g < minGlobal) minGlobal = g;
    }
    assert(minGlobal > 0.2, 'la minima diferencia global es de escala de PIEZA (' + minGlobal + ')');
    assert(MSAAnova.compute(rows, {}).discrimination.step === null,
           'el motor no la confunde con un escalon de instrumento');
  });

  test('F-01 caso 2: cuantizacion gruesa -> se mide el escalon y se avisa', function () {
    /* Vernier de 0.02 mm sobre piezas repartidas en 0.03 mm. Aqui algunas
       celdas SI varian, asi que el escalon es medible y es un dato duro. */
    var r = MSAAnova.compute(estudioResolucion(10.00, 10.03, 0.002, 0.02), { tolerance: 0.05 });
    var d = r.discrimination;
    assert(d.state === 'gruesa', 'estado gruesa, se obtuvo ' + d.state);
    near(d.step, 0.02, 1e-9, 'el escalon medido es la resolucion real del vernier');
    assert(d.overTolerance > 0.10, 'el escalon pasa del 10 % de la tolerancia');
    assert(d.grrUpperBound > 0, 'publica la cota del %GRR');
    var avisa = r.warnings.some(function (w) { return w.indexOf('falta de resolucion') >= 0; });
    assert(avisa, 'debe avisar de la falta de resolucion');
  });

  test('F-01 caso 3: datos degenerados -> no concluyente y sin veredicto', function () {
    var r = MSAAnova.compute(estudioPlano(10), { tolerance: 0.5 });
    var d = r.discrimination;
    assert(d.state === 'degenerado', 'estado degenerado, se obtuvo ' + d.state);
    assert(d.distinctValues === 1, 'un solo valor distinto');
    assert(r.inconclusive === true, 'el estudio se marca como no concluyente');
    /* Requisito 7: el mensaje, tal cual. */
    var dice = r.warnings.some(function (w) {
      return w.indexOf('Estudio no concluyente: los datos no contienen informacion suficiente ' +
                       'para estimar la repetibilidad.') === 0;
    });
    assert(dice, 'debe reportar el caso degenerado con su mensaje');
    /* Y no se emite veredicto sobre cero informacion. */
    ['studyVar', 'tolerance', 'contribution', 'ndc', 'emp'].forEach(function (key) {
      assert(r.assessment[key] === null, 'no se califica ' + key + ' sobre datos degenerados');
    });
  });

  test('F-01 caso 4: el estudio normal no se entera de nada de esto', function () {
    /* Requisito 5 y 6: un instrumento fino con error real medible no debe
       recibir ningun aviso nuevo. Es el caso de casi todos los estudios. */
    var r = MSAAnova.compute(estudioResolucion(9, 11, 0.05, 0.001), { tolerance: 2.0 });
    assert(r.discrimination.state === 'ok', 'estado ok, se obtuvo ' + r.discrimination.state);
    assert(r.discrimination.zeroRangeCells === 0, 'todas las celdas varian');
    var nuevos = r.warnings.filter(function (w) {
      return /no concluyente|no es medible|falta de resolucion/.test(w);
    });
    assert(nuevos.length === 0, 'no debe agregar avisos: ' + nuevos.join(' | '));
  });

  test('F-01: NDC nunca imprime "inf" ni un numero absurdo', function () {
    /* Requisitos 1, 2 y 3. Antes: Var_GRR exactamente 0 daba ndc null y la
       tarjeta imprimia "inf"; Var_GRR en el ruido del punto flotante (2e-30,
       lo que deja una cancelacion de sumas de cuadrados) daba un entero de
       quince cifras. Las dos cosas se leen como "separa infinitas
       categorias", que es lo contrario de lo que pasa. */
    var casos = [
      estudioPlano(10),                                  // Var_GRR = 0 exacto
      estudioResolucion(9, 11, 0.00002, 0.001),          // Var_GRR = 2.1e-30
      estudioResolucion(10.00, 10.03, 0.002, 0.02),      // Var_GRR normal chico
      aiagRows()                                         // Var_GRR normal
    ];
    casos.forEach(function (rows, i) {
      var r = MSAAnova.compute(rows, {});
      assert(typeof r.ndcLabel === 'string' && r.ndcLabel.length > 0, 'caso ' + i + ': falta ndcLabel');
      assert(!/inf/i.test(r.ndcLabel), 'caso ' + i + ': ndcLabel dice "' + r.ndcLabel + '"');
      assert(!/\d{4,}/.test(r.ndcLabel), 'caso ' + i + ': numero absurdo "' + r.ndcLabel + '"');
      if (r.ndc === null) assert(r.ndcLabel === 'No evaluable', 'caso ' + i + ': deberia decir No evaluable');
    });
    near(MSAAnova.compute(aiagRows(), {}).ndc, 4, 0, 'el NDC del dataset AIAG no cambia');
    assert(MSAAnova.compute(aiagRows(), {}).ndcLabel === '4', 'y su etiqueta es "4"');
  });

  test('F-01: el dataset AIAG no cambia ni un digito y no gana avisos', function () {
    var r = MSAAnova.compute(aiagRows(), { alpha: 0.25 });
    near(r.metrics.pctContribution, 7.76, 0.005, '% Contribucion');
    near(r.metrics.pctStudyVar, 27.86, 0.005, '% Study Variation');
    assert(r.discrimination.state === 'ok', 'discriminacion ok');
    assert(r.inconclusive === false, 'no es no concluyente');
    var nuevos = r.warnings.filter(function (w) {
      return /no concluyente|no es medible|falta de resolucion/.test(w);
    });
    assert(nuevos.length === 0, 'sin avisos nuevos sobre el dataset de referencia');
  });

  global.AIAG_ROWS = aiagRows;

  /* ---------------------------------------------------------------------- *
   * 1. Tabla ANOVA contra los valores publicados por Minitab
   * ---------------------------------------------------------------------- */
  test('AIAG: sumas de cuadrados coinciden con Minitab', function () {
    var res = MSAAnova.compute(aiagRows());
    near(fullRow(res, 'Parte').ss, 88.3619, 5e-4, 'SS Parte');
    near(fullRow(res, 'Operador').ss, 3.1673, 5e-4, 'SS Operador');
    near(fullRow(res, 'Operador * Parte').ss, 0.3590, 5e-4, 'SS Interaccion');
    near(fullRow(res, 'Repetibilidad').ss, 2.7589, 5e-4, 'SS Repetibilidad');
    near(fullRow(res, 'Total').ss, 94.6471, 5e-4, 'SS Total');
  });

  test('AIAG: la descomposicion cierra (SS_Total = suma de componentes)', function () {
    var res = MSAAnova.compute(aiagRows());
    assert(res.anovaFull.decompositionError < 1e-12,
      'error de descomposicion = ' + res.anovaFull.decompositionError);
  });

  test('AIAG: grados de libertad', function () {
    var res = MSAAnova.compute(aiagRows());
    near(fullRow(res, 'Parte').df, 9, 0, 'gl Parte');
    near(fullRow(res, 'Operador').df, 2, 0, 'gl Operador');
    near(fullRow(res, 'Operador * Parte').df, 18, 0, 'gl Interaccion');
    near(fullRow(res, 'Repetibilidad').df, 60, 0, 'gl Repetibilidad');
    near(fullRow(res, 'Total').df, 89, 0, 'gl Total');
  });

  test('AIAG: cuadrados medios', function () {
    var res = MSAAnova.compute(aiagRows());
    near(fullRow(res, 'Parte').ms, 9.81799, 1e-4, 'MS Parte');
    near(fullRow(res, 'Operador').ms, 1.58363, 1e-4, 'MS Operador');
    near(fullRow(res, 'Operador * Parte').ms, 0.01994, 1e-4, 'MS Interaccion');
    near(fullRow(res, 'Repetibilidad').ms, 0.04598, 1e-4, 'MS Repetibilidad');
  });

  test('AIAG: prueba F de la interaccion (F = 0.434, p = 0.974)', function () {
    var res = MSAAnova.compute(aiagRows());
    near(res.interactionTest.f, 0.434, 2e-3, 'F interaccion');
    near(res.interactionTest.p, 0.974, 2e-3, 'p interaccion');
  });

  test('AIAG: con alfa = 0.25 se agrupa la interaccion (modelo reducido)', function () {
    var res = MSAAnova.compute(aiagRows(), { alpha: 0.25 });
    assert(res.model === 'without-interaction', 'modelo = ' + res.model);
    near(rowOf(res, 'Repetibilidad').df, 78, 0, 'gl repetibilidad agrupada');
    near(rowOf(res, 'Repetibilidad').ss, 3.1179, 5e-4, 'SS repetibilidad agrupada');
    near(rowOf(res, 'Repetibilidad').ms, 0.03997, 1e-4, 'MS repetibilidad agrupada');
  });

  test('AIAG: F de efectos principales usa MS_interaccion como denominador (Minitab)', function () {
    var res = MSAAnova.compute(aiagRows(), { interaction: 'include' });
    near(rowOf(res, 'Parte').f, 492.291, 0.2, 'F Parte');
    near(rowOf(res, 'Operador').f, 79.406, 0.2, 'F Operador');
  });

  test('AIAG: opcion fDenominator = repeatability (ejemplo AIAG p.127)', function () {
    var res = MSAAnova.compute(aiagRows(), { interaction: 'include', fDenominator: 'repeatability' });
    near(rowOf(res, 'Parte').f, 9.81799 / 0.04598, 0.5, 'F Parte con MS_rep');
  });

  /* ---------------------------------------------------------------------- *
   * 2. Componentes de varianza y metricas
   * ---------------------------------------------------------------------- */
  function comp(res, key) {
    return res.components.filter(function (c) { return c.key === key; })[0];
  }

  test('AIAG: componentes de varianza (modelo sin interaccion)', function () {
    var res = MSAAnova.compute(aiagRows(), { alpha: 0.25 });
    near(comp(res, 'grr').variance, 0.09143, 5e-5, 'VarComp Gage R&R');
    near(comp(res, 'rep').variance, 0.03997, 5e-5, 'VarComp Repetibilidad');
    near(comp(res, 'repro').variance, 0.05146, 5e-5, 'VarComp Reproducibilidad');
    near(comp(res, 'part').variance, 1.08647, 5e-4, 'VarComp Pieza a pieza');
  });

  test('AIAG: %Contribucion publicado por Minitab', function () {
    var res = MSAAnova.compute(aiagRows(), { alpha: 0.25 });
    near(100 * comp(res, 'grr').pctContribution, 7.76, 0.02, '%Contrib Gage R&R');
    near(100 * comp(res, 'rep').pctContribution, 3.39, 0.02, '%Contrib Repetibilidad');
    near(100 * comp(res, 'repro').pctContribution, 4.37, 0.02, '%Contrib Reproducibilidad');
    near(100 * comp(res, 'part').pctContribution, 92.24, 0.02, '%Contrib Pieza a pieza');
  });

  test('AIAG: %Study Variation publicado por Minitab', function () {
    var res = MSAAnova.compute(aiagRows(), { alpha: 0.25 });
    near(100 * comp(res, 'grr').pctStudyVar, 27.86, 0.02, '%SV Gage R&R');
    near(100 * comp(res, 'rep').pctStudyVar, 18.42, 0.02, '%SV Repetibilidad');
    near(100 * comp(res, 'repro').pctStudyVar, 20.90, 0.02, '%SV Reproducibilidad');
    near(100 * comp(res, 'part').pctStudyVar, 96.04, 0.03, '%SV Pieza a pieza');
  });

  test('AIAG: %Contribucion suma exactamente 100 %', function () {
    var res = MSAAnova.compute(aiagRows());
    var s = 0;
    res.components.forEach(function (c) {
      if (c.key !== 'total' && c.key !== 'repro' && c.key !== 'grr') s += c.pctContribution;
    });
    near(100 * s, 100, 1e-9, 'suma de %Contribucion de las componentes elementales');
  });

  test('AIAG: NDC = 4', function () {
    var res = MSAAnova.compute(aiagRows(), { alpha: 0.25 });
    near(res.ndc, 4, 0, 'NDC');
  });

  test('AIAG: la variacion total del estudio es 6 * sigma_total', function () {
    var res = MSAAnova.compute(aiagRows(), { alpha: 0.25 });
    var t = comp(res, 'total');
    near(t.studyVar, 6 * t.stdDev, 1e-12, 'StudyVar total');
    near(t.pctStudyVar, 1, 1e-12, '%SV total');
  });

  test('multiplicador 5.15 (AIAG 3a ed.) escala solo Study Variation', function () {
    var a = MSAAnova.compute(aiagRows(), { studyVarMultiplier: 6 });
    var b = MSAAnova.compute(aiagRows(), { studyVarMultiplier: 5.15 });
    near(comp(b, 'grr').variance, comp(a, 'grr').variance, 1e-12, 'VarComp invariante');
    near(comp(b, 'grr').pctStudyVar, comp(a, 'grr').pctStudyVar, 1e-12, '%SV invariante');
    near(comp(b, 'grr').studyVar, 5.15 * comp(a, 'grr').stdDev, 1e-12, 'StudyVar escalado');
  });

  test('%Tolerance usa USL - LSL y el multiplicador activo', function () {
    var res = MSAAnova.compute(aiagRows(), { lsl: -5, usl: 5, alpha: 0.25 });
    near(res.tolerance, 10, 1e-12, 'tolerancia');
    near(comp(res, 'grr').pctTolerance, comp(res, 'grr').studyVar / 10, 1e-12, '%Tol Gage R&R');
    near(res.metrics.pctTolerance, 100 * comp(res, 'grr').studyVar / 10, 1e-9, 'metrica %Tol');
  });

  test('tolerance explicita tiene prioridad sobre USL - LSL', function () {
    var res = MSAAnova.compute(aiagRows(), { lsl: -5, usl: 5, tolerance: 4 });
    near(res.tolerance, 4, 1e-12, 'tolerancia');
  });

  test('tolerancia invalida (USL <= LSL) se ignora en vez de romper', function () {
    var res = MSAAnova.compute(aiagRows(), { lsl: 5, usl: 5 });
    assert(res.tolerance === null, 'tolerancia deberia ser null');
    assert(res.metrics.pctTolerance === null, '%Tolerance deberia ser null');
  });

  /* --- Especificaciones unilaterales --- */
  test('unilateral superior: margen = USL - centro, media dispersion', function () {
    var res = MSAAnova.compute(aiagRows(), { usl: 5, alpha: 0.25 });
    assert(res.toleranceInfo.oneSided === true, 'deberia marcarse como unilateral');
    assert(res.toleranceInfo.mode === 'unilateral-superior', 'modo: ' + res.toleranceInfo.mode);
    near(res.toleranceInfo.width, 5 - res.design.grandMean, 1e-12, 'margen');
    var g = comp(res, 'grr');
    near(g.pctTolerance, (g.studyVar / 2) / (5 - res.design.grandMean), 1e-12, '%Tol unilateral');
    near(res.metrics.pctTolerance, 100 * g.pctTolerance, 1e-9, 'metrica coherente con la tabla');
  });

  test('unilateral inferior: margen = centro - LSL', function () {
    var res = MSAAnova.compute(aiagRows(), { lsl: -5, alpha: 0.25 });
    assert(res.toleranceInfo.mode === 'unilateral-inferior', 'modo: ' + res.toleranceInfo.mode);
    near(res.toleranceInfo.width, res.design.grandMean - (-5), 1e-12, 'margen');
    var g = comp(res, 'grr');
    near(g.pctTolerance, (g.studyVar / 2) / (res.design.grandMean + 5), 1e-12, '%Tol unilateral');
  });

  test('unilateral y bilateral coinciden cuando el centro esta a la mitad', function () {
    // Si el proceso esta centrado, medio margen es la mitad de la ventana completa,
    // asi que ambas convenciones deben dar el mismo %Tolerance.
    var res2 = MSAAnova.compute(aiagRows(), { lsl: -5, usl: 5, alpha: 0.25 });
    var mu = res2.design.grandMean;
    var res1 = MSAAnova.compute(aiagRows(), { usl: mu + 5, processMean: mu, alpha: 0.25 });
    near(res1.metrics.pctTolerance, res2.metrics.pctTolerance, 1e-9,
      '%Tolerance unilateral vs bilateral con proceso centrado');
  });

  test('unilateral: processMean explicito manda sobre la media del estudio', function () {
    var res = MSAAnova.compute(aiagRows(), { usl: 5, processMean: 0, alpha: 0.25 });
    near(res.toleranceInfo.width, 5, 1e-12, 'margen con centro fijado en 0');
    assert(res.toleranceInfo.centerFromStudy === false, 'no deberia venir del estudio');
  });

  test('unilateral: avisa del criterio usado y de donde salio el centro', function () {
    var res = MSAAnova.compute(aiagRows(), { usl: 5, alpha: 0.25 });
    var w = res.warnings.join(' | ');
    assert(w.indexOf('unilateral') >= 0, 'falta el aviso de unilateral');
    assert(w.indexOf('media del estudio') >= 0, 'falta el aviso del centro');
  });

  test('unilateral imposible (limite del lado equivocado) se ignora', function () {
    // USL por debajo del centro del proceso: el margen seria negativo.
    var res = MSAAnova.compute(aiagRows(), { usl: -99, alpha: 0.25 });
    assert(res.tolerance === null, 'no deberia haber tolerancia');
    assert(res.metrics.pctTolerance === null, '%Tolerance deberia ser null');
  });

  test('tolerancia directa gana sobre un limite unilateral', function () {
    var res = MSAAnova.compute(aiagRows(), { usl: 5, tolerance: 8, alpha: 0.25 });
    assert(res.toleranceInfo.mode === 'directa', 'modo: ' + res.toleranceInfo.mode);
    assert(res.toleranceInfo.oneSided === false, 'la directa se trata como bilateral');
    near(res.toleranceInfo.width, 8, 1e-12, 'ancho');
  });

  /* ---------------------------------------------------------------------- *
   * 3. Los errores concretos del motor VBA
   * ---------------------------------------------------------------------- */
  test('BUG-1/2: SS_Parte incluye el factor de replicas (o * r)', function () {
    var res = MSAAnova.compute(aiagRows());
    // El VBA multiplicaba solo por o = 3; el valor correcto es o*r = 9 veces la suma.
    near(fullRow(res, 'Parte').ss, 88.3619, 5e-4, 'SS Parte');
    assert(Math.abs(fullRow(res, 'Parte').ss - 88.3619 / 3) > 1,
      'SS Parte reproduce el bug del VBA (dividido entre r)');
  });

  test('BUG-4: Var_interaccion se divide entre r', function () {
    // Diseno con interaccion real y grande: el VBA la sobreestimaba r veces.
    var rows = [];
    var shift = { A: 0, B: 1 };
    ['A', 'B'].forEach(function (op) {
      for (var i = 1; i <= 6; i++) {
        var inter = (i % 2 === 0 ? 1 : -1) * shift[op] * 2;
        for (var k = 0; k < 3; k++) {
          rows.push({ operator: op, part: 'P' + i, value: i + inter + (k - 1) * 0.01 });
        }
      }
    });
    var res = MSAAnova.compute(rows, { interaction: 'include' });
    var msInt = fullRow(res, 'Operador * Parte').ms;
    var msRep = fullRow(res, 'Repetibilidad').ms;
    near(res.variance.interaction, (msInt - msRep) / 3, 1e-9, 'Var interaccion');
  });

  test('BUG-5: no hay redondeo intermedio de las medias', function () {
    // Mediciones con muchos decimales significativos: el VBA redondeaba las
    // medias a 6 dp, lo que en escalas pequenas destruia el componente del gage.
    var rows = [], base = 0.1234567;
    ['A', 'B'].forEach(function (op, oi) {
      for (var i = 1; i <= 5; i++) {
        for (var k = 0; k < 3; k++) {
          rows.push({ operator: op, part: 'P' + i, value: base + i * 1e-6 + oi * 1e-7 + k * 1e-8 });
        }
      }
    });
    var res = MSAAnova.compute(rows);
    assert(res.variance.total > 0, 'la varianza total se anulo por redondeo');
    assert(res.variance.repeatability > 0, 'la repetibilidad se anulo por redondeo');
  });

  test('BUG-8: las etiquetas conservan los nombres reales de las piezas', function () {
    var rows = [];
    ['Ana', 'Luis'].forEach(function (op) {
      ['Serie-XA', 'Serie-XB', 'Serie-XC'].forEach(function (pt) {
        for (var k = 0; k < 2; k++) rows.push({ operator: op, part: pt, value: Math.random() + pt.length });
      });
    });
    var res = MSAAnova.compute(rows);
    assert(res.charts.labels.indexOf('Ana - Serie-XA') === 0,
      'etiqueta inesperada: ' + res.charts.labels[0]);
    assert(res.charts.partMeans.labels.join(',') === 'Serie-XA,Serie-XB,Serie-XC',
      'los nombres de pieza se perdieron');
  });

  test('BUG-9: constantes de carta disponibles mas alla de 10 replicas', function () {
    assert(MSAAnova.CONTROL_CONSTANTS[12], 'faltan constantes para 12 replicas');
    assert(MSAAnova.CONTROL_CONSTANTS[25], 'faltan constantes para 25 replicas');
    assert(!MSAAnova.CONTROL_CONSTANTS[26], 'no deberia haber constantes para 26');
  });

  test('cartas R y X-barra usan D3/D4/A2 del numero de replicas correcto', function () {
    var res = MSAAnova.compute(aiagRows());
    var c = MSAAnova.CONTROL_CONSTANTS[3];
    var ch = res.charts;
    near(ch.rChart.ucl, c.D4 * ch.rChart.center, 1e-12, 'LCS carta R');
    near(ch.rChart.lcl, c.D3 * ch.rChart.center, 1e-12, 'LCI carta R');
    near(ch.xbarChart.ucl, ch.xbarChart.center + c.A2 * ch.rChart.center, 1e-12, 'LCS carta X-barra');
    near(ch.xbarChart.lcl, ch.xbarChart.center - c.A2 * ch.rChart.center, 1e-12, 'LCI carta X-barra');
  });

  /* ---------------------------------------------------------------------- *
   * 4. Validacion de entrada
   * ---------------------------------------------------------------------- */
  function expectFail(rows, fragment) {
    var v = MSAAnova.validate(rows);
    assert(!v.ok, 'se esperaba fallo de validacion');
    assert(v.errors.join(' | ').toLowerCase().indexOf(fragment.toLowerCase()) >= 0,
      'error inesperado: ' + v.errors.join(' | '));
  }

  test('validacion: rechaza diseno desbalanceado', function () {
    var rows = [];
    ['A', 'B'].forEach(function (op) {
      ['P1', 'P2'].forEach(function (pt) {
        var n = (op === 'A' && pt === 'P1') ? 3 : 2;
        for (var k = 0; k < n; k++) rows.push({ operator: op, part: pt, value: k + 1 });
      });
    });
    expectFail(rows, 'desbalanceado');
  });

  test('validacion: rechaza celdas faltantes', function () {
    var rows = [
      { operator: 'A', part: 'P1', value: 1 }, { operator: 'A', part: 'P1', value: 2 },
      { operator: 'A', part: 'P2', value: 3 }, { operator: 'A', part: 'P2', value: 4 },
      { operator: 'B', part: 'P1', value: 5 }, { operator: 'B', part: 'P1', value: 6 }
    ];
    expectFail(rows, 'incompleto');
  });

  test('validacion: rechaza mediciones no numericas', function () {
    expectFail([
      { operator: 'A', part: 'P1', value: 'abc' }, { operator: 'A', part: 'P1', value: 2 },
      { operator: 'B', part: 'P1', value: 3 }, { operator: 'B', part: 'P1', value: 4 }
    ], 'no es un numero');
  });

  test('validacion: rechaza una sola replica', function () {
    expectFail([
      { operator: 'A', part: 'P1', value: 1 }, { operator: 'A', part: 'P2', value: 2 },
      { operator: 'B', part: 'P1', value: 3 }, { operator: 'B', part: 'P2', value: 4 }
    ], 'replicas');
  });

  test('validacion: rechaza un solo operador', function () {
    expectFail([
      { operator: 'A', part: 'P1', value: 1 }, { operator: 'A', part: 'P1', value: 2 },
      { operator: 'A', part: 'P2', value: 3 }, { operator: 'A', part: 'P2', value: 4 }
    ], 'operadores');
  });

  test('validacion: avisa cuando NDC < 5', function () {
    // Gage ruidoso frente a piezas casi identicas.
    var rows = [], seed = 42;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; }
    ['A', 'B', 'C'].forEach(function (op) {
      for (var i = 1; i <= 10; i++) {
        for (var k = 0; k < 3; k++) rows.push({ operator: op, part: 'P' + i, value: i * 0.01 + rnd() });
      }
    });
    var res = MSAAnova.compute(rows);
    assert(res.ndc < 5, 'NDC = ' + res.ndc + ', se esperaba < 5');
    assert(res.warnings.join(' ').indexOf('NDC') >= 0, 'falta el aviso de NDC');
  });

  test('componente negativo se trunca a cero y se registra', function () {
    // Sin efecto de operador: MS_Operador queda por debajo del error.
    var rows = [], seed = 7;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; }
    ['A', 'B', 'C'].forEach(function (op) {
      for (var i = 1; i <= 8; i++) {
        for (var k = 0; k < 3; k++) rows.push({ operator: op, part: 'P' + i, value: i + rnd() });
      }
    });
    var res = MSAAnova.compute(rows);
    res.components.forEach(function (c) {
      assert(c.variance >= 0, 'componente negativo publicado: ' + c.source + ' = ' + c.variance);
    });
  });

  /* ---------------------------------------------------------------------- *
   * 5. Propiedades generales sobre datos aleatorios
   * ---------------------------------------------------------------------- */
  test('propiedad: la descomposicion cierra en 200 disenos aleatorios', function () {
    var seed = 12345;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; }
    for (var t = 0; t < 200; t++) {
      var nOp = 2 + (t % 3), nPart = 3 + (t % 8), nRep = 2 + (t % 3);
      var rows = [];
      for (var a = 0; a < nOp; a++) {
        for (var b = 0; b < nPart; b++) {
          for (var k = 0; k < nRep; k++) {
            rows.push({ operator: 'Op' + a, part: 'P' + b, value: b * 2 + a * 0.3 + rnd() });
          }
        }
      }
      var res = MSAAnova.compute(rows);
      assert(res.anovaFull.decompositionError < 1e-10,
        'diseno ' + nPart + 'x' + nOp + 'x' + nRep + ': error ' + res.anovaFull.decompositionError);
      var s = res.variance.repeatability + res.variance.operator +
              res.variance.interaction + res.variance.part;
      near(s, res.variance.total, 1e-12, 'las componentes suman la varianza total');
      assert(res.metrics.pctStudyVar >= 0 && res.metrics.pctStudyVar <= 100.0000001,
        '%StudyVar fuera de rango: ' + res.metrics.pctStudyVar);
    }
  });

  test('propiedad: invariante ante traslacion de escala (sumar una constante)', function () {
    var a = MSAAnova.compute(aiagRows());
    var b = MSAAnova.compute(aiagRows().map(function (r) {
      return { operator: r.operator, part: r.part, value: r.value + 1000 };
    }));
    near(b.variance.grr, a.variance.grr, 1e-9, 'Gage R&R invariante a traslacion');
    near(b.metrics.pctStudyVar, a.metrics.pctStudyVar, 1e-9, '%SV invariante a traslacion');
  });

  test('propiedad: escalado multiplicativo escala las desviaciones estandar', function () {
    var a = MSAAnova.compute(aiagRows());
    var b = MSAAnova.compute(aiagRows().map(function (r) {
      return { operator: r.operator, part: r.part, value: r.value * 10 };
    }));
    near(b.variance.grr, a.variance.grr * 100, 1e-6, 'varianza escala x100');
    near(b.metrics.pctStudyVar, a.metrics.pctStudyVar, 1e-9, '%SV invariante a escala');
  });

  test('propiedad: el orden de las filas no cambia el resultado', function () {
    var rows = aiagRows();
    var shuffled = rows.slice().reverse();
    var a = MSAAnova.compute(rows), b = MSAAnova.compute(shuffled);
    near(b.variance.grr, a.variance.grr, 1e-12, 'Gage R&R');
    near(b.variance.part, a.variance.part, 1e-12, 'Pieza a pieza');
  });

  test('ICC = varianza de pieza / varianza total', function () {
    var res = MSAAnova.compute(aiagRows());
    near(res.icc, res.variance.part / res.variance.total, 1e-12, 'ICC');
    assert(res.assessment.emp.label.indexOf('primera clase') >= 0,
      'clase EMP inesperada: ' + res.assessment.emp.label);
  });

  test('distribucion F: valores de referencia', function () {
    near(MSAStats.fSurvival(1, 10, 10), 0.5, 1e-6, 'p(F=1; 10,10)');
    near(MSAStats.fSurvival(4.9646, 1, 10), 0.05, 1e-4, 'p(F=4.9646; 1,10)');
    near(MSAStats.fSurvival(2.7109, 5, 20), 0.05, 1e-4, 'p(F=2.7109; 5,20)');
    near(MSAStats.fSurvival(2.9782, 10, 10), 0.05, 1e-4, 'p(F=2.9782; 10,10)');
    near(MSAStats.fSurvival(1.7784, 18, 60), 0.05, 1e-4, 'p(F=1.7784; 18,60)');
    near(MSAStats.fSurvival(2.0022, 9, 78), 0.05, 1e-4, 'p(F=2.0022; 9,78)');
    near(MSAStats.fSurvival(0.4337, 18, 60), 0.974113, 1e-5, 'p(F=0.4337; 18,60)');
    near(MSAStats.fSurvival(0, 5, 20), 1, 1e-12, 'p(F=0)');
  });

  /* ---------------------------------------------------------------------- *
   * Cuartiles y resumen de caja
   * ---------------------------------------------------------------------- */
  test('cuartiles: convencion (n+1)p de Minitab', function () {
    var v = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    // (n+1)p = 2.75 -> 2 + 0.75*(3-2) = 2.75 ; mediana 5.5 ; Q3 en 8.25
    near(MSAStats.quantile(v, 0.25), 2.75, 1e-12, 'Q1');
    near(MSAStats.quantile(v, 0.5), 5.5, 1e-12, 'mediana');
    near(MSAStats.quantile(v, 0.75), 8.25, 1e-12, 'Q3');
  });

  test('resumen de caja: bigotes a 1.5 RIC y atipicos aparte', function () {
    var b = MSAStats.boxStats([1, 2, 3, 4, 5, 6, 7, 8, 9, 100]);
    assert(b.outliers.length === 1 && b.outliers[0] === 100, 'el 100 debe salir como atipico');
    near(b.whiskerHigh, 9, 1e-12, 'bigote superior');
    near(b.whiskerLow, 1, 1e-12, 'bigote inferior');
    assert(b.q1 < b.median && b.median < b.q3, 'Q1 < mediana < Q3');
    near(b.n, 10, 0, 'n');
  });

  test('resumen de caja: ordena la entrada y no la muta', function () {
    var v = [5, 1, 3];
    var b = MSAStats.boxStats(v);
    near(b.median, 3, 1e-12, 'mediana');
    assert(v[0] === 5 && v[1] === 1 && v[2] === 3, 'el arreglo original no debe cambiar');
  });

  test('graficas: rangos por operador y por pieza salen de los mismos datos', function () {
    var res = MSAAnova.compute(aiagRows(), { alpha: 0.25 });
    var ch = res.charts;
    assert(ch.rangesByOperator.length === 3, 'tres operadores');
    assert(ch.rangesByPart.length === 10, 'diez piezas');
    assert(ch.rangesByOperator[0].values.length === 10, 'cada operador trae un rango por pieza');
    assert(ch.rangesByPart[0].values.length === 3, 'cada pieza trae un rango por operador');
    var sumOp = 0, sumPt = 0;
    ch.rangesByOperator.forEach(function (g) { g.values.forEach(function (v) { sumOp += v; }); });
    ch.rangesByPart.forEach(function (g) { g.values.forEach(function (v) { sumPt += v; }); });
    near(sumOp, sumPt, 1e-12, 'las dos agrupaciones cubren los mismos 30 rangos');
    near(sumOp / 30, ch.rChart.center, 1e-12, 'su promedio es el R promedio de la carta R');
  });

  test('graficas: cada operador trae su resumen de caja', function () {
    var res = MSAAnova.compute(aiagRows(), { alpha: 0.25 });
    res.charts.byOperator.forEach(function (o) {
      assert(o.box && o.box.n === o.values.length, 'falta la caja de ' + o.operator);
      assert(o.box.whiskerLow <= o.box.q1 && o.box.q3 <= o.box.whiskerHigh, 'bigotes fuera de la caja');
    });
  });

  /* Los tests ya corrieron al cargar el archivo. El resumen lo publica
     MSATestKit.report(), que dispara quien carga todas las suites. */
})(typeof window !== 'undefined' ? window : globalThis);
