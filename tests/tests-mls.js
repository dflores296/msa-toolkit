/* ============================================================================
 * tests-mls.js - F-07: el intervalo MLS de la razon de varianzas.
 *
 * COMO SE VALIDA UN METODO TRANSCRITO DE IMAGENES
 *
 * Las formulas del MLS llegaron a este repositorio leidas de las imagenes PNG
 * de la documentacion de Minitab, porque no estan publicadas como texto en
 * ninguna fuente de acceso libre. Una transcripcion puede fallar de dos
 * maneras: leer mal un simbolo, o leer bien y que la fuente tenga una errata.
 * Las dos han ocurrido aqui. Asi que estas pruebas no comprueban "que el
 * codigo diga lo mismo que la imagen" -eso no probaria nada, seria copiar dos
 * veces-. Comprueban propiedades que la formula CORRECTA tiene que cumplir y
 * una transcripcion equivocada casi seguro rompe:
 *
 *   1. LIMITE SIN INCERTIDUMBRE. Con grados de libertad enormes, G y H tienden
 *      a cero, la cuadratica degenera en una raiz doble y el intervalo tiene
 *      que colapsar sobre el ESTIMADOR PUNTUAL de la razon. Esta es la prueba
 *      que fijo que el multiplicador es I y no J: con J el colapso no ocurre.
 *   2. CONCORDANCIA CON UN TERCERO INDEPENDIENTE. El GPQ es otro metodo
 *      publicado, con otra matematica por completo. Donde los dos son de fiar
 *      -disenos grandes- tienen que dar practicamente lo mismo. Esta es la
 *      prueba que cazo la regla de seleccion de raiz.
 *   3. COBERTURA. Un intervalo al 95 % tiene que contener el valor verdadero
 *      el 95 % de las veces. Es lo unico que un intervalo promete.
 *   4. INVARIANTES DE RANGO de las constantes: G en (0,1), H >= 0. Si la cola
 *      de la chi2 se invierte, esto cae de inmediato.
 *
 * Las simulaciones usan un PRNG propio y sembrado: la suite es deterministica.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var T = global.MSATestKit;
  var test = T.test, near = T.near, assert = T.assert;
  var M = global.MSAMls;

  /* --- utilidades -------------------------------------------------------- */
  function maker(seed) {
    var s = seed >>> 0;
    function u() { s = (Math.imul(1103515245, s) + 12345) >>> 0; return (s + 0.5) / 4294967296; }
    return { nrm: function () { return Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); } };
  }
  function crossed(g, p, o, r, sP, sO, sI, sE) {
    var rows = [], pv = [], ov = [], iv = {}, i, j, k;
    for (i = 0; i < p; i++) pv.push(g.nrm() * sP);
    for (j = 0; j < o; j++) ov.push(g.nrm() * sO);
    for (j = 0; j < o; j++) for (i = 0; i < p; i++) iv[j + '|' + i] = g.nrm() * (sI || 0);
    for (j = 0; j < o; j++) for (i = 0; i < p; i++) for (k = 0; k < r; k++) {
      rows.push({ operator: 'Op' + j, part: 'P' + i,
                  value: 100 + pv[i] + ov[j] + iv[j + '|' + i] + g.nrm() * sE });
    }
    return rows;
  }
  /** Tabla ANOVA -> la notacion S1..S4 de Minitab. */
  function msdf(res) {
    var wi = res.anova.some(function (x) { return x.source === 'Operador * Parte'; });
    var map = wi ? { 'Parte': 1, 'Operador': 2, 'Operador * Parte': 3, 'Repetibilidad': 4 }
                 : { 'Parte': 1, 'Operador': 2, 'Repetibilidad': 3 };
    var ms = {}, df = {};
    res.anova.forEach(function (x) {
      if (map[x.source]) { ms[map[x.source]] = x.ms; df[map[x.source]] = x.df; }
    });
    return { ms: ms, df: df, withInteraction: wi };
  }
  /** Cuadrados medios ESPERADOS del modelo cruzado: sirven para conocer la
      razon exacta sin pasar por ninguna estimacion. */
  function esperados(I, J, K, sP, sO, sPO, sE) {
    return { 1: sE + K * sPO + J * K * sP, 2: sE + K * sPO + I * K * sO,
             3: sE + K * sPO,              4: sE };
  }

  /* =======================================================================
   * 1. Las constantes G y H
   * ===================================================================== */

  test('MLS: G cae en (0,1) y H es >= 0, en todos los grados de libertad', function () {
    /* Es el invariante que delata una cola de chi2 invertida. Si G saliera
       negativo o mayor que 1, o H negativo, la convencion de percentil estaria
       del reves y TODOS los intervalos saldrian mal calibrados sin avisar. */
    [1, 2, 3, 5, 9, 18, 60, 78, 200].forEach(function (n) {
      var k = M._constants({ 1: n }, 0.025);
      assert(k.G[1] > 0 && k.G[1] < 1, 'G con ' + n + ' g.l. fuera de (0,1): ' + k.G[1]);
      assert(k.H[1] >= 0, 'H con ' + n + ' g.l. es negativo: ' + k.H[1]);
    });
  });

  test('MLS: con muchos grados de libertad G y H tienden a cero', function () {
    var k = M._constants({ 1: 500000 }, 0.025);
    near(k.G[1], 0, 0.01, 'G');
    near(k.H[1], 0, 0.01, 'H');
  });

  test('MLS: pocos operadores hacen H enorme, y eso NO es un error', function () {
    /* Con 3 operadores el operador tiene 2 grados de libertad y H_2 pasa de 38.
       Es la razon de que A se vuelva negativa en los estudios AIAG tipicos, y
       de que la regla de raiz importe. Se fija aqui para que quede claro que es
       una propiedad del diseno y no un sintoma. */
    var k = M._constants({ 1: 2 }, 0.025);
    assert(k.H[1] > 30, 'H con 2 g.l. deberia pasar de 30, dio ' + k.H[1]);
  });

  /* =======================================================================
   * 2. El limite sin incertidumbre: la prueba que fija el multiplicador
   * ===================================================================== */

  test('MLS: con g.l. enormes el intervalo colapsa sobre la razon puntual', function () {
    var I = 10, J = 3, K = 3, sP = 1, sO = 0.2, sPO = 0.1, sE = 0.3;
    var s = esperados(I, J, K, sP, sO, sPO, sE);
    var BIG = 2e6;
    var r = M.partTotal(s, { 1: BIG, 2: BIG, 3: BIG, 4: BIG }, { I: I, J: J, K: K }, { conf: 0.95 });
    assert(r && r.method === 'MLS', 'deberia resolver por MLS');
    var real = sP / (sP + sO + sPO + sE);
    near(r.lo, real, 0.005, 'limite inferior');
    near(r.hi, real, 0.005, 'limite superior');
  });

  test('MLS: el multiplicador es I (partes). Con J el colapso no ocurre', function () {
    /* La pagina dice "J veces la solucion mas pequenya". Con I != J las dos
       lecturas dan numeros distintos y solo una reproduce la razon. Se toma un
       diseno bien desbalanceado en I y J para que la diferencia sea grande. */
    var I = 20, J = 4, K = 3, sP = 1, sO = 0.15, sPO = 0.1, sE = 0.3;
    var s = esperados(I, J, K, sP, sO, sPO, sE);
    var BIG = 2e6;
    var r = M.partTotal(s, { 1: BIG, 2: BIG, 3: BIG, 4: BIG }, { I: I, J: J, K: K }, { conf: 0.95 });
    var real = sP / (sP + sO + sPO + sE);
    near(r.lo, real, 0.005, 'con I reproduce la razon');
    /* Lo que habria dado la lectura literal: la misma raiz escalada por J/I. */
    var conJ = r.lo * J / I;
    assert(Math.abs(conJ - real) > 0.1,
           'con J el resultado deberia estar lejos de la razon real, dio ' + conJ);
  });

  /* =======================================================================
   * 3. Estructura de las cuadraticas
   * ===================================================================== */

  test('MLS: sin G ni H la cuadratica es (W x - D)^2, con raiz doble D/W', function () {
    /* A -> W^2, B -> -2DW, C -> D^2 con W = a S1 + b S2 + c S3 + d S4 y
       D = S1 - S3. Es la identidad de la que sale todo lo demas, incluido el
       valor de a, b, c y d. Se comprueba con las constantes anuladas a mano. */
    var k = { G: { 1: 0, 2: 0, 3: 0, 4: 0 }, H: { 1: 0, 2: 0, 3: 0, 4: 0 },
              Gqr: function () { return 0; }, Hqr: function () { return 0; } };
    var s = { 1: 9.1, 2: 0.4, 3: 0.12, 4: 0.06 };
    var co = { a: 10, b: 3, c: 17, d: 60 };
    var W = co.a * s[1] + co.b * s[2] + co.c * s[3] + co.d * s[4], D = s[1] - s[3];
    var q = M._quadLower(s, co, k);
    near(q.A, W * W, 1e-6, 'A');
    near(q.B, -2 * D * W, 1e-6, 'B');
    near(q.C, D * D, 1e-9, 'C');
  });

  test('MLS: sin interaccion es la misma formula con el termino de S4 apagado', function () {
    /* d = 0 y S4 = 0 tienen que reducir los diez terminos de la variante con
       interaccion a los seis que Minitab imprime para la variante sin ella. Si
       hubiera dos caminos de codigo, aqui se veria la diferencia. */
    var k = M._constants({ 1: 9, 2: 2, 3: 78 }, 0.025);
    var s4 = { 1: 9.8, 2: 1.58, 3: 0.041, 4: 0 };
    var co = { a: 10, b: 3, c: 77, d: 0 };
    var q = M._quadLower(s4, co, k);
    var esperadoC = (1 - k.G[1] * k.G[1]) * s4[1] * s4[1] +
                    (1 - k.H[3] * k.H[3]) * s4[3] * s4[3] -
                    (2 + k.Gqr(1, 3)) * s4[1] * s4[3];
    near(q.C, esperadoC, 1e-12, 'C sin interaccion');
    assert(isFinite(q.A) && isFinite(q.B), 'A y B finitas sin termino de interaccion');
  });

  /* =======================================================================
   * 4. Sobre datos reales: el conjunto AIAG
   * ===================================================================== */

  var AIAG_ROWS = (function () {
    var v = [[0.29, 0.41, 0.64, 0.08, 0.25, 0.07, 0.04, -0.11, -0.15],
             [-0.56, -0.68, -0.58, -0.47, -1.22, -0.68, -1.38, -1.13, -0.96],
             [1.34, 1.17, 1.27, 1.19, 0.94, 1.34, 0.88, 1.09, 0.67],
             [0.47, 0.50, 0.64, 0.01, 1.03, 0.20, 0.14, 0.20, 0.11],
             [-0.80, -0.92, -0.84, -0.56, -1.20, -1.28, -1.46, -1.07, -1.45],
             [0.02, -0.11, -0.21, -0.20, 0.22, 0.06, -0.29, -0.67, -0.49],
             [0.59, 0.75, 0.66, 0.47, 0.55, 0.83, 0.02, 0.01, 0.21],
             [-0.31, -0.20, -0.17, -0.63, 0.08, -0.34, -0.46, -0.56, -0.49],
             [2.26, 1.99, 2.01, 1.80, 2.12, 2.19, 1.77, 1.45, 1.87],
             [-1.36, -1.25, -1.31, -1.68, -1.62, -1.50, -1.49, -1.77, -2.16]];
    var rows = [];
    ['A', 'B', 'C'].forEach(function (op, oi) {
      for (var i = 0; i < 10; i++) for (var k = 0; k < 3; k++) {
        rows.push({ operator: op, part: 'Pieza ' + (i + 1), value: v[i][oi * 3 + k] });
      }
    });
    return rows;
  })();

  test('MLS: sobre AIAG el intervalo contiene al punto y no toca los topes', function () {
    var res = global.MSAAnova.compute(AIAG_ROWS, { alpha: 0.25, interaction: 'auto' });
    var iv = global.MSAInterval.forResult(res, { conf: 0.95 });
    assert(iv.method === 'MLS', 'AIAG deberia resolverse por MLS, dio ' + iv.method);
    assert(iv.experimental === false, 'el MLS no es experimental');
    var punto = res.metrics.pctStudyVar;
    assert(iv.studyVar.lo < punto && punto < iv.studyVar.hi,
           'el punto ' + punto.toFixed(2) + ' deberia caer dentro de [' +
           iv.studyVar.lo.toFixed(2) + ',' + iv.studyVar.hi.toFixed(2) + ']');
    assert(iv.studyVar.lo > 0.01 && iv.studyVar.hi < 99.99,
           'un intervalo pegado a 0 y 100 significa que el truncamiento se lo comio: [' +
           iv.studyVar.lo.toFixed(2) + ',' + iv.studyVar.hi.toFixed(2) + ']');
  });

  test('MLS: AIAG, valor de regresion del intervalo', function () {
    /* No es un valor publicado por nadie: es el que produce esta
       implementacion, fijado para que un cambio accidental en cualquiera de
       las diez lineas de A o B se note. Su validacion es la concordancia con
       el GPQ de la prueba siguiente, no este numero. */
    var res = global.MSAAnova.compute(AIAG_ROWS, { alpha: 0.25, interaction: 'auto' });
    var iv = global.MSAInterval.forResult(res, { conf: 0.95 });
    near(iv.studyVar.lo, 14.72, 0.05, 'AIAG limite inferior del %GRR');
    near(iv.studyVar.hi, 81.35, 0.05, 'AIAG limite superior del %GRR');
  });

  test('MLS y GPQ, dos metodos independientes, concuerdan sobre AIAG', function () {
    /* La prueba que caza una regla de seleccion de raiz equivocada: con
       min/max en vez de la formula impresa, esto daba [0, 100] contra el
       [14.9, 81.7] del GPQ. */
    var res = global.MSAAnova.compute(AIAG_ROWS, { alpha: 0.25, interaction: 'auto' });
    var mls = global.MSAInterval.forResult(res, { conf: 0.95 });
    var gpq = global.MSAInterval.forResult(res, { conf: 0.95, method: 'GPQ' });
    near(mls.studyVar.lo, gpq.studyVar.lo, 1.5, 'limite inferior MLS vs GPQ');
    near(mls.studyVar.hi, gpq.studyVar.hi, 1.5, 'limite superior MLS vs GPQ');
  });

  test('MLS y GPQ concuerdan tambien en un diseno grande', function () {
    var res = global.MSAAnova.compute(
      crossed(maker(4242), 30, 10, 4, 1, 0.10, 0.12, 0.25), { interaction: 'include' });
    var mls = global.MSAInterval.forResult(res, { conf: 0.95 });
    var gpq = global.MSAInterval.forResult(res, { conf: 0.95, method: 'GPQ' });
    near(mls.studyVar.lo, gpq.studyVar.lo, 1.0, 'limite inferior');
    near(mls.studyVar.hi, gpq.studyVar.hi, 1.0, 'limite superior');
  });

  /* =======================================================================
   * 5. Cobertura
   * ===================================================================== */

  test('MLS cobertura: al 95 % cubre la razon verdadera alrededor del 95 %', function () {
    var g = maker(20260831), dentro = 0, n = 0;
    var sP = 1, sO = 0.10, sI = 0, sE = 0.25;
    var real = (sO * sO + sI * sI + sE * sE) / (sO * sO + sI * sI + sE * sE + sP * sP);
    for (var t = 0; t < 400; t++) {
      var res = global.MSAAnova.compute(crossed(g, 10, 3, 3, sP, sO, sI, sE),
                                        { interaction: 'exclude' });
      var iv = global.MSAInterval.forResult(res, { conf: 0.95 });
      if (!iv) continue;
      n++;
      if (real >= iv.ratio.lo && real <= iv.ratio.hi) dentro++;
    }
    var cob = dentro / n;
    /* El MLS es conservador por construccion: se admite de 93 % para arriba,
       pero NO por debajo del nominal, que seria el fallo que importa. */
    assert(cob >= 0.93, 'cobertura ' + (100 * cob).toFixed(1) + ' %, demasiado baja');
  });

  test('MLS cobertura: al 99 % cubre mas que al 90 %, y es mas ancho', function () {
    var g = maker(777), d90 = 0, d99 = 0, ancho90 = 0, ancho99 = 0, n = 0;
    var sP = 1, sO = 0.10, sE = 0.25;
    var real = (sO * sO + sE * sE) / (sO * sO + sE * sE + sP * sP);
    for (var t = 0; t < 250; t++) {
      var res = global.MSAAnova.compute(crossed(g, 10, 3, 3, sP, sO, 0, sE),
                                        { interaction: 'exclude' });
      var a = global.MSAInterval.forResult(res, { conf: 0.90 });
      var b = global.MSAInterval.forResult(res, { conf: 0.99 });
      if (!a || !b) continue;
      n++;
      if (real >= a.ratio.lo && real <= a.ratio.hi) d90++;
      if (real >= b.ratio.lo && real <= b.ratio.hi) d99++;
      ancho90 += a.ratio.hi - a.ratio.lo;
      ancho99 += b.ratio.hi - b.ratio.lo;
    }
    assert(d99 >= d90, 'el 99 % deberia cubrir al menos tanto como el 90 %');
    assert(ancho99 > ancho90, 'el 99 % deberia ser mas ancho');
  });

  /* =======================================================================
   * 6. La razon del sistema de medicion y sus escalas
   * ===================================================================== */

  test('MLS: gage/total invierte los limites de parte/total', function () {
    /* La regla es 1 - x, que es decreciente: si no se intercambiaran los
       limites, el intervalo saldria del reves. La pagina es-mx los escribe sin
       intercambiar; aqui se comprueba que esta implementacion no copio eso. */
    var res = global.MSAAnova.compute(AIAG_ROWS, { alpha: 0.25, interaction: 'auto' });
    var x = msdf(res);
    var dims = { I: 10, J: 3, K: 3 };
    var p = M.partTotal(x.ms, x.df, dims, { conf: 0.95 });
    var gg = M.gageTotal(x.ms, x.df, dims, { conf: 0.95 });
    assert(gg.lo <= gg.hi, 'el intervalo derivado tiene que quedar ordenado');
    near(gg.lo, 1 - p.hi, 1e-12, 'LI de gage = 1 - LS de parte');
    near(gg.hi, 1 - p.lo, 1e-12, 'LS de gage = 1 - LI de parte');
  });

  test('MLS: los limites quedan siempre dentro de [0,1], como manda la fuente', function () {
    var g = maker(31337);
    for (var t = 0; t < 60; t++) {
      var res = global.MSAAnova.compute(crossed(g, 5, 3, 2, 1, 0.5, 0, 0.8),
                                        { interaction: 'exclude' });
      var x = msdf(res);
      var gg = M.gageTotal(x.ms, x.df, { I: 5, J: 3, K: 2 }, { conf: 0.95 });
      if (!gg) continue;
      assert(gg.lo >= 0 && gg.hi <= 1 && gg.lo <= gg.hi,
             'razon fuera de [0,1]: [' + gg.lo + ',' + gg.hi + ']');
    }
  });

  /* =======================================================================
   * 7. H*, la constante que la fuente no define
   * ===================================================================== */

  test('MLS: H* por omision es "zero"', function () {
    assert(M.DEFAULT_H_STAR === 'zero', 'la omision deberia ser zero');
    var res = global.MSAAnova.compute(AIAG_ROWS, { alpha: 0.25, interaction: 'auto' });
    var iv = global.MSAInterval.forResult(res, { conf: 0.95 });
    assert(iv.hStar === 'zero', 'el intervalo deberia declarar que H* uso');
  });

  test('MLS: H* mueve SOLO el limite inferior del %GRR', function () {
    /* Es la propiedad que acota el hueco documental. El limite superior del
       %GRR sale del limite inferior de parte/total, que no contiene H* por
       ninguna parte; si algun dia esta prueba fallara, significaria que el
       hueco se colo en el numero que dictamina.

       Se comparan dos candidatos que resuelven los DOS por MLS. Un H* lo
       bastante grande puede anular el discriminante y mandar el calculo entero
       a Satterthwaite, y entonces cambian los dos limites -pero por haber
       cambiado de metodo, no porque H* toque el limite superior-. Ese caso lo
       cubre la prueba siguiente. */
    var res = global.MSAAnova.compute(AIAG_ROWS, { alpha: 0.25, interaction: 'auto' });
    var x = msdf(res), dims = { I: 10, J: 3, K: 3 };
    var a = M.gageTotal(x.ms, x.df, dims, { conf: 0.95, hStar: 'zero' });
    var b = M.gageTotal(x.ms, x.df, dims, { conf: 0.95, hStar: 'hqr' });
    assert(a.method === 'MLS' && b.method === 'MLS', 'los dos tienen que salir por MLS');
    near(b.hi, a.hi, 1e-12, 'el limite superior de gage/total no puede depender de H*');
    assert(Math.abs(b.lo - a.lo) > 1e-9,
           'y el inferior si tiene que moverse, o la prueba no valdria nada');
  });

  test('MLS: un H* extremo tumba la cuadratica y cae a Satterthwaite', function () {
    /* No es un fallo: es el disparador funcionando. Se documenta como prueba
       para que quede claro que la eleccion de H* puede cambiar de metodo, y no
       solo de numero. */
    var res = global.MSAAnova.compute(AIAG_ROWS, { alpha: 0.25, interaction: 'auto' });
    var x = msdf(res), dims = { I: 10, J: 3, K: 3 };
    var c = M.gageTotal(x.ms, x.df, dims, { conf: 0.95, hStar: 'product' });
    assert(c.method === 'Satterthwaite',
           'con H* = H_q*H_r la cuadratica no deberia tener solucion, dio ' + c.method);
    assert(c.lo <= c.hi && c.lo >= 0 && c.hi <= 1, 'y aun asi devolver un intervalo valido');
  });

  /* =======================================================================
   * 8. Que metodo se usa donde
   * ===================================================================== */

  test('MLS: el cruzado sale por MLS y el anidado sigue en GPQ experimental', function () {
    var cruz = global.MSAAnova.compute(AIAG_ROWS, { alpha: 0.25, interaction: 'auto' });
    var ivc = global.MSAInterval.forResult(cruz, { conf: 0.95 });
    assert(ivc.method === 'MLS' || ivc.method === 'Satterthwaite', 'cruzado: ' + ivc.method);
    assert(ivc.experimental === false, 'el cruzado ya no es experimental');

    var rows = [], g = maker(9);
    for (var j = 0; j < 3; j++) {
      var ob = g.nrm() * 0.1;
      for (var i = 0; i < 5; i++) {
        var pv = g.nrm();
        for (var k = 0; k < 3; k++) {
          rows.push({ operator: 'Op' + j, part: 'Op' + j + '-P' + i,
                      value: 100 + pv + ob + g.nrm() * 0.25 });
        }
      }
    }
    var anid = global.MSANested.compute(rows, {});
    var iva = global.MSAInterval.forResult(anid, { conf: 0.95 });
    assert(iva && iva.method === 'GPQ', 'el anidado no tiene MLS transcrito: ' +
           (iva && iva.method));
    assert(iva.experimental === true, 'y por eso sigue rotulado como experimental');
  });

  test('MLS: el rotulo viaja dentro del intervalo y nombra el metodo', function () {
    var res = global.MSAAnova.compute(AIAG_ROWS, { alpha: 0.25, interaction: 'auto' });
    var iv = global.MSAInterval.forResult(res, { conf: 0.95 });
    assert(/MLS/.test(iv.statusLabel), 'el rotulo deberia nombrar el MLS: ' + iv.statusLabel);
    assert(!/experimental/.test(iv.statusLabel), 'y no llamarlo experimental');
    assert(/No utilizado para el dictamen/.test(iv.statusLabel),
           'y seguir diciendo que no dictamina');
  });

  /* =======================================================================
   * 9. La alternativa de Satterthwaite
   * ===================================================================== */

  test('Satterthwaite: con g.l. enormes tambien colapsa sobre la razon puntual', function () {
    /* El mismo control que el MLS, aplicado a la alternativa. Si los cuantiles
       valen 1, el parentesis se reduce a (g1/g2 - 1) y el resultado a
       (g1-g2)/g3, que es la razon. Sin multiplicador: la alternativa no lo lleva. */
    var I = 10, J = 3, K = 3, sP = 1, sO = 0.2, sPO = 0.1, sE = 0.3;
    var s = esperados(I, J, K, sP, sO, sPO, sE);
    var BIG = 2e6, df = { 1: BIG, 2: BIG, 3: BIG, 4: BIG };
    var co = { a: I, b: J, c: I * J - I - J, d: I * J * (K - 1) };
    var r = M._satterthwaite(s, co, df, 0.025);
    var real = sP / (sP + sO + sPO + sE);
    near(r.lo, real, 0.01, 'limite inferior');
    near(r.hi, real, 0.01, 'limite superior');
  });

  test('Satterthwaite: se usa cuando la cuadratica no tiene solucion', function () {
    /* Se busca un estudio donde de verdad se dispare, en vez de simularlo a
       mano: si el disparador estuviera roto, este bucle no encontraria ninguno
       y la prueba lo diria. */
    var g = maker(5150), visto = false;
    for (var t = 0; t < 200 && !visto; t++) {
      var res = global.MSAAnova.compute(crossed(g, 5, 3, 2, 1, 0.9, 0, 1.3),
                                        { interaction: 'exclude' });
      var iv = global.MSAInterval.forResult(res, { conf: 0.95 });
      if (iv && iv.method === 'Satterthwaite') {
        visto = true;
        assert(iv.ratio.lo <= iv.ratio.hi, 'ordenado');
        assert(iv.ratio.lo >= 0 && iv.ratio.hi <= 1, 'dentro de [0,1]');
        assert(/Satterthwaite/.test(iv.statusLabel), 'y el rotulo lo dice');
      }
    }
    assert(visto, 'en 200 estudios chicos y ruidosos deberia haber saltado alguna vez');
  });

})(typeof window !== 'undefined' ? window : globalThis);
