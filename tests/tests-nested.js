/* ============================================================================
 * tests-nested.js - Suite de regresion del motor ANOVA anidado.
 *
 * COMO SE VALIDA ESTE MOTOR
 *
 * El caso de referencia del motor cruzado es el dataset del apendice del
 * manual AIAG MSA 4a ed. (= gageaiag.mtw de Minitab), con valores publicados.
 * Para el anidado se usan las MISMAS mediciones con las piezas renumeradas de
 * 1 a 30, de modo que ninguna pieza la miden dos operadores. Eso convierte el
 * layout en un anidado balanceado de 3 x 10 x 3.
 *
 * El valor esperado no se inventa: sale de una identidad algebraica exacta del
 * ANOVA balanceado. Si se anidan las piezas dentro del operador,
 *
 *     cellMean - opMean = (partMean - grand) + (cellMean - opMean - partMean + grand)
 *
 * y al elevar al cuadrado y sumar sobre operadores y piezas el termino cruzado
 * se anula (para una pieza fija, los residuos de interaccion suman cero sobre
 * los operadores). De ahi:
 *
 *     SC_Operador(anidado)        = SC_Operador(cruzado)          = 3.1673
 *     SC_Pieza(Operador)          = SC_Pieza + SC_Interaccion     = 88.3619 + 0.3590
 *     SC_Repetibilidad(anidado)   = SC_Repetibilidad(cruzado)     = 2.7589
 *     gl_Pieza(Operador) = o(n-1) = 27 = 9 + 18 = gl_Pieza + gl_Interaccion
 *
 * Las cuatro cantidades de la derecha son las publicadas por Minitab y ya
 * verificadas en tests.js. La identidad se prueba dos veces: contra las
 * constantes publicadas y contra lo que calcula el motor cruzado en vivo.
 *
 * Ademas hay un caso construido a mano, con componentes de varianza exactos y
 * verificables con lapiz, para que la validacion no dependa solo del cruzado.
 *
 * PENDIENTE: un dataset destructivo publicado con resultados (CeramicComponent
 * de Minitab, o el ejemplo de destructivas del manual AIAG). Ver
 * docs/plan-siguientes-metodos.md.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var test = global.MSATestKit.test, near = global.MSATestKit.near,
      assert = global.MSATestKit.assert;

  /* --- Mismas mediciones del apendice AIAG, piezas renumeradas 1..30 --- */
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
  var OPS = ['A', 'B', 'C'];

  function nestedRows() {
    var rows = [];
    OPS.forEach(function (op, oi) {
      for (var i = 0; i < 10; i++) {
        for (var k = 0; k < 3; k++) {
          rows.push({ operator: op, part: 'Pieza ' + (oi * 10 + i + 1), value: AIAG_RAW[i][oi * 3 + k] });
        }
      }
    });
    return rows;
  }
  function crossedRows() {
    var rows = [];
    OPS.forEach(function (op, oi) {
      for (var i = 0; i < 10; i++) {
        for (var k = 0; k < 3; k++) {
          rows.push({ operator: op, part: 'Pieza ' + (i + 1), value: AIAG_RAW[i][oi * 3 + k] });
        }
      }
    });
    return rows;
  }
  global.AIAG_NESTED_ROWS = nestedRows;

  function rowOf(res, source) {
    var f = res.anova.filter(function (r) { return r.source === source; });
    if (!f.length) throw new Error('No existe la fila "' + source + '" en la tabla ANOVA');
    return f[0];
  }
  function comp(res, key) {
    return res.components.filter(function (c) { return c.key === key; })[0];
  }

  /* ---------------------------------------------------------------------- *
   * 1. Tabla ANOVA anidada contra los valores derivados de Minitab
   * ---------------------------------------------------------------------- */
  test('anidado AIAG: sumas de cuadrados (SC_Pieza(Op) = SC_Pieza + SC_Interaccion)', function () {
    var res = MSANested.compute(nestedRows());
    near(rowOf(res, 'Operador').ss, 3.1673, 5e-4, 'SC Operador');
    near(rowOf(res, 'Pieza (Operador)').ss, 88.3619 + 0.3590, 1e-3, 'SC Pieza(Operador)');
    near(rowOf(res, 'Repetibilidad').ss, 2.7589, 5e-4, 'SC Repetibilidad');
    near(rowOf(res, 'Total').ss, 94.6471, 5e-4, 'SC Total');
  });

  test('anidado AIAG: grados de libertad o-1, o(n-1), on(r-1)', function () {
    var res = MSANested.compute(nestedRows());
    near(rowOf(res, 'Operador').df, 2, 0, 'gl Operador');
    near(rowOf(res, 'Pieza (Operador)').df, 27, 0, 'gl Pieza(Operador)');
    near(rowOf(res, 'Repetibilidad').df, 60, 0, 'gl Repetibilidad');
    near(rowOf(res, 'Total').df, 89, 0, 'gl Total');
  });

  test('anidado AIAG: la identidad contra el motor cruzado se cumple en vivo', function () {
    var nested = MSANested.compute(nestedRows());
    var crossed = MSAAnova.compute(crossedRows(), { interaction: 'include' });
    function full(res, source) {
      return res.anovaFull.rows.filter(function (r) { return r.source === source; })[0];
    }
    near(rowOf(nested, 'Operador').ss, full(crossed, 'Operador').ss, 1e-12, 'SC Operador identico');
    near(rowOf(nested, 'Repetibilidad').ss, full(crossed, 'Repetibilidad').ss, 1e-12, 'SC Repetibilidad identico');
    near(rowOf(nested, 'Pieza (Operador)').ss,
         full(crossed, 'Parte').ss + full(crossed, 'Operador * Parte').ss, 1e-12, 'SC Pieza(Operador)');
    near(rowOf(nested, 'Pieza (Operador)').df,
         full(crossed, 'Parte').df + full(crossed, 'Operador * Parte').df, 0, 'gl Pieza(Operador)');
    near(rowOf(nested, 'Total').ss, full(crossed, 'Total').ss, 1e-12, 'SC Total identico');
  });

  test('anidado AIAG: cuadrados medios', function () {
    var res = MSANested.compute(nestedRows());
    near(rowOf(res, 'Operador').ms, 3.1673 / 2, 3e-4, 'CM Operador');
    near(rowOf(res, 'Pieza (Operador)').ms, (88.3619 + 0.3590) / 27, 1e-4, 'CM Pieza(Operador)');
    near(rowOf(res, 'Repetibilidad').ms, 2.7589 / 60, 1e-5, 'CM Repetibilidad');
  });

  test('anidado AIAG: la descomposicion cierra (SC_Total = Op + Pieza(Op) + Rep)', function () {
    var res = MSANested.compute(nestedRows());
    assert(res.anovaFull.decompositionError < 1e-12,
      'error de descomposicion = ' + res.anovaFull.decompositionError);
  });

  test('anidado: la F del operador usa CM Pieza(Operador) como denominador', function () {
    var res = MSANested.compute(nestedRows());
    var op = rowOf(res, 'Operador'), po = rowOf(res, 'Pieza (Operador)'), rp = rowOf(res, 'Repetibilidad');
    near(op.f, op.ms / po.ms, 1e-12, 'F Operador');
    near(po.f, po.ms / rp.ms, 1e-12, 'F Pieza(Operador)');
    near(op.p, MSAStats.fSurvival(op.f, 2, 27), 1e-12, 'p Operador con gl 2 y 27');
    near(po.p, MSAStats.fSurvival(po.f, 27, 60), 1e-12, 'p Pieza(Operador) con gl 27 y 60');
  });

  /* ---------------------------------------------------------------------- *
   * 2. Componentes de varianza del modelo anidado
   * ---------------------------------------------------------------------- */
  test('anidado: componentes desde los cuadrados medios esperados', function () {
    var res = MSANested.compute(nestedRows());
    var msOp = rowOf(res, 'Operador').ms;
    var msPo = rowOf(res, 'Pieza (Operador)').ms;
    var msRep = rowOf(res, 'Repetibilidad').ms;
    near(res.variance.repeatability, msRep, 1e-12, 'Var repetibilidad = CM_Rep');
    near(res.variance.part, (msPo - msRep) / 3, 1e-12, 'Var pieza = (CM_Pieza(Op) - CM_Rep) / r');
    near(res.variance.reproducibility, Math.max(0, (msOp - msPo) / (10 * 3)), 1e-12,
      'Var reproducibilidad = (CM_Op - CM_Pieza(Op)) / (n r)');
    near(res.variance.grr, res.variance.repeatability + res.variance.reproducibility, 1e-12, 'GRR');
    near(res.variance.total, res.variance.grr + res.variance.part, 1e-12, 'total');
  });

  test('anidado: sin interaccion estimable, reproducibilidad = efecto de operador', function () {
    var res = MSANested.compute(nestedRows());
    assert(res.model === 'nested', 'modelo = ' + res.model);
    near(res.variance.interaction, 0, 0, 'varianza de interaccion');
    near(comp(res, 'repro').variance, comp(res, 'op').variance, 1e-12,
      'reproducibilidad y operador deben ser el mismo numero');
    assert(res.anova.every(function (r) { return r.source.indexOf('*') < 0; }),
      'la tabla ANOVA anidada no debe traer fila de interaccion');
  });

  test('anidado AIAG: %Contribucion suma exactamente 100 %', function () {
    var res = MSANested.compute(nestedRows());
    var sum = comp(res, 'grr').pctContribution + comp(res, 'part').pctContribution;
    near(sum, 1, 1e-12, 'GRR + pieza a pieza');
    near(comp(res, 'rep').pctContribution + comp(res, 'repro').pctContribution,
         comp(res, 'grr').pctContribution, 1e-12, 'repetibilidad + reproducibilidad = GRR');
    near(comp(res, 'total').pctContribution, 1, 1e-12, 'variacion total');
  });

  test('anidado AIAG: %Study Variation, NDC e ICC coherentes con los componentes', function () {
    var res = MSANested.compute(nestedRows());
    near(res.metrics.pctStudyVar,
      100 * Math.sqrt(res.variance.grr) / Math.sqrt(res.variance.total), 1e-12, '%Study Variation');
    near(res.metrics.pctContribution, 100 * res.variance.grr / res.variance.total, 1e-12, '%Contribucion');
    near(res.ndcRaw, 1.41 * Math.sqrt(res.variance.part) / Math.sqrt(res.variance.grr), 1e-12, 'NDC crudo');
    near(res.ndc, Math.floor(res.ndcRaw), 0, 'NDC entero');
    near(res.icc, res.variance.part / res.variance.total, 1e-12, 'ICC');
  });

  test('anidado AIAG: la variacion del estudio es 6 * sigma y 5.15 solo la reescala', function () {
    var a = MSANested.compute(nestedRows());
    var b = MSANested.compute(nestedRows(), { studyVarMultiplier: 5.15 });
    near(comp(a, 'total').studyVar, 6 * Math.sqrt(a.variance.total), 1e-12, '6 sigma');
    near(comp(b, 'total').studyVar, 5.15 * Math.sqrt(a.variance.total), 1e-12, '5.15 sigma');
    near(b.metrics.pctStudyVar, a.metrics.pctStudyVar, 1e-12, '%Study Variation no cambia');
    near(b.variance.grr, a.variance.grr, 1e-12, 'los componentes no cambian');
  });

  test('anidado: %Tolerance usa la misma resolucion que el cruzado', function () {
    var res = MSANested.compute(nestedRows(), { lsl: -5, usl: 5 });
    near(res.tolerance, 10, 1e-12, 'tolerancia');
    near(res.metrics.pctTolerance, 100 * 6 * Math.sqrt(res.variance.grr) / 10, 1e-12, '%Tolerance');
    var uni = MSANested.compute(nestedRows(), { usl: 5, processMean: 0 });
    near(uni.tolerance, 5, 1e-12, 'margen unilateral');
    near(uni.metrics.pctTolerance, 100 * 3 * Math.sqrt(uni.variance.grr) / 5, 1e-12,
      '%Tolerance unilateral usa media dispersion');
  });

  /* ---------------------------------------------------------------------- *
   * 3. Caso construido a mano: los tres CM salen con lapiz
   *
   * o = 2 operadores, n = 2 piezas por operador, r = 2 replicas.
   *   x = 10 + a_op + b_pieza(op) -+ 0.5
   *   a = (-1, +1) ; b = (-2, +2) en el operador 1 y (-3, +3) en el 2
   * SC_Op        = n r [(-1)^2 + (+1)^2]           = 4 * 2  =   8 , gl 1
   * SC_Pieza(Op) = r [4 + 4 + 9 + 9]               = 2 * 26 =  52 , gl 2
   * SC_Rep       = 4 celdas * 2 * 0.5^2            =            2 , gl 4
   * ---------------------------------------------------------------------- */
  function handRows(opEffect) {
    var b = [[-2, 2], [-3, 3]], rows = [];
    [0, 1].forEach(function (oi) {
      b[oi].forEach(function (bv, pi) {
        var m = 10 + opEffect[oi] + bv;
        rows.push({ operator: 'Op' + (oi + 1), part: 'P' + (oi * 2 + pi + 1), value: m - 0.5 });
        rows.push({ operator: 'Op' + (oi + 1), part: 'P' + (oi * 2 + pi + 1), value: m + 0.5 });
      });
    });
    return rows;
  }

  test('caso a mano: sumas de cuadrados y cuadrados medios exactos', function () {
    var res = MSANested.compute(handRows([-1, 1]));
    near(rowOf(res, 'Operador').ss, 8, 1e-12, 'SC Operador');
    near(rowOf(res, 'Pieza (Operador)').ss, 52, 1e-12, 'SC Pieza(Operador)');
    near(rowOf(res, 'Repetibilidad').ss, 2, 1e-12, 'SC Repetibilidad');
    near(rowOf(res, 'Total').ss, 62, 1e-12, 'SC Total');
    near(rowOf(res, 'Operador').ms, 8, 1e-12, 'CM Operador');
    near(rowOf(res, 'Pieza (Operador)').ms, 26, 1e-12, 'CM Pieza(Operador)');
    near(rowOf(res, 'Repetibilidad').ms, 0.5, 1e-12, 'CM Repetibilidad');
  });

  test('caso a mano: componentes de varianza exactos con efecto de operador grande', function () {
    // a = (-4, +4) -> SC_Op = 4 * 32 = 128, CM_Op = 128.
    var res = MSANested.compute(handRows([-4, 4]));
    near(rowOf(res, 'Operador').ms, 128, 1e-12, 'CM Operador');
    near(res.variance.repeatability, 0.5, 1e-12, 'Var repetibilidad');
    near(res.variance.part, (26 - 0.5) / 2, 1e-12, 'Var pieza = 12.75');
    near(res.variance.reproducibility, (128 - 26) / 4, 1e-12, 'Var reproducibilidad = 25.5');
    near(res.variance.grr, 26, 1e-12, 'GRR = 0.5 + 25.5');
    near(res.variance.total, 38.75, 1e-12, 'total');
    near(res.metrics.pctContribution, 100 * 26 / 38.75, 1e-12, '%Contribucion');
  });

  test('caso a mano: reproducibilidad negativa se trunca a cero y se registra', function () {
    // a = (-1, +1) -> CM_Op = 8 < CM_Pieza(Op) = 26, asi que el estimador es negativo.
    var res = MSANested.compute(handRows([-1, 1]));
    near(res.variance.reproducibility, 0, 0, 'Var reproducibilidad truncada');
    assert(res.negativeComponents.indexOf('Reproducibilidad (Operador)') >= 0,
      'el componente negativo debe quedar registrado: ' + JSON.stringify(res.negativeComponents));
    assert(res.warnings.some(function (w) { return w.indexOf('negativo') >= 0; }),
      'debe avisar del componente negativo');
    res.components.forEach(function (c) {
      assert(c.variance >= 0, 'componente negativo publicado: ' + c.source);
    });
  });

  /* ---------------------------------------------------------------------- *
   * 4. Validacion de entradas
   * ---------------------------------------------------------------------- */
  function expectError(rows, fragment, what) {
    var v = MSANested.validate(rows);
    assert(!v.ok, (what || '') + ': se esperaba un error y la validacion paso');
    assert(v.errors.join(' | ').indexOf(fragment) >= 0,
      (what || '') + ': el mensaje no menciona "' + fragment + '" -> ' + v.errors.join(' | '));
  }

  /* Esta prueba afirmaba lo contrario hasta F-02: un nombre repetido entre
     operadores era un ERROR y el mensaje mandaba al metodo cruzado. Era el
     bug. En un estudio destructivo la pieza "1" de A y la "1" de B son dos
     objetos que ya no existen, y ningun dato de la captura puede demostrar
     que fueran el mismo. Asi que se acepta y se avisa, que es lo unico que
     los datos sostienen. Los escenarios completos estan en tests-design.js. */
  test('validacion anidada: un nombre repetido entre operadores se acepta y se avisa', function () {
    var rows = nestedRows();
    rows.forEach(function (r) { if (r.operator === 'B' && r.part === 'Pieza 11') r.part = 'Pieza 1'; });
    var v = MSANested.validate(rows);
    assert(v.ok, 'ya no es un error: ' + v.errors.join(' | '));
    assert(v.warnings.join(' | ').indexOf(MSADesign.REPEATED_LABEL_NOTICE) >= 0,
      'pero se avisa: ' + v.warnings.join(' | '));
    assert(v.errors.join(' | ').indexOf('usa el metodo Cruzado') < 0,
      'y no se ordena cambiar de metodo');

    /* El dataset cruzado entero tambien pasa la validacion anidada, y tiene
       que pasarla: los datos no distinguen los dos disenos. Lo que separa un
       estudio cruzado de uno anidado es lo que se hizo en la planta, no la
       forma de la matriz, asi que la eleccion es del usuario y la app solo
       puede decirle que supone cada metodo. */
    var vc = MSANested.validate(crossedRows());
    assert(vc.ok, 'la matriz cruzada es un anidado valido en forma: ' + vc.errors.join(' | '));
    assert(vc.warnings.join(' | ').indexOf(MSADesign.CROSSED_HINT) >= 0,
      'y ahi el aviso ofrece justamente el cruzado: ' + vc.warnings.join(' | '));
  });

  test('validacion anidada: el aviso no afirma que las piezas sean las mismas', function () {
    var w = MSANested.compute(crossedRows(), {}).warnings.join(' | ');
    assert(w.indexOf('midieron las mismas piezas') < 0,
      'no se afirma identidad fisica desde la coincidencia de nombres: ' + w);
    assert(w.indexOf('se consideran objetos fisicos distintos') >= 0,
      'se dice como los trata el modelo: ' + w);
  });

  test('validacion anidada: rechaza distinto numero de piezas por operador', function () {
    var rows = nestedRows().filter(function (r) { return r.part !== 'Pieza 30'; });
    expectError(rows, 'piezas por operador varia', 'piezas desbalanceadas');
  });

  test('validacion anidada: rechaza distinto numero de replicas', function () {
    var rows = nestedRows();
    rows.splice(rows.map(function (r, i) { return r.part === 'Pieza 5' ? i : -1; })
      .filter(function (i) { return i >= 0; })[0], 1);
    expectError(rows, 'replicas varia', 'replicas desbalanceadas');
  });

  test('validacion anidada: rechaza una sola replica por pieza', function () {
    var rows = [];
    ['A', 'B'].forEach(function (op, oi) {
      for (var i = 0; i < 3; i++) rows.push({ operator: op, part: 'P' + (oi * 3 + i), value: i + oi });
    });
    expectError(rows, 'al menos 2 replicas', 'una replica');
  });

  test('validacion anidada: rechaza un solo operador y menos de 2 piezas por operador', function () {
    var one = [];
    for (var i = 0; i < 3; i++) {
      one.push({ operator: 'A', part: 'P' + i, value: i });
      one.push({ operator: 'A', part: 'P' + i, value: i + 0.1 });
    }
    expectError(one, 'al menos 2 operadores', 'un operador');

    var thin = [];
    ['A', 'B'].forEach(function (op) {
      thin.push({ operator: op, part: op + '1', value: 1 });
      thin.push({ operator: op, part: op + '1', value: 1.2 });
    });
    expectError(thin, 'al menos 2 piezas por operador', 'una pieza por operador');
  });

  test('validacion anidada: rechaza mediciones no numericas y celdas vacias', function () {
    var rows = nestedRows();
    rows[0].value = 'x';
    expectError(rows, 'no es un numero valido', 'medicion no numerica');
    var sinOp = nestedRows();
    sinOp[5].operator = '';
    expectError(sinOp, 'falta el operador', 'operador vacio');
  });

  test('avisos fijos: homogeneidad del lote y ausencia de interaccion', function () {
    var res = MSANested.compute(nestedRows());
    var all = res.warnings.join(' | ');
    assert(all.indexOf('lote') >= 0 && all.indexOf('homogeneo') >= 0,
      'debe avisar del supuesto de lote homogeneo: ' + all);
    assert(all.indexOf('no separa la interaccion') >= 0,
      'debe decir que el diseno no separa la interaccion: ' + all);
  });

  test('avisos: tamano del estudio y NDC, con los mismos umbrales del cruzado', function () {
    var chico = MSANested.compute(handRows([-4, 4]));
    var all = chico.warnings.join(' | ');
    assert(all.indexOf('Solo 8 mediciones') >= 0, 'debe avisar del tamano: ' + all);
    assert(all.indexOf('2 operadores') >= 0, 'debe avisar de los 2 operadores: ' + all);
    assert(all.indexOf('NDC = 0') >= 0, 'con GRR grande el NDC cae por debajo de 5: ' + all);
  });

  /* ---------------------------------------------------------------------- *
   * 5. Propiedades sobre datos aleatorios
   * ---------------------------------------------------------------------- */
  function randomNested(seed, o, n, r) {
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648 - 0.5; }
    var rows = [];
    for (var a = 0; a < o; a++) {
      for (var b = 0; b < n; b++) {
        var base = b * 2 + a * 0.3 + rnd();
        for (var k = 0; k < r; k++) {
          rows.push({ operator: 'Op' + a, part: 'P' + a + '-' + b, value: base + rnd() });
        }
      }
    }
    return rows;
  }

  test('propiedad: la descomposicion cierra en 200 disenos anidados aleatorios', function () {
    for (var t = 0; t < 200; t++) {
      var o = 2 + (t % 3), n = 2 + (t % 8), r = 2 + (t % 3);
      var res = MSANested.compute(randomNested(9876 + t, o, n, r));
      assert(res.anovaFull.decompositionError < 1e-10,
        'diseno ' + o + 'x' + n + 'x' + r + ': error ' + res.anovaFull.decompositionError);
      near(res.variance.repeatability + res.variance.reproducibility + res.variance.part,
        res.variance.total, 1e-12, 'los componentes suman la varianza total');
      near(res.design.n, o * n * r, 0, 'numero de mediciones');
      near(rowOf(res, 'Total').df, o * n * r - 1, 0, 'gl total');
      near(rowOf(res, 'Operador').df + rowOf(res, 'Pieza (Operador)').df +
           rowOf(res, 'Repetibilidad').df, o * n * r - 1, 0, 'los gl suman los del total');
      assert(res.metrics.pctStudyVar >= 0 && res.metrics.pctStudyVar <= 100.0000001,
        '%StudyVar fuera de rango: ' + res.metrics.pctStudyVar);
    }
  });

  test('propiedad: invariante ante traslacion', function () {
    var a = MSANested.compute(nestedRows());
    var b = MSANested.compute(nestedRows().map(function (r) {
      return { operator: r.operator, part: r.part, value: r.value + 1000 };
    }));
    near(b.variance.grr, a.variance.grr, 1e-9, 'GRR invariante');
    near(b.variance.part, a.variance.part, 1e-9, 'pieza a pieza invariante');
    near(b.metrics.pctStudyVar, a.metrics.pctStudyVar, 1e-9, '%SV invariante');
  });

  test('propiedad: el escalado multiplicativo escala las varianzas por el cuadrado', function () {
    var a = MSANested.compute(nestedRows());
    var b = MSANested.compute(nestedRows().map(function (r) {
      return { operator: r.operator, part: r.part, value: r.value * 10 };
    }));
    near(b.variance.grr, a.variance.grr * 100, 1e-6, 'varianza x100');
    near(b.variance.part, a.variance.part * 100, 1e-6, 'pieza a pieza x100');
    near(b.metrics.pctStudyVar, a.metrics.pctStudyVar, 1e-9, '%SV invariante a escala');
    near(b.ndcRaw, a.ndcRaw, 1e-9, 'NDC invariante a escala');
  });

  test('propiedad: el orden de las filas no cambia el resultado', function () {
    var a = MSANested.compute(nestedRows());
    var b = MSANested.compute(nestedRows().reverse());
    near(b.variance.grr, a.variance.grr, 1e-12, 'GRR');
    near(b.variance.part, a.variance.part, 1e-12, 'pieza a pieza');
    near(b.metrics.pctContribution, a.metrics.pctContribution, 1e-12, '%Contribucion');
  });

  /* ---------------------------------------------------------------------- *
   * 6. Series de las graficas
   * ---------------------------------------------------------------------- */
  test('graficas anidadas: se van la interaccion y las agrupaciones por pieza compartida', function () {
    var ch = MSANested.compute(nestedRows()).charts;
    assert(ch.interaction === undefined, 'no debe haber serie de interaccion');
    assert(ch.partMeans === undefined, 'no debe haber promedio por pieza compartida');
    assert(ch.rangesByPart === undefined, 'no debe haber rangos por pieza compartida');
  });

  test('graficas anidadas: bloques por operador y rangos consistentes con la carta R', function () {
    var res = MSANested.compute(nestedRows()), ch = res.charts;
    assert(ch.operatorGroups.length === 3, 'tres bloques');
    ch.operatorGroups.forEach(function (g, i) {
      near(g.to - g.from + 1, 10, 0, 'el bloque de ' + g.label + ' cubre sus 10 piezas');
      near(g.from, i * 10, 0, 'los bloques van en orden y sin huecos');
    });
    near(ch.rChart.values.length, 30, 0, 'un rango por pieza');
    near(ch.xbarChart.values.length, 30, 0, 'una media por pieza');
    var sum = 0;
    ch.rangesByOperator.forEach(function (g) {
      near(g.values.length, 10, 0, 'cada operador trae sus 10 rangos');
      g.values.forEach(function (v) { sum += v; });
    });
    near(sum / 30, ch.rChart.center, 1e-12, 'el promedio de los rangos es el R promedio de la carta R');
    near(ch.rChart.ucl, MSAAnova.CONTROL_CONSTANTS[3].D4 * ch.rChart.center, 1e-12, 'LCS de la carta R');
    near(ch.xbarChart.ucl, ch.xbarChart.center + MSAAnova.CONTROL_CONSTANTS[3].A2 * ch.rChart.center,
      1e-12, 'LCS de la carta X-barra');
  });

  test('graficas anidadas: cada operador trae su resumen de caja sobre sus propias piezas', function () {
    var res = MSANested.compute(nestedRows());
    res.charts.byOperator.forEach(function (o) {
      assert(o.box && o.box.n === 30, 'la caja de ' + o.operator + ' cubre sus 30 mediciones');
      assert(o.box.whiskerLow <= o.box.q1 && o.box.q3 <= o.box.whiskerHigh, 'bigotes fuera de la caja');
    });
  });

  test('anidado: el diseno reporta las piezas de cada operador por separado', function () {
    var res = MSANested.compute(nestedRows());
    near(res.design.partsPerOperator, 10, 0, 'piezas por operador');
    near(res.design.parts.length, 30, 0, 'piezas en total');
    near(res.design.partsByOperator.length, 3, 0, 'un grupo por operador');
    res.design.partsByOperator.forEach(function (g) { near(g.length, 10, 0, 'diez piezas por grupo'); });
    var seen = {};
    res.design.parts.forEach(function (p) {
      assert(!seen[p], 'nombre de pieza repetido entre operadores: ' + p);
      seen[p] = true;
    });
  });

  /* --- F-01 en el anidado: misma funcion, mismo trato ---------------------
   * El anidado reutiliza discrimination() del cruzado. Estas pruebas fijan que
   * de verdad la use y que sus tres estados salgan igual, para que un dia no
   * queden los dos metodos clasificando distinto el mismo instrumento. */

  function anidadoPlano(valor) {
    var rows = [];
    ['A', 'B', 'C'].forEach(function (op, oi) {
      for (var p = 1; p <= 5; p++) for (var k = 0; k < 3; k++) {
        rows.push({ operator: op, part: 'Pieza ' + (oi * 5 + p), value: valor });
      }
    });
    return rows;
  }

  /* Cada operador destruye SUS piezas; el instrumento lee de paso en paso. */
  function anidadoResolucion(lo, hi, sigmaMs, delta) {
    var seed = 20260831;
    var rnd = function () { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
    var nrm = function (m, sd) {
      return m + sd * Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
    };
    /* Cada operador cubre el MISMO rango: sus piezas salen de un lote
       homogeneo, que es el supuesto del anidado. Repartir las 15 piezas de
       corrido dejaria a cada operador en un tramo distinto y eso es un efecto
       de operador enorme por construccion, no un problema de resolucion. */
    var rows = [];
    ['A', 'B', 'C'].forEach(function (op, oi) {
      for (var p = 0; p < 5; p++) {
        var pv = lo + (hi - lo) * p / 4;
        for (var k = 0; k < 3; k++) {
          rows.push({ operator: op, part: 'Pieza ' + (oi * 5 + p + 1),
                      value: Math.round(nrm(pv, sigmaMs) / delta) * delta });
        }
      }
    });
    return rows;
  }

  test('F-01 anidado: datos degenerados dan no concluyente y retiran el veredicto', function () {
    var r = MSANested.compute(anidadoPlano(7), {});
    assert(r.discrimination.state === 'degenerado', 'estado degenerado, se obtuvo ' + r.discrimination.state);
    assert(r.inconclusive === true, 'se marca como no concluyente');
    assert(r.ndcLabel === 'No evaluable', 'NDC no evaluable, se obtuvo "' + r.ndcLabel + '"');
    assert(r.assessment.studyVar === null, 'no se califica sobre cero informacion');
    var dice = r.warnings.some(function (w) { return w.indexOf('Estudio no concluyente') === 0; });
    assert(dice, 'reporta el caso degenerado');
  });

  test('F-01 anidado: instrumento muy preciso queda censurado, no degradado', function () {
    var r = MSANested.compute(anidadoResolucion(9, 11, 0.00002, 0.001), { tolerance: 2.0 });
    assert(r.discrimination.state === 'censurado', 'estado censurado, se obtuvo ' + r.discrimination.state);
    assert(r.inconclusive === false, 'no es no concluyente');
    assert(r.assessment.studyVar && r.assessment.studyVar.level === 'ok', 'conserva el veredicto');
    assert(!r.warnings.some(function (w) { return w.indexOf('resolucion insuficiente') >= 0; }),
           'no levanta alarma de resolucion sobre un instrumento excelente');
  });

  test('F-01 anidado: el ejemplo de referencia no cambia ni gana avisos', function () {
    var r = MSANested.compute(nestedRows(), { lsl: -5, usl: 5 });
    assert(r.discrimination.state === 'ok', 'discriminacion ok, se obtuvo ' + r.discrimination.state);
    assert(r.ndcLabel === String(r.ndc), 'la etiqueta del NDC es su numero');
    assert(!/inf/i.test(r.ndcLabel) && !/\d{4,}/.test(r.ndcLabel), 'NDC legible: "' + r.ndcLabel + '"');
    var nuevos = r.warnings.filter(function (w) {
      return /no concluyente|no es medible|resolucion insuficiente/.test(w);
    });
    assert(nuevos.length === 0, 'sin avisos nuevos: ' + nuevos.join(' | '));
  });

})(typeof window !== 'undefined' ? window : globalThis);
