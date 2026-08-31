/* ============================================================================
 * tests-attribute.js - Suite de regresion del motor de atributos.
 *
 * COMO SE VALIDA ESTE MOTOR
 *
 * No hay aqui un dataset publicado con resultados, como el AIAG del cruzado.
 * Queda anotado como deuda en docs/plan-siguientes-metodos.md. Mientras tanto
 * el motor NO se valida contra numeros inventados, sino contra tres cosas que
 * no dependen de conseguir un archivo:
 *
 *   1. Casos chicos resueltos A MANO. Cuatro piezas, dos evaluadores, dos
 *      replicas: caben en la cabeza, se cuentan con los dedos y el resultado
 *      esperado se escribe en el comentario junto con su cuenta.
 *   2. Identidades exactas de kappa. Un caso de Fleiss y uno de Cohen con
 *      tablas construidas para que el valor salga fraccion exacta (7/15, 0.75).
 *   3. Propiedades que deben cumplirse siempre: renombrar las categorias no
 *      cambia nada, el orden de las filas tampoco, el acuerdo perfecto da
 *      100 % y kappa 1, y el intervalo de Clopper-Pearson cumple su propia
 *      definicion contra la binomial.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var T = global.MSATestKit;
  var test = T.test, near = T.near, assert = T.assert;
  var A = global.MSAAttribute, S = global.MSAStats;

  var PASA = 'Pasa', NOPASA = 'No pasa';

  /* ------------------------------------------------------------------------
   * El caso de mano. Se usa en varias pruebas, asi que se arma una vez.
   *
   *   estandar:  P1 Pasa   P2 Pasa   P3 No pasa   P4 No pasa
   *
   *   Ana   P1 [Pasa, Pasa]        consistente, acierta
   *         P2 [Pasa, No pasa]     se contradice
   *         P3 [No pasa, No pasa]  consistente, acierta
   *         P4 [No pasa, No pasa]  consistente, acierta
   *
   *   Beto  P1 [Pasa, Pasa]        consistente, acierta
   *         P2 [Pasa, Pasa]        consistente, acierta
   *         P3 [No pasa, No pasa]  consistente, acierta
   *         P4 [Pasa, Pasa]        consistente, FALLA (era No pasa)
   * ----------------------------------------------------------------------*/
  var HAND = {
    standard: { P1: PASA, P2: PASA, P3: NOPASA, P4: NOPASA },
    ratings: {
      Ana:  { P1: [PASA, PASA],     P2: [PASA, NOPASA], P3: [NOPASA, NOPASA], P4: [NOPASA, NOPASA] },
      Beto: { P1: [PASA, PASA],     P2: [PASA, PASA],   P3: [NOPASA, NOPASA], P4: [PASA, PASA] }
    }
  };

  function handRows(opts) {
    var o = opts || {};
    var rows = [];
    Object.keys(HAND.ratings).forEach(function (op) {
      Object.keys(HAND.ratings[op]).forEach(function (pt) {
        HAND.ratings[op][pt].forEach(function (v, k) {
          var row = { operator: op, part: pt, replicate: k + 1, value: v };
          if (!o.noStandard) row.standard = HAND.standard[pt];
          rows.push(row);
        });
      });
    });
    return rows;
  }

  var CATS = { categories: [PASA, NOPASA], rejectCategory: NOPASA };

  function byOp(list, op) {
    for (var i = 0; i < list.length; i++) if (list[i].operator === op) return list[i];
    return null;
  }

  /* ======================================================================
   * 1. Concordancias, contadas a mano
   * ====================================================================*/

  test('atributos: concordancia dentro del evaluador (Ana 3/4, Beto 4/4)', function () {
    var r = A.compute(handRows(), CATS);
    /* Ana se contradice en P2; Beto nunca se contradice, aunque en P4 este
       consistentemente equivocado. Repetirse y acertar son cosas distintas. */
    near(byOp(r.withinAppraiser, 'Ana').pct, 75, 1e-9, 'Ana dentro');
    near(byOp(r.withinAppraiser, 'Beto').pct, 100, 1e-9, 'Beto dentro');
    assert(byOp(r.withinAppraiser, 'Ana').matched === 3, 'Ana: 3 piezas concordantes');
    assert(byOp(r.withinAppraiser, 'Beto').matched === 4, 'Beto: 4 piezas concordantes');
  });

  test('atributos: evaluador contra el estandar (los dos 3/4, por razones distintas)', function () {
    var r = A.compute(handRows(), CATS);
    /* Ana falla P2 por contradecirse; Beto falla P4 por equivocarse parejo.
       El mismo 75 % esconde dos problemas que se arreglan distinto. */
    near(byOp(r.vsStandard, 'Ana').pct, 75, 1e-9, 'Ana vs estandar');
    near(byOp(r.vsStandard, 'Beto').pct, 75, 1e-9, 'Beto vs estandar');
  });

  test('atributos: entre evaluadores y todos contra el estandar (2/4 cada uno)', function () {
    var r = A.compute(handRows(), CATS);
    /* Coinciden en P1 y P3. En P2 Ana se contradice; en P4 discrepan. */
    near(r.betweenAppraisers.pct, 50, 1e-9, 'entre evaluadores');
    near(r.allVsStandard.pct, 50, 1e-9, 'todos vs estandar');
  });

  test('atributos: efectividad, fuga y falsa alarma se separan', function () {
    var r = A.compute(handRows(), CATS);
    var ana = byOp(r.effectiveness, 'Ana'), beto = byOp(r.effectiveness, 'Beto');

    /* Los dos aciertan 3 de 4 piezas, pero el error NO es el mismo:
       Ana marca de mas una pieza buena  -> falsa alarma 1/4 = 25 %, fuga 0.
       Beto deja pasar una pieza mala    -> fuga 2/4 = 50 %, falsa alarma 0.
       En planta esos dos errores no cuestan lo mismo, y por eso se reportan
       aparte en vez de resumirse en un solo porcentaje. */
    near(ana.effectiveness, 75, 1e-9, 'Ana efectividad');
    near(ana.missRate, 0, 1e-9, 'Ana fuga');
    near(ana.falseAlarmRate, 25, 1e-9, 'Ana falsa alarma');

    near(beto.effectiveness, 75, 1e-9, 'Beto efectividad');
    near(beto.missRate, 50, 1e-9, 'Beto fuga');
    near(beto.falseAlarmRate, 0, 1e-9, 'Beto falsa alarma');
  });

  test('atributos: la fuga se juzga mas duro que la falsa alarma', function () {
    var r = A.compute(handRows(), CATS);
    var ana = byOp(r.effectiveness, 'Ana'), beto = byOp(r.effectiveness, 'Beto');
    /* 25 % de falsa alarma y 50 % de fuga son los dos inaceptables, pero los
       umbrales son distintos (5 % y 2 %): no se comparten a proposito. */
    assert(ana.assessment.falseAlarmRate.level === 'bad', 'falsa alarma 25 % es inaceptable');
    assert(ana.assessment.missRate.level === 'ok', 'fuga 0 % es aceptable');
    assert(beto.assessment.missRate.level === 'bad', 'fuga 50 % es inaceptable');
    assert(beto.assessment.falseAlarmRate.level === 'ok', 'falsa alarma 0 % es aceptable');
  });

  /* ======================================================================
   * 2. Kappa: identidades exactas
   * ====================================================================*/

  test('kappa de Cohen: caso de mano de Ana contra el estandar = 0.75 exacto', function () {
    /* Los 8 pares (clasificacion, verdad) de Ana forman la tabla
              verdad Pasa   verdad No pasa
       Pasa        3               0
       No pasa     1               4
       Po = 7/8. Marginales de fila 3/8 y 5/8; de columna 1/2 y 1/2.
       Pe = (3/8)(1/2) + (5/8)(1/2) = 1/2.
       kappa = (7/8 - 1/2) / (1 - 1/2) = 3/4. */
    var r = A.compute(handRows(), CATS);
    var ana = byOp(r.kappaVsStandard, 'Ana');
    near(ana.overall.kappa, 0.75, 1e-12, 'kappa de Cohen de Ana');
  });

  test('kappa de Cohen: tabla 20/5/10/15 da 0.4 exacto', function () {
    /* Caso clasico de libro: Po = 35/50 = 0.7; marginales 1/2, 1/2 y 3/5, 2/5;
       Pe = 0.5(0.6) + 0.5(0.4) = 0.5; kappa = (0.7 - 0.5)/0.5 = 0.4. */
    var pairs = [];
    var push = function (a, b, n) { for (var i = 0; i < n; i++) pairs.push([a, b]); };
    push('A', 'A', 20); push('A', 'B', 5); push('B', 'A', 10); push('B', 'B', 15);
    var c = A.cohenKappa(pairs, ['A', 'B']);
    near(c.overall.kappa, 0.4, 1e-12, 'kappa de Cohen');
    assert(c.pairs === 50, 'la tabla suma 50 pares');
  });

  test('kappa de Fleiss: caso construido da 7/15 exacto', function () {
    /* 4 piezas, 2 calificaciones cada una, categorias A y B:
         [A,A] [A,A] [B,B] [A,B]
       p_A = 5/8, p_B = 3/8.  P_i = 1, 1, 1, 0  ->  Pbar = 3/4.
       Pe = (5/8)^2 + (3/8)^2 = 34/64.
       kappa = (3/4 - 34/64) / (1 - 34/64) = (14/64)/(30/64) = 7/15. */
    var f = A.fleissKappa([['A', 'A'], ['A', 'A'], ['B', 'B'], ['A', 'B']], ['A', 'B']);
    near(f.overall.kappa, 7 / 15, 1e-12, 'kappa de Fleiss');
  });

  test('kappa: acuerdo perfecto da 1, y el azar puro ronda 0', function () {
    var perfect = [['A', 'A'], ['B', 'B'], ['A', 'A'], ['B', 'B']];
    near(A.fleissKappa(perfect, ['A', 'B']).overall.kappa, 1, 1e-12, 'kappa acuerdo total');

    /* Desacuerdo maximo con marginales parejas: cada pieza sale 1 y 1, asi que
       el acuerdo observado es 0 y kappa se va a su minimo negativo. */
    var split = [['A', 'B'], ['B', 'A'], ['A', 'B'], ['B', 'A']];
    assert(A.fleissKappa(split, ['A', 'B']).overall.kappa < 0, 'kappa negativa con desacuerdo total');
  });

  test('kappa: descuenta el acuerdo que se explica por el desbalance del lote', function () {
    /* Nueve piezas buenas y una mala; los dos evaluadores dicen SIEMPRE "Pasa".
       Coinciden en el 100 % de las piezas y aciertan el 90 % contra el
       estandar, sin haber inspeccionado nada. Kappa contra el estandar tiene
       que delatarlo: sale 0 o menos. */
    var rows = [];
    for (var i = 1; i <= 10; i++) {
      var truth = i === 10 ? NOPASA : PASA;
      ['Ana', 'Beto'].forEach(function (op) {
        for (var k = 0; k < 2; k++) {
          rows.push({ operator: op, part: 'P' + i, value: PASA, standard: truth });
        }
      });
    }
    var r = A.compute(rows, CATS);
    near(r.betweenAppraisers.pct, 100, 1e-9, 'coinciden en todo');
    near(r.allVsStandard.pct, 90, 1e-9, 'aciertan el 90 %');
    assert(r.kappaAllVsStandard.overall.kappa <= 0,
           'kappa no premia el acuerdo que da el desbalance: ' + r.kappaAllVsStandard.overall.kappa);
    assert(r.assessment.kappa.level === 'bad', 'y se clasifica como acuerdo pobre');
  });

  /* ======================================================================
   * 3. Propiedades
   * ====================================================================*/

  test('propiedad: renombrar las categorias no cambia ningun resultado', function () {
    var base = A.compute(handRows(), CATS);
    var renamed = handRows().map(function (r) {
      var map = function (v) { return v === PASA ? 'OK' : 'NG'; };
      return { operator: r.operator, part: r.part, replicate: r.replicate,
               value: map(r.value), standard: map(r.standard) };
    });
    var alt = A.compute(renamed, { categories: ['OK', 'NG'], rejectCategory: 'NG' });

    near(alt.betweenAppraisers.pct, base.betweenAppraisers.pct, 1e-12, 'entre evaluadores');
    near(alt.allVsStandard.pct, base.allVsStandard.pct, 1e-12, 'todos vs estandar');
    near(alt.kappaAllVsStandard.overall.kappa, base.kappaAllVsStandard.overall.kappa, 1e-12, 'kappa');
    near(byOp(alt.effectiveness, 'Beto').missRate,
         byOp(base.effectiveness, 'Beto').missRate, 1e-12, 'fuga de Beto');
  });

  test('propiedad: el orden de las filas no cambia el resultado', function () {
    var base = A.compute(handRows(), CATS);
    var rows = handRows();
    /* Barajado determinista: se invierte y se intercalan mitades. */
    var shuffled = [];
    var rev = rows.slice().reverse();
    for (var i = 0; i < rev.length; i++) {
      shuffled.push(rev[(i * 7) % rev.length]);
    }
    var seen = {}, uniq = [];
    shuffled.forEach(function (r, i) {
      var k = r.operator + '|' + r.part + '|' + i;
      if (!seen[k]) { seen[k] = 1; uniq.push(r); }
    });
    var alt = A.compute(uniq.length === rows.length ? uniq : rev, CATS);
    near(alt.betweenAppraisers.pct, base.betweenAppraisers.pct, 1e-12, 'entre evaluadores');
    near(alt.kappaAllVsStandard.overall.kappa, base.kappaAllVsStandard.overall.kappa, 1e-12, 'kappa');
  });

  test('propiedad: acuerdo total da 100 % en las cuatro concordancias', function () {
    var rows = [];
    for (var i = 1; i <= 12; i++) {
      var v = i % 3 === 0 ? NOPASA : PASA;
      ['Ana', 'Beto', 'Cruz'].forEach(function (op) {
        for (var k = 0; k < 3; k++) rows.push({ operator: op, part: 'P' + i, value: v, standard: v });
      });
    }
    var r = A.compute(rows, CATS);
    r.withinAppraiser.forEach(function (a) { near(a.pct, 100, 1e-9, 'dentro de ' + a.operator); });
    r.vsStandard.forEach(function (a) { near(a.pct, 100, 1e-9, a.operator + ' vs estandar'); });
    near(r.betweenAppraisers.pct, 100, 1e-9, 'entre evaluadores');
    near(r.allVsStandard.pct, 100, 1e-9, 'todos vs estandar');
    near(r.kappaAllVsStandard.overall.kappa, 1, 1e-12, 'kappa perfecta');
    r.effectiveness.forEach(function (e) {
      near(e.effectiveness, 100, 1e-9, 'efectividad ' + e.operator);
      near(e.missRate, 0, 1e-9, 'fuga ' + e.operator);
      near(e.falseAlarmRate, 0, 1e-9, 'falsa alarma ' + e.operator);
    });
  });

  test('propiedad: el intervalo de Clopper-Pearson cumple su definicion', function () {
    /* El limite inferior es la p que deja exactamente alfa/2 de probabilidad
       binomial en X >= x; el superior, la que deja alfa/2 en X <= x. Se
       comprueba contra la propia binomial, sin tablas publicadas. */
    [[9, 10], [45, 50], [1, 20], [17, 30]].forEach(function (c) {
      var x = c[0], n = c[1];
      var ci = S.proportionCI(x, n, 0.05);
      near(1 - S.binomialCDF(x - 1, n, ci.lo), 0.025, 1e-9, 'cola inferior de ' + x + '/' + n);
      near(S.binomialCDF(x, n, ci.hi), 0.025, 1e-9, 'cola superior de ' + x + '/' + n);
      assert(ci.lo <= x / n && x / n <= ci.hi, 'el intervalo contiene la proporcion observada');
    });
    var all = S.proportionCI(10, 10, 0.05);
    assert(all.hi === 1, '10 de 10 tiene limite superior exactamente 1');
    var none = S.proportionCI(0, 10, 0.05);
    assert(none.lo === 0, '0 de 10 tiene limite inferior exactamente 0');
  });

  test('propiedad: el intervalo acompana al porcentaje y se angosta con mas piezas', function () {
    var make = function (nParts) {
      var rows = [];
      for (var i = 1; i <= nParts; i++) {
        var v = i % 2 === 0 ? NOPASA : PASA;
        for (var k = 0; k < 2; k++) rows.push({ operator: 'Ana', part: 'P' + i, value: v, standard: v });
      }
      return A.compute(rows, CATS);
    };
    var chico = make(10), grande = make(60);
    var anchoChico = chico.withinAppraiser[0].ciHigh - chico.withinAppraiser[0].ciLow;
    var anchoGrande = grande.withinAppraiser[0].ciHigh - grande.withinAppraiser[0].ciLow;
    near(chico.withinAppraiser[0].pct, 100, 1e-9, 'los dos dan 100 %');
    near(grande.withinAppraiser[0].pct, 100, 1e-9, 'los dos dan 100 %');
    assert(anchoGrande < anchoChico,
           'el mismo 100 % con 60 piezas es mas creible que con 10: ' +
           anchoGrande.toFixed(2) + ' < ' + anchoChico.toFixed(2));
  });

  /* ======================================================================
   * 4. Validacion de entradas
   * ====================================================================*/

  test('validacion: rechaza un estudio desbalanceado', function () {
    var rows = handRows();
    rows.push({ operator: 'Ana', part: 'P1', value: PASA, standard: PASA });
    var v = A.validate(rows);
    assert(!v.ok, 'no debe pasar');
    assert(/desbalanceado/i.test(v.errors.join(' ')), 'lo dice: ' + v.errors.join(' '));
  });

  test('validacion: rechaza dos estandares distintos para la misma pieza', function () {
    var rows = handRows();
    rows[0].standard = NOPASA;
    var v = A.validate(rows);
    assert(!v.ok, 'no debe pasar');
    assert(/estandares distintos/i.test(v.errors.join(' ')), 'lo dice: ' + v.errors.join(' '));
  });

  test('validacion: rechaza el estandar a medias', function () {
    var rows = handRows();
    rows.forEach(function (r) { if (r.part === 'P3') delete r.standard; });
    var v = A.validate(rows);
    assert(!v.ok, 'no debe pasar');
    assert(/O lo traen todas o no lo trae ninguna/i.test(v.errors.join(' ')),
           'lo dice: ' + v.errors.join(' '));
  });

  test('validacion: rechaza una sola categoria en todo el estudio', function () {
    var rows = handRows().map(function (r) {
      return { operator: r.operator, part: r.part, value: PASA, standard: PASA };
    });
    var v = A.validate(rows);
    assert(!v.ok, 'no debe pasar');
    assert(/dos categorias/i.test(v.errors.join(' ')), 'lo dice: ' + v.errors.join(' '));
  });

  test('validacion: rechaza clasificaciones vacias y falta de evaluador', function () {
    var v1 = A.validate([{ operator: 'Ana', part: 'P1', value: '' }]);
    assert(!v1.ok && /falta la clasificacion/i.test(v1.errors.join(' ')), 'clasificacion vacia');
    var v2 = A.validate([{ operator: '', part: 'P1', value: PASA }]);
    assert(!v2.ok && /falta el evaluador/i.test(v2.errors.join(' ')), 'evaluador vacio');
  });

  /* ======================================================================
   * 5. Avisos: lo que el estudio no puede ver
   * ====================================================================*/

  test('avisos: sin estandar se dice que coincidir no es acertar', function () {
    var r = A.compute(handRows({ noStandard: true }), CATS);
    assert(r.meta.hasStandard === false, 'no hay estandar');
    assert(r.vsStandard.length === 0 && r.allVsStandard === null, 'no se inventa el contraste');
    assert(r.effectiveness.length === 0, 'sin verdad no hay efectividad');
    assert(/todos equivocados/i.test(r.warnings.join(' ')), 'lo avisa: ' + r.warnings.join(' '));
    /* Lo que si se puede medir sin estandar sigue ahi. */
    near(r.betweenAppraisers.pct, 50, 1e-9, 'entre evaluadores se calcula igual');
  });

  test('avisos: lote desbalanceado y estudio chico', function () {
    var rows = [];
    for (var i = 1; i <= 10; i++) {
      var truth = i === 10 ? NOPASA : PASA;
      for (var k = 0; k < 2; k++) {
        rows.push({ operator: 'Ana', part: 'P' + i, value: truth, standard: truth });
      }
    }
    var r = A.compute(rows, CATS);
    var w = r.warnings.join(' ');
    assert(/AIAG sugiere alrededor de 50/i.test(w), 'avisa que el estudio es chico');
    assert(/desbalanceado/i.test(w), 'avisa que el lote esta desbalanceado');
    assert(/un solo evaluador/i.test(w), 'avisa que no hay con quien comparar');
  });

  test('avisos: con mas de dos categorias no se inventan fuga ni falsa alarma', function () {
    var rows = [], cats = ['Bueno', 'Retrabajo', 'Chatarra'];
    for (var i = 1; i <= 9; i++) {
      var truth = cats[i % 3];
      ['Ana', 'Beto'].forEach(function (op) {
        for (var k = 0; k < 2; k++) {
          rows.push({ operator: op, part: 'P' + i, value: truth, standard: truth });
        }
      });
    }
    var r = A.compute(rows, { categories: cats });
    assert(r.effectiveness.length === 0, 'no se calculan cifras binarias');
    assert(/decision binaria/i.test(r.warnings.join(' ')), 'y se explica por que');
    /* Kappa y las concordancias si aplican con tres categorias. */
    near(r.allVsStandard.pct, 100, 1e-9, 'el acuerdo si se mide');
    near(r.kappaAllVsStandard.overall.kappa, 1, 1e-12, 'y kappa tambien');
    assert(r.kappaBetween.byCategory.length === 3, 'un kappa por categoria');
  });

  test('atributos: una sola replica no inventa concordancia dentro del evaluador', function () {
    var rows = [];
    for (var i = 1; i <= 6; i++) {
      var v = i % 2 ? PASA : NOPASA;
      ['Ana', 'Beto'].forEach(function (op) {
        rows.push({ operator: op, part: 'P' + i, value: v, standard: v });
      });
    }
    var r = A.compute(rows, CATS);
    assert(r.withinAppraiser.length === 0, 'no se reporta lo que no se puede medir');
    assert(/una sola replica/i.test(r.warnings.join(' ')), 'y se dice: ' + r.warnings.join(' '));
    near(r.betweenAppraisers.pct, 100, 1e-9, 'lo demas se calcula igual');
  });

  test('atributos: el resumen toma el peor evaluador, no el promedio', function () {
    var r = A.compute(handRows(), CATS);
    /* Ana 75 % y Beto 100 % dentro del evaluador: el veredicto reporta 75.
       Promediar escondería al que falla, que es justo a quien hay que ver. */
    near(r.metrics.worstWithin, 75, 1e-9, 'peor concordancia interna');
    near(r.metrics.worstMiss, 50, 1e-9, 'peor fuga');
    near(r.metrics.worstFalseAlarm, 25, 1e-9, 'peor falsa alarma');
  });

  test('atributos: el estudio no publica nada del mundo de la varianza', function () {
    var r = A.compute(handRows(), CATS);
    /* Es la diferencia de fondo con los otros dos metodos y conviene fijarla:
       si algun dia alguien agrega un %GRR aqui, esta prueba lo detiene. */
    assert(r.model === 'attribute', 'se identifica como atributos');
    ['anova', 'components', 'ndc', 'icc'].forEach(function (k) {
      assert(r[k] === undefined, 'no publica ' + k + ': no existe en este diseno');
    });
  });

  /* ------------------------------------------------------------------------
   * La categoria de rechazo no se adivina (F-04 de la auditoria).
   *
   * El motor tomaba cats[1] -la SEGUNDA categoria en orden de aparicion en los
   * datos- cuando no se le indicaba ninguna. Con eso, los mismos datos
   * capturados en otro orden de filas intercambiaban el error de fuga con la
   * falsa alarma, que tienen umbrales distintos (2 % y 5 %) y consecuencias
   * distintas. La prueba de invariancia de orden que ya existia no lo veia
   * porque siempre pasa CATS con la categoria explicita, que es justo la
   * condicion bajo la cual la propiedad si se cumple.
   * ----------------------------------------------------------------------*/

  /* El mismo estudio, con la primera fila cambiada de sitio. Ana comete
     UNA FALSA ALARMA (rechaza P1, que es buena) y ninguna fuga. */
  function fugaVsFalsaAlarmaRows(malaPrimero) {
    var truth = { P1: PASA, P2: PASA, P3: PASA, P4: NOPASA };
    var calls = { P1: NOPASA, P2: PASA, P3: PASA, P4: NOPASA };
    var order = malaPrimero ? ['P4', 'P1', 'P2', 'P3'] : ['P2', 'P1', 'P3', 'P4'];
    var rows = [];
    order.forEach(function (pt) {
      for (var k = 0; k < 2; k++) {
        rows.push({ operator: 'Ana', part: pt, replicate: k + 1, value: calls[pt], standard: truth[pt] });
      }
    });
    return rows;
  }

  test('F-04: sin categoria de rechazo no se inventan efectividad, fuga ni falsa alarma', function () {
    var r = A.compute(handRows(), { categories: [PASA, NOPASA] });   // sin rejectCategory
    assert(r.effectiveness.length === 0, 'no publica efectividad por evaluador');
    assert(r.meta.rejectCategory === null, 'no elige una categoria de rechazo');
    assert(r.meta.acceptCategory === null, 'no elige una categoria conforme');
    assert(r.metrics.worstMiss === null && r.metrics.worstFalseAlarm === null,
           'no hay cifras de fuga ni de falsa alarma en el resumen');
    var dijo = r.warnings.some(function (w) { return w.indexOf('NO CONFORME') >= 0; });
    assert(dijo, 'avisa por que faltan las tres cifras');
    /* Lo que NO depende de esa eleccion se sigue publicando. */
    near(r.betweenAppraisers.pct, 50, 1e-9, 'entre evaluadores se calcula igual');
    assert(r.kappaAllVsStandard && r.kappaAllVsStandard.overall, 'kappa se calcula igual');
  });

  test('F-04: una categoria de rechazo que no existe en el estudio se rechaza, no se sustituye', function () {
    var r = A.compute(handRows(), { categories: [PASA, NOPASA], rejectCategory: 'Rechazo' });
    assert(r.effectiveness.length === 0, 'no publica efectividad');
    assert(r.meta.rejectCategory === null, 'no cae en un default posicional');
    var dijo = r.warnings.some(function (w) { return w.indexOf('"Rechazo"') >= 0; });
    assert(dijo, 'nombra la categoria que no encontro');
  });

  test('F-04: el orden de las filas ya no intercambia la fuga con la falsa alarma', function () {
    /* Antes: con la pieza mala primero, cats salia ["No pasa","Pasa"], el
       default cats[1] elegia "Pasa" como rechazo y las dos cifras se
       intercambiaban. Verdad del caso: Ana rechaza P1 en sus dos replicas, o
       sea 2 falsas alarmas de 6 decisiones sobre piezas conformes (33.33 %),
       y 0 fugas de 2 decisiones sobre la unica pieza no conforme. */
    var opts = { rejectCategory: NOPASA };
    var a = A.compute(fugaVsFalsaAlarmaRows(false), opts);
    var b = A.compute(fugaVsFalsaAlarmaRows(true), opts);
    near(a.effectiveness[0].missRate, 0, 1e-9, 'fuga con la buena primero');
    near(a.effectiveness[0].falseAlarmRate, 100 / 3, 1e-9, 'falsa alarma con la buena primero');
    near(b.effectiveness[0].missRate, a.effectiveness[0].missRate, 1e-12, 'la fuga no cambia con el orden');
    near(b.effectiveness[0].falseAlarmRate, a.effectiveness[0].falseAlarmRate, 1e-12,
         'la falsa alarma no cambia con el orden');
    /* Y la deteccion de categorias si depende del orden, como siempre: es
       exactamente por eso que no se puede usar para elegir el rechazo. */
    assert(a.meta.categories[0] === PASA && b.meta.categories[0] === NOPASA,
           'el orden de aparicion de las categorias si cambia; por eso no sirve de default');
  });

  test('F-04: elegir el otro lado da el resultado espejo, y es una eleccion, no un accidente', function () {
    var rows = fugaVsFalsaAlarmaRows(false);
    var normal = A.compute(rows, { rejectCategory: NOPASA }).effectiveness[0];
    var invertido = A.compute(rows, { rejectCategory: PASA }).effectiveness[0];
    near(invertido.missRate, normal.falseAlarmRate, 1e-12, 'la fuga invertida es la falsa alarma');
    near(invertido.falseAlarmRate, normal.missRate, 1e-12, 'y al reves');
    /* El punto de F-04: los dos resultados son igual de "validos" para el
       motor y opuestos para la planta. Por eso la eleccion tiene que venir de
       quien conoce el proceso, y no del orden en que se tecleo el estudio. */
  });

  global.ATTRIBUTE_HAND_CASE = HAND;
})(typeof window !== 'undefined' ? window : globalThis);
