/* ============================================================================
 * tests-interval.js - F-07: el intervalo de confianza del %GRR.
 *
 * COMO SE VALIDA ESTE MODULO, Y POR QUE ASI
 *
 * Para el motor cruzado hay valores publicados de Minitab que reproducir
 * digito a digito. Para un intervalo no los hay a mano, asi que NO se inventa
 * una tabla de referencia: se comprueba lo unico que un intervalo promete, que
 * es su COBERTURA. Se simulan estudios de un sistema cuyo %GRR verdadero se
 * conoce por construccion y se cuenta cuantas veces el intervalo lo contiene.
 * Si la formula del pivote estuviera mal, la cobertura se iria del nominal y
 * estas pruebas caerian. Es una validacion mas exigente que igualar un numero
 * suelto, porque un solo numero se puede acertar por casualidad y una
 * cobertura sobre cientos de estudios no.
 *
 * Las simulaciones usan un PRNG propio y sembrado: la suite es deterministica,
 * no "casi siempre pasa".
 *
 * LO QUE ESTAS PRUEBAS NO DICEN. La cobertura se mide con datos generados por
 * el MISMO modelo que el metodo asume: normales, balanceados, efectos
 * aleatorios independientes. Es la validacion correcta de la aritmetica del
 * intervalo, y no dice nada sobre que pasa si los datos no cumplen el modelo.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var T = global.MSATestKit;
  var test = T.test, near = T.near, assert = T.assert;
  var I = global.MSAInterval;

  /* --- Simulacion deterministica ---------------------------------------- */
  function maker(seed) {
    var s = seed >>> 0;
    function u() { s = (Math.imul(1103515245, s) + 12345) >>> 0; return (s + 0.5) / 4294967296; }
    function nrm() { return Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); }
    return { u: u, nrm: nrm };
  }

  /* Sistema cruzado con componentes VERDADEROS conocidos. El %GRR verdadero
     sale de ellos, no de ninguna estimacion. */
  function crossed(g, p, o, r, sPart, sOp, sRep) {
    var rows = [], pv = [], ov = [], i, j, k;
    for (i = 0; i < p; i++) pv.push(g.nrm() * sPart);
    for (j = 0; j < o; j++) ov.push(g.nrm() * sOp);
    for (j = 0; j < o; j++) for (i = 0; i < p; i++) for (k = 0; k < r; k++) {
      rows.push({ operator: 'Op' + j, part: 'P' + i, value: 100 + pv[i] + ov[j] + g.nrm() * sRep });
    }
    return rows;
  }
  function nested(g, n, o, r, sPart, sOp, sRep) {
    var rows = [], i, j, k;
    for (j = 0; j < o; j++) {
      var ob = g.nrm() * sOp;
      for (i = 0; i < n; i++) {
        var pv = g.nrm() * sPart;
        for (k = 0; k < r; k++) {
          rows.push({ operator: 'Op' + j, part: 'Op' + j + '-P' + i,
                      value: 100 + pv + ob + g.nrm() * sRep });
        }
      }
    }
    return rows;
  }
  function trueSV(sPart, sOp, sRep) {
    var grr = sOp * sOp + sRep * sRep;
    return 100 * Math.sqrt(grr / (grr + sPart * sPart));
  }

  /* El dataset AIAG, para tener un caso real y no solo simulaciones. */
  function aiagResult(opts) {
    var raw = global.AIAG_ROWS ? null : null;
    var A = [
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
    var rows = [];
    ['A', 'B', 'C'].forEach(function (op, oi) {
      for (var i = 0; i < 10; i++) for (var k = 0; k < 3; k++) {
        rows.push({ operator: op, part: 'Pieza ' + (i + 1), value: A[i][oi * 3 + k] });
      }
    });
    return MSAAnova.compute(rows, opts || { alpha: 0.25, interaction: 'auto', lsl: -5, usl: 5 });
  }

  /* ---------------------------------------------------------------------- *
   * 1. COBERTURA - la validacion principal
   * ---------------------------------------------------------------------- */
  function coverage(opts) {
    var g = maker(opts.seed), dentro = 0, hechos = 0, ancho = 0;
    var tv = trueSV(opts.sPart, opts.sOp, opts.sRep);
    for (var t = 0; t < opts.studies; t++) {
      var rows = opts.nested
        ? nested(g, opts.p, opts.o, opts.r, opts.sPart, opts.sOp, opts.sRep)
        : crossed(g, opts.p, opts.o, opts.r, opts.sPart, opts.sOp, opts.sRep);
      var res;
      try {
        res = opts.nested ? MSANested.compute(rows, {})
                          : MSAAnova.compute(rows, { alpha: 0.25, interaction: 'auto' });
      } catch (e) { continue; }
      var iv = I.forResult(res, { draws: opts.draws || 900, conf: opts.conf });
      if (!iv) continue;
      hechos++;
      ancho += iv.studyVar.hi - iv.studyVar.lo;
      if (iv.studyVar.lo <= tv && tv <= iv.studyVar.hi) dentro++;
    }
    return { cobertura: 100 * dentro / hechos, hechos: hechos, tv: tv, ancho: ancho / hechos };
  }

  test('F-07 cobertura: cruzado 10x3x3, sistema marginal', function () {
    var c = coverage({ seed: 20260831, studies: 220, p: 10, o: 3, r: 3,
                       sPart: 1, sOp: 0.10, sRep: 0.28, conf: 0.90 });
    assert(c.hechos > 200, 'se calcularon intervalos en casi todos: ' + c.hechos);
    /* Nominal 90 %. La tolerancia cubre el error de Monte Carlo de 220
       estudios (+-2 % aprox) y la conservadurismo conocido del GPQ. */
    assert(c.cobertura > 84 && c.cobertura < 97,
      'cobertura ' + c.cobertura.toFixed(1) + ' % contra un nominal de 90 % (%GRR real ' +
      c.tv.toFixed(2) + ')');
  });

  test('F-07 cobertura: cruzado 10x3x3, sistema bueno', function () {
    var c = coverage({ seed: 7771, studies: 220, p: 10, o: 3, r: 3,
                       sPart: 1, sOp: 0.05, sRep: 0.14, conf: 0.90 });
    assert(c.cobertura > 84 && c.cobertura < 97,
      'cobertura ' + c.cobertura.toFixed(1) + ' % (nominal 90, %GRR real ' + c.tv.toFixed(2) + ')');
  });

  test('F-07 cobertura: al 95 % cubre mas y el intervalo es mas ancho', function () {
    var a = coverage({ seed: 31415, studies: 200, p: 10, o: 3, r: 3,
                       sPart: 1, sOp: 0.10, sRep: 0.28, conf: 0.90 });
    var b = coverage({ seed: 31415, studies: 200, p: 10, o: 3, r: 3,
                       sPart: 1, sOp: 0.10, sRep: 0.28, conf: 0.95 });
    assert(b.ancho > a.ancho, 'el del 95 % es mas ancho: ' + b.ancho.toFixed(1) + ' vs ' + a.ancho.toFixed(1));
    assert(b.cobertura >= a.cobertura - 2, 'y cubre al menos tanto: ' +
      b.cobertura.toFixed(1) + ' vs ' + a.cobertura.toFixed(1));
    assert(b.cobertura > 90 && b.cobertura < 99.5, 'cobertura al 95 %: ' + b.cobertura.toFixed(1));
  });

  test('F-07 cobertura: estudio chico 5x3x2, donde mas importa', function () {
    /* Es el caso de la auditoria: 3 op x 5 piezas x 2 replicas. Si el
       intervalo no cubre AQUI, no sirve para nada, porque es justo el estudio
       cuyo punto es inestable. */
    var c = coverage({ seed: 909090, studies: 220, p: 5, o: 3, r: 2,
                       sPart: 1, sOp: 0.05, sRep: 0.14, conf: 0.90 });
    assert(c.cobertura > 82 && c.cobertura < 98,
      'cobertura ' + c.cobertura.toFixed(1) + ' % (nominal 90, %GRR real ' + c.tv.toFixed(2) + ')');
    assert(c.ancho > 15, 'y el intervalo es ancho, que es el hallazgo: ' + c.ancho.toFixed(1) + ' pp');
  });

  test('F-07 cobertura: el motor anidado tambien', function () {
    var c = coverage({ seed: 60606, studies: 160, nested: true, p: 10, o: 3, r: 3,
                       sPart: 1, sOp: 0.10, sRep: 0.28, conf: 0.90 });
    assert(c.cobertura > 82 && c.cobertura < 98,
      'cobertura anidada ' + c.cobertura.toFixed(1) + ' % (nominal 90, real ' + c.tv.toFixed(2) + ')');
  });

  /* ---------------------------------------------------------------------- *
   * 2. Propiedades que no dependen de simular
   * ---------------------------------------------------------------------- */
  test('F-07: el intervalo contiene al punto y esta ordenado', function () {
    var r = aiagResult(), iv = I.forResult(r);
    assert(iv !== null, 'se calcula sobre el dataset AIAG');
    ['ratio', 'studyVar', 'contribution'].forEach(function (k) {
      var b = iv[k];
      assert(b && b.lo <= b.hi, k + ': lo <= hi');
      assert(b.lo >= 0, k + ': ninguna cota es negativa');
    });
    assert(iv.ratio.hi <= 1, 'la razon V_GRR/V_Total no pasa de 1: ' + iv.ratio.hi);
    assert(iv.tolerance === undefined, '%Tolerance no publica intervalo: su denominador es la ' +
      'tolerancia de especificacion, no V_Total, y no se deriva de la razon');
    assert(iv.studyVar.lo <= r.metrics.pctStudyVar && r.metrics.pctStudyVar <= iv.studyVar.hi,
      'el %StudyVar puntual (' + r.metrics.pctStudyVar.toFixed(2) + ') cae dentro de [' +
      iv.studyVar.lo.toFixed(2) + ', ' + iv.studyVar.hi.toFixed(2) + ']');
    assert(iv.contribution.lo <= r.metrics.pctContribution &&
           r.metrics.pctContribution <= iv.contribution.hi, 'y el %Contribucion tambien');
  });

  test('F-07: es determinista - el mismo estudio da el mismo intervalo', function () {
    var r = aiagResult();
    var a = I.forResult(r), b = I.forResult(r);
    assert(JSON.stringify(a.studyVar) === JSON.stringify(b.studyVar),
      'dos llamadas dan lo mismo: ' + JSON.stringify(a.studyVar) + ' vs ' + JSON.stringify(b.studyVar));
    /* Un intervalo que cambiara al recargar la pagina no se podria citar en un
       reporte, y la regresion visual no podria comparar nada. */
    var c = I.forResult(aiagResult());
    assert(JSON.stringify(a.studyVar) === JSON.stringify(c.studyVar),
      'y recalcular el estudio desde cero, tambien');
  });

  test('F-07: mas datos, intervalo mas estrecho', function () {
    var g = maker(112233);
    var chico = MSAAnova.compute(crossed(g, 5, 3, 2, 1, 0.05, 0.14), { alpha: 0.25, interaction: 'auto' });
    var grande = MSAAnova.compute(crossed(g, 25, 5, 4, 1, 0.05, 0.14), { alpha: 0.25, interaction: 'auto' });
    var a = I.forResult(chico), b = I.forResult(grande);
    var wa = a.studyVar.hi - a.studyVar.lo, wb = b.studyVar.hi - b.studyVar.lo;
    assert(wb < wa, 'el estudio grande da un intervalo mas estrecho: ' +
      wb.toFixed(1) + ' pp vs ' + wa.toFixed(1) + ' pp');
  });

  test('F-07: no se publica intervalo donde no lo hay', function () {
    var r = aiagResult();
    assert(I.forResult(null) === null, 'sin resultado, null');
    assert(I.forResult({ model: 'attribute' }) === null, 'atributos no tiene %GRR que acotar');
    /* Un resultado sin tabla ANOVA utilizable no produce un intervalo
       inventado: produce null, y quien llama decide que hacer. */
    var mutilado = JSON.parse(JSON.stringify({ model: r.model, design: r.design,
      anova: r.anova.map(function (row) { return { source: row.source, df: 0, ms: row.ms }; }) }));
    assert(I.forResult(mutilado) === null, 'sin grados de libertad, null');
  });

  /* ---------------------------------------------------------------------- *
   * 3. El intervalo NO dictamina: dictamina la estimacion puntual
   *
   * La politica anterior -clasificar por el intervalo, y llamar "no
   * concluyente" a todo lo que cruzara un umbral- esta retirada. Estas
   * pruebas fijan que no vuelva por la puerta de atras.
   * ---------------------------------------------------------------------- */
  test('F-07: el intervalo ya no clasifica', function () {
    assert(typeof I.classify === 'undefined',
      'classify() no existe: la clasificacion por intervalo esta retirada');
    assert(typeof I.MIN_MEASUREMENTS === 'undefined',
      'el piso de 60 mediciones no existe: medía la dimension equivocada');
    assert(typeof I.crossings === 'function', 'lo que queda es crossings(), que solo advierte');
  });

  test('F-07: crossings solo dice que limites cruza, sin emitir categoria', function () {
    var dentro = I.crossings({ lo: 2, hi: 8 });
    assert(dentro === null, 'un intervalo que no cruza nada no genera advertencia');
    assert(I.crossings({ lo: 12, hi: 25 }) === null,
      'y uno entero dentro de la banda condicional, tampoco: no hay nada que advertir');

    var c10 = I.crossings({ lo: 8, hi: 15 });
    assert(c10 && c10.crosses.length === 1 && c10.crosses[0] === 10, 'cruza el 10 %');
    var c30 = I.crossings({ lo: 25, hi: 40 });
    assert(c30 && c30.crosses[0] === 30, 'cruza el 30 %');
    var ambos = I.crossings({ lo: 5, hi: 45 });
    assert(ambos.crosses.length === 2, 'un intervalo enorme cruza los dos limites');

    /* El texto es el aprobado en F-07, y NO contiene ninguna categoria. */
    assert(/Interpreta la clasificacion puntual con precaucion/.test(c30.label),
      'el mensaje remite al punto: ' + c30.label);
    [c10, c30, ambos].forEach(function (c) {
      assert(!/Aceptable|Marginal|Inaceptable|No concluyente/i.test(c.label),
        'y no emite categoria: ' + c.label);
    });
  });

  test('F-07: las fronteras de las bandas AIAG son las aprobadas', function () {
    /* 1.00, 9.00, 10.00 y 30.00 pertenecen a la banda CONDICIONAL. Solo lo
       estrictamente mayor que 30.00 (y que 9.00 en contribucion) es no
       aceptable. Antes de F-07 la contribucion usaba `< 9` y el criterio por
       intervalo `<= 9`: en 9.00 exacto las dos tarjetas se contradecian. */
    var A = MSAAnova.assess;
    assert(A(9.99, null, 0.5, 5, 0.9).studyVar.level === 'ok', '9.99 % de StudyVar: aceptable');
    assert(A(10.00, null, 0.5, 5, 0.9).studyVar.level === 'warn', '10.00 %: condicional');
    assert(A(30.00, null, 0.5, 5, 0.9).studyVar.level === 'warn', '30.00 %: condicional');
    assert(A(30.01, null, 0.5, 5, 0.9).studyVar.level === 'bad', '30.01 %: no aceptable');

    assert(A(5, null, 0.99, 5, 0.9).contribution.level === 'ok', '0.99 % de contribucion: aceptable');
    assert(A(5, null, 1.00, 5, 0.9).contribution.level === 'warn', '1.00 %: condicional');
    assert(A(5, null, 9.00, 5, 0.9).contribution.level === 'warn', '9.00 %: condicional');
    assert(A(5, null, 9.01, 5, 0.9).contribution.level === 'bad', '9.01 %: no aceptable');

    /* Y %Tolerance usa exactamente las mismas fronteras que %StudyVar. */
    assert(A(5, 30.00, 0.5, 5, 0.9).tolerance.level === 'warn', '30.00 % de tolerancia: condicional');
    assert(A(5, 30.01, 0.5, 5, 0.9).tolerance.level === 'bad', '30.01 %: no aceptable');

    /* El vocabulario tambien esta fijado: es el que se imprime. */
    assert(/Condicional segun la aplicacion/.test(A(20, null, 4, 5, 0.9).studyVar.label),
      'la banda intermedia se llama condicional, no marginal');
    assert(/No aceptable/.test(A(40, null, 16, 5, 0.9).studyVar.label),
      'y la alta, no aceptable');
  });

  test('F-07: una sola razon, dos escalas que no pueden contradecirse', function () {
    /* %Contribution = 100*R y %StudyVar = 100*sqrt(R) salen del MISMO
       intervalo de la razon. Antes se simulaban por separado y podian
       discrepar; ahora la igualdad es exacta por construccion. */
    var iv = I.forResult(aiagResult());
    near(iv.contribution.lo, 100 * iv.ratio.lo, 1e-12, 'contribucion inferior = 100*R');
    near(iv.contribution.hi, 100 * iv.ratio.hi, 1e-12, 'contribucion superior = 100*R');
    near(iv.studyVar.lo, 100 * Math.sqrt(iv.ratio.lo), 1e-12, 'studyVar inferior = 100*sqrt(R)');
    near(iv.studyVar.hi, 100 * Math.sqrt(iv.ratio.hi), 1e-12, 'studyVar superior = 100*sqrt(R)');
    /* Y la relacion que la pantalla anuncia entre las dos tarjetas. */
    near(iv.contribution.hi, Math.pow(iv.studyVar.hi / 100, 2) * 100, 1e-9,
      '%Contribucion = (%StudyVar/100)^2 * 100');
  });

  test('F-07: el nivel de confianza por omision es 95 % y se puede cambiar', function () {
    assert(I.DEFAULT_CONF === 0.95, 'por omision, 95 %');
    assert(I.CONF_LEVELS.join(',') === '0.9,0.95,0.99', 'niveles ofrecidos: 90, 95, 99');
    var r = aiagResult();
    var a = I.forResult(r, { conf: 0.90 }), b = I.forResult(r, { conf: 0.99 });
    assert((b.studyVar.hi - b.studyVar.lo) > (a.studyVar.hi - a.studyVar.lo),
      'al 99 % el intervalo es mas ancho que al 90 %');
    assert(I.forResult(r).conf === 0.95, 'y sin pedir nada, 95 %');
  });

  test('F-07: sobre el dataset AIAG dictamina el punto, y el intervalo advierte', function () {
    /* El caso que resume el hallazgo, leido con la politica nueva: el punto
       dice "Condicional" y ESO es el dictamen; el intervalo cruza el 30 % y lo
       unico que hace es advertir que la clasificacion esta cerca del limite. */
    var r = aiagResult();
    var iv = I.forResult(r);
    near(r.metrics.pctStudyVar, 27.86, 0.01, '%StudyVar publicado por Minitab');
    assert(r.assessment.studyVar.level === 'warn', 'el punto dictamina: condicional');
    assert(iv.studyVar.lo < 30 && iv.studyVar.hi > 30, 'y el intervalo cruza el 30 %: [' +
      iv.studyVar.lo.toFixed(2) + ', ' + iv.studyVar.hi.toFixed(2) + ']');
    var c = I.crossings(iv.studyVar);
    assert(c && c.crosses.indexOf(30) >= 0, 'asi que hay advertencia de cruce');
    /* Lo que NO puede pasar: que el estudio se quede sin dictamen. */
    assert(r.assessment.studyVar.label.length > 0, 'siempre hay un dictamen puntual');
  });

  test('F-07: el tamano del estudio ya no bloquea el veredicto, solo avisa', function () {
    /* El piso de 60 mediciones esta retirado: medía el total de mediciones,
       que no distingue estructuras. Un 2x15x2 de 60 da un intervalo mucho mas
       ancho que un 3x10x2 de las mismas 60, y el piso los trataba igual.
       Ahora un estudio chico se calcula, se dictamina y se avisa. */
    var g = maker(99001);
    var chico = MSAAnova.compute(crossed(g, 5, 3, 2, 1, 0.05, 0.14),
                                 { alpha: 0.25, interaction: 'auto' });
    assert(chico.design.n === 30, 'son 30 mediciones, por debajo del piso viejo');
    assert(chico.assessment.studyVar && chico.assessment.studyVar.level,
      'y aun asi hay dictamen puntual: ' + chico.assessment.studyVar.label);
    assert(I.forResult(chico) !== null, 'y hay intervalo');
    var avisa = chico.warnings.some(function (w) { return /piezas|replicas|mediciones/i.test(w); });
    assert(avisa, 'lo que hay es un aviso informativo sobre el diseno');
  });

  test('F-07: se avisa de la representatividad del rango de piezas', function () {
    /* Es la incertidumbre que el intervalo NO mide y que justificaba el piso.
       Sigue siendo un motivo legitimo para advertir; no para bloquear. */
    var g = maker(70707);
    var r = MSAAnova.compute(crossed(g, 10, 3, 3, 1, 0.05, 0.14),
                             { alpha: 0.25, interaction: 'auto' });
    assert(r.warnings.some(function (w) { return /cubrir el rango/i.test(w); }),
      'el aviso de representatividad se emite siempre');
  });

  /* ---------------------------------------------------------------------- *
   * 4. Los generadores de numeros aleatorios, que sostienen todo lo anterior
   * ---------------------------------------------------------------------- */
  test('F-07: la chi2 simulada tiene la media y la varianza que debe', function () {
    /* Si el muestreador estuviera mal, la cobertura de arriba no significaria
       nada. Media = k, varianza = 2k. */
    var u = I._rng(13579);
    [1, 2, 5, 27, 60].forEach(function (k) {
      var n = 20000, s = 0, s2 = 0;
      for (var i = 0; i < n; i++) { var x = I._chi2(u, k); s += x; s2 += x * x; }
      var media = s / n, varianza = s2 / n - media * media;
      near(media, k, 0.06 * k + 0.05, 'media de chi2 con ' + k + ' gl');
      near(varianza, 2 * k, 0.15 * 2 * k + 0.2, 'varianza de chi2 con ' + k + ' gl');
    });
  });

  test('F-07: percentile interpola y respeta los extremos', function () {
    var v = [1, 2, 3, 4, 5];
    near(I._percentile(v, 0), 1, 1e-12, 'minimo');
    near(I._percentile(v, 1), 5, 1e-12, 'maximo');
    near(I._percentile(v, 0.5), 3, 1e-12, 'mediana');
    near(I._percentile([1, 2], 0.5), 1.5, 1e-12, 'interpola');
  });

})(typeof window !== 'undefined' ? window : globalThis);
