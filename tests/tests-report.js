/* ============================================================================
 * tests-report.js - El encabezado del reporte impreso.
 *
 * F-03 de la auditoria: el encabezado daba por hecho la forma de respuesta de
 * los metodos de variables, asi que en atributos `r.metrics.pctStudyVar
 * .toFixed(2)` lanzaba TypeError y la preparacion de impresion abortaba
 * entera. El tercer metodo no podia entregar su documento.
 *
 * Estas pruebas atacan el modelo puro (assets/js/report.js) con los tres
 * resultados REALES de los tres motores, no con objetos de mentira: si un
 * motor cambia la forma de su respuesta, esto se entera.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var T = global.MSATestKit;
  var test = T.test, near = T.near, assert = T.assert;
  var R = global.MSAReport;

  /* --- Los tres estudios, calculados de verdad --------------------------- */

  function crossedResult(opts) {
    return global.MSAAnova.compute(global.AIAG_ROWS(), opts || { lsl: -5, usl: 5 });
  }

  function nestedResult() {
    return global.MSANested.compute(global.AIAG_NESTED_ROWS(), { lsl: -5, usl: 5 });
  }

  /* 3 evaluadores x 6 piezas x 2 replicas, con estandar y dos categorias. */
  function attributeRows(opts) {
    var o = opts || {};
    var truth = { P1: 'Pasa', P2: 'Pasa', P3: 'Pasa', P4: 'No pasa', P5: 'No pasa', P6: 'No pasa' };
    var calls = {
      Ana:  { P1: 'Pasa', P2: 'Pasa', P3: 'No pasa', P4: 'No pasa', P5: 'No pasa', P6: 'No pasa' },
      Beto: { P1: 'Pasa', P2: 'Pasa', P3: 'Pasa',    P4: 'No pasa', P5: 'Pasa',    P6: 'No pasa' },
      Cruz: { P1: 'Pasa', P2: 'Pasa', P3: 'Pasa',    P4: 'No pasa', P5: 'No pasa', P6: 'No pasa' }
    };
    var rows = [];
    Object.keys(calls).forEach(function (op) {
      Object.keys(truth).forEach(function (pt) {
        for (var k = 0; k < 2; k++) {
          var row = { operator: op, part: pt, replicate: k + 1, value: calls[op][pt] };
          if (!o.noStandard) row.standard = truth[pt];
          rows.push(row);
        }
      });
    });
    return rows;
  }

  function attributeResult(opts) {
    var o = opts || {};
    return global.MSAAttribute.compute(attributeRows(o), {
      categories: ['Pasa', 'No pasa'],
      rejectCategory: o.noReject ? '' : 'No pasa'
    });
  }

  /* --- Contextos, como los arma app.js ----------------------------------- */

  var CTX_CRUZADO = { date: '31 de agosto de 2026', method: 'cruzado', operators: 3, parts: 10,
                      replicates: 3, countLabel: 'piezas', spec: 'LSL = -5 , USL = 5',
                      multiplier: '6', alpha: '0.25' };
  var CTX_ANIDADO = { date: '31 de agosto de 2026', method: 'anidado', operators: 3, parts: 10,
                      replicates: 3, countLabel: 'piezas por operador',
                      spec: 'LSL = -5 , USL = 5', multiplier: '6', alpha: '0.25' };
  /* En atributos la caja de especificaciones no se usa, pero app.js la lee
     igual y la pasa: el modelo tiene que ignorarla, no arrastrarla. */
  var CTX_ATRIB = { date: '31 de agosto de 2026', method: 'atributos', operators: 3, parts: 6,
                    replicates: 2, countLabel: 'piezas', spec: 'Sin especificacion',
                    multiplier: '6', alpha: '0.25' };

  function labels(rows) { return rows.map(function (r) { return r[0]; }); }
  function valueOf(rows, label) {
    for (var i = 0; i < rows.length; i++) if (rows[i][0] === label) return rows[i][1];
    return undefined;
  }

  /* ======================================================================== *
   * F-03: el bug original
   * ======================================================================== */

  test('F-03: el encabezado de un estudio de atributos se arma sin lanzar', function () {
    /* La prueba que no existia. Antes esto era un TypeError, no un fallo de
       valor: la preparacion de impresion abortaba y no habia reporte. */
    var rows;
    try {
      rows = R.headerRows(attributeResult(), CTX_ATRIB);
    } catch (e) {
      throw new Error('lanzo ' + e.constructor.name + ': ' + e.message);
    }
    assert(rows.length > 0, 'devuelve filas');
    rows.forEach(function (row) {
      assert(row.length === 2, 'cada fila es [etiqueta, valor]');
      assert(typeof row[0] === 'string' && row[0], 'etiqueta no vacia');
      assert(typeof row[1] === 'string' && row[1], 'valor no vacio en "' + row[0] + '"');
    });
  });

  test('F-03: los tres metodos arman encabezado, y ninguno lanza', function () {
    [['cruzado', crossedResult(), CTX_CRUZADO],
     ['anidado', nestedResult(), CTX_ANIDADO],
     ['atributos', attributeResult(), CTX_ATRIB],
     ['sin calcular', null, CTX_CRUZADO]].forEach(function (caso) {
      var rows;
      try { rows = R.headerRows(caso[1], caso[2]); }
      catch (e) { throw new Error(caso[0] + ' lanzo: ' + e.message); }
      assert(rows.length >= 2, caso[0] + ': trae al menos fecha y estudio');
    });
  });

  /* ======================================================================== *
   * Condicion 1: no inventar para atributos campos propios de variables
   * ======================================================================== */

  test('encabezado: atributos no inventa campos del mundo de la varianza', function () {
    var rows = R.headerRows(attributeResult(), CTX_ATRIB);
    var ls = labels(rows);
    ['% Study Variation (GRR)', 'Categorias distintas', 'Discriminacion', 'Modelo',
     'Multiplicador', 'Especificacion', 'Alfa'].forEach(function (prohibido) {
      assert(ls.indexOf(prohibido) < 0,
             'atributos no debe traer la fila "' + prohibido + '"; trae: ' + ls.join(' | '));
    });
    /* Y ningun valor debe mencionar esos conceptos por otro camino. */
    var texto = rows.map(function (r) { return r[0] + ' ' + r[1]; }).join(' ');
    ['%GRR', 'NDC', 'sigma', 'varianza'].forEach(function (palabra) {
      assert(texto.indexOf(palabra) < 0, 'aparece "' + palabra + '" en: ' + texto);
    });
  });

  test('encabezado: atributos trae las cifras con las que SI se decide', function () {
    var rows = R.headerRows(attributeResult(), CTX_ATRIB);
    var ls = labels(rows);
    ['Categorias', 'Estandar', 'Categoria de rechazo', 'Dentro del evaluador (peor)',
     'Entre evaluadores', 'Todos vs estandar', 'Efectividad (peor)',
     'Error de fuga (peor)', 'Falsa alarma (peor)'].forEach(function (esperada) {
      assert(ls.indexOf(esperada) >= 0, 'falta la fila "' + esperada + '": ' + ls.join(' | '));
    });
    assert(valueOf(rows, 'Categoria de rechazo').indexOf('"No pasa"') === 0,
           'nombra la categoria de rechazo elegida');
    assert(/^\d+\.\d{2} %$/.test(valueOf(rows, 'Entre evaluadores')),
           'los porcentajes van con dos decimales y su signo');
  });

  test('encabezado: la palabra del tamano del estudio cambia con el metodo', function () {
    var attr = valueOf(R.headerRows(attributeResult(), CTX_ATRIB), 'Estudio');
    var cruz = valueOf(R.headerRows(crossedResult(), CTX_CRUZADO), 'Estudio');
    assert(attr.indexOf('evaluadores') >= 0 && attr.indexOf('clasificaciones') >= 0,
           'atributos habla de evaluadores y clasificaciones: ' + attr);
    assert(cruz.indexOf('operadores') >= 0 && cruz.indexOf('mediciones') >= 0,
           'variables habla de operadores y mediciones: ' + cruz);
    assert(attr.indexOf('3 evaluadores x 6 piezas x 2 replicas = 36') === 0, attr);
  });

  /* ======================================================================== *
   * Condicion 2: no imprimir lo que no corresponde
   * ======================================================================== */

  test('encabezado: alfa solo en el cruzado, y la fila desaparece en el resto', function () {
    /* Antes el anidado imprimia "Alfa: no aplica", que gasta un renglon del
       reporte en no decir nada. La fila entera se va. */
    assert(labels(R.headerRows(crossedResult(), CTX_CRUZADO)).indexOf('Alfa') >= 0,
           'el cruzado si prueba la interaccion, asi que alfa aplica');
    assert(labels(R.headerRows(nestedResult(), CTX_ANIDADO)).indexOf('Alfa') < 0,
           'el anidado no tiene interaccion estimable: nada de "Alfa: no aplica"');
    assert(labels(R.headerRows(attributeResult(), CTX_ATRIB)).indexOf('Alfa') < 0,
           'atributos no tiene ANOVA');
  });

  test('encabezado: sin estandar no se imprime lo que el estandar habilita', function () {
    var rows = R.headerRows(attributeResult({ noStandard: true }), CTX_ATRIB);
    var ls = labels(rows);
    assert(valueOf(rows, 'Estandar') === 'no capturado', 'lo dice explicitamente');
    ['Todos vs estandar', 'Categoria de rechazo', 'Efectividad (peor)',
     'Error de fuga (peor)', 'Falsa alarma (peor)'].forEach(function (prohibida) {
      assert(ls.indexOf(prohibida) < 0, 'sin estandar no debe salir "' + prohibida + '"');
    });
    /* Lo que no depende del estandar sigue ahi. */
    assert(ls.indexOf('Entre evaluadores') >= 0, 'la concordancia entre evaluadores no depende del estandar');
  });

  test('encabezado: sin categoria de rechazo elegida se dice, no se inventa (F-04)', function () {
    var rows = R.headerRows(attributeResult({ noReject: true }), CTX_ATRIB);
    assert(valueOf(rows, 'Categoria de rechazo') === 'sin elegir',
           'dice "sin elegir", que no es lo mismo que "No evaluable"');
    ['Efectividad (peor)', 'Error de fuga (peor)', 'Falsa alarma (peor)'].forEach(function (l) {
      assert(labels(rows).indexOf(l) < 0, 'sin categoria de rechazo no sale "' + l + '"');
    });
  });

  test('encabezado: una sola replica no imprime la concordancia interna', function () {
    var rows = attributeRows().filter(function (r) { return r.replicate === 1; });
    var res = global.MSAAttribute.compute(rows, { categories: ['Pasa', 'No pasa'],
                                                  rejectCategory: 'No pasa' });
    var hdr = R.headerRows(res, CTX_ATRIB);
    assert(labels(hdr).indexOf('Dentro del evaluador (peor)') < 0,
           'con una replica no hay repetibilidad del atributo que reportar');
  });

  /* ======================================================================== *
   * Condicion 3: "No evaluable", nunca undefined / null / NaN
   * ======================================================================== */

  test('encabezado: ningun valor sale como undefined, null o NaN', function () {
    var casos = [
      ['cruzado', crossedResult(), CTX_CRUZADO],
      ['cruzado sin spec', crossedResult({}), CTX_CRUZADO],
      ['anidado', nestedResult(), CTX_ANIDADO],
      ['atributos', attributeResult(), CTX_ATRIB],
      ['atributos sin estandar', attributeResult({ noStandard: true }), CTX_ATRIB],
      ['atributos sin rechazo', attributeResult({ noReject: true }), CTX_ATRIB],
      ['sin calcular', null, CTX_CRUZADO]
    ];
    casos.forEach(function (caso) {
      R.headerRows(caso[1], caso[2]).forEach(function (row) {
        assert(!/undefined|null|NaN|Infinity/.test(row[1]),
               caso[0] + ' -> "' + row[0] + '": "' + row[1] + '"');
      });
    });
  });

  test('encabezado: un estudio degenerado dice No evaluable y lo declara no concluyente', function () {
    var rows = [];
    ['A', 'B', 'C'].forEach(function (op) {
      for (var p = 1; p <= 10; p++) for (var k = 0; k < 3; k++) {
        rows.push({ operator: op, part: 'P' + p, value: 10 });
      }
    });
    var hdr = R.headerRows(global.MSAAnova.compute(rows, { tolerance: 1 }), CTX_CRUZADO);
    assert(valueOf(hdr, 'Categorias distintas') === 'No evaluable',
           'el NDC no se puede calcular y lo dice, no imprime "inf"');
    assert(valueOf(hdr, 'Discriminacion') === 'No concluyente', 'el estado se publica');
    assert(valueOf(hdr, 'Veredicto') === 'Estudio no concluyente',
           'y el reporte lleva la fila que impide firmarlo por error');
  });

  test('encabezado: los formateadores distinguen ausencia de cero', function () {
    assert(R.numOr(0, 2, ' %') === '0.00 %', 'un cero es un dato, no una ausencia');
    [null, undefined, NaN, Infinity, -Infinity, 'texto'].forEach(function (v) {
      assert(R.numOr(v, 2) === R.NO_EVAL, 'numOr(' + String(v) + ') debe ser No evaluable');
    });
    [null, undefined, '', '  ', 'undefined', 'null', 'NaN'].forEach(function (v) {
      assert(R.textOr(v) === R.NO_EVAL, 'textOr(' + String(v) + ') debe ser No evaluable');
    });
    assert(R.textOr('0') === '0', 'el texto "0" es un dato');
  });

  /* ======================================================================== *
   * Que el encabezado no invente numeros
   * ======================================================================== */

  test('encabezado: los numeros salen del resultado, no de una copia', function () {
    var r = crossedResult();
    var hdr = R.headerRows(r, CTX_CRUZADO);
    assert(valueOf(hdr, '% Study Variation (GRR)') === r.metrics.pctStudyVar.toFixed(2) + ' %',
           'el %SV impreso es el calculado');
    assert(valueOf(hdr, 'Categorias distintas') === r.ndcLabel, 'el NDC impreso es el calculado');
    assert(valueOf(hdr, 'Discriminacion') === r.discrimination.label, 'la discriminacion tambien');

    var a = attributeResult(), ah = R.headerRows(a, CTX_ATRIB);
    assert(valueOf(ah, 'Error de fuga (peor)') === a.metrics.worstMiss.toFixed(2) + ' %',
           'la fuga impresa es la calculada');
    assert(valueOf(ah, 'Kappa (' + a.metrics.kappaSource + ')') === a.metrics.kappa.toFixed(4),
           'kappa impresa con su fuente');
  });

  /* ======================================================================== *
   * F-03.1: imprimir SIN haber calculado
   *
   * La brecha que dejo abierta la correccion de F-03: el metodo se deducia
   * solo de result.model, y sin resultado no hay model, asi que un estudio de
   * atributos se imprimia con el encabezado de variables ("3 operadores x 30
   * piezas = 270 mediciones", Especificacion, Multiplicador).
   *
   * Prioridad que se prueba aqui: (a) result manda, (b) si no hay result manda
   * ctx.method, (c) si no hay ninguno, encabezado neutral.
   * ======================================================================== */

  var PROHIBIDO_EN_ATRIBUTOS = ['Especificacion', 'Multiplicador', 'Alfa', 'Modelo',
                                'Categorias distintas', '% Study Variation (GRR)',
                                'Discriminacion'];

  test('F-03.1 a: con resultado, manda result.model aunque ctx.method mienta', function () {
    /* Si las dos fuentes se contradicen, gana el resultado: es el que sabe que
       se calculo de verdad. Un ctx.method desincronizado no puede convertir un
       estudio de concordancia en uno de varianza. */
    var rows = R.headerRows(attributeResult(), Object.assign({}, CTX_ATRIB, { method: 'cruzado' }));
    assert(labels(rows).indexOf('Kappa (contra el estandar)') >= 0,
           'sigue siendo un encabezado de atributos: ' + labels(rows).join(', '));
    PROHIBIDO_EN_ATRIBUTOS.forEach(function (l) {
      assert(labels(rows).indexOf(l) < 0, 'no debe aparecer "' + l + '"');
    });
    var v = R.headerRows(crossedResult(), Object.assign({}, CTX_CRUZADO, { method: 'atributos' }));
    assert(labels(v).indexOf('% Study Variation (GRR)') >= 0,
           'y al reves: un resultado de variables manda sobre ctx.method atributos');
    assert(R.studyKind(attributeResult(), { method: 'cruzado' }) === 'atributos', 'studyKind (a)');
  });

  test('F-03.1 b: sin resultado, manda ctx.method = atributos', function () {
    var rows = R.headerRows(null, CTX_ATRIB);
    assert(R.studyKind(null, CTX_ATRIB) === 'atributos', 'studyKind (b)');
    var l = labels(rows);
    /* Lo que SI puede mostrar. */
    assert(valueOf(rows, 'Estudio').indexOf('evaluadores') >= 0,
           'evaluadores, no operadores: ' + valueOf(rows, 'Estudio'));
    assert(valueOf(rows, 'Estudio').indexOf('clasificaciones') >= 0,
           'clasificaciones, no mediciones: ' + valueOf(rows, 'Estudio'));
    assert(valueOf(rows, 'Estudio').indexOf('3 evaluadores x 6 piezas x 2 replicas') === 0,
           'evaluadores x piezas x replicas: ' + valueOf(rows, 'Estudio'));
    assert(valueOf(rows, 'Metodo') === 'Attribute Agreement Analysis', 'declara el metodo');
    assert(valueOf(rows, 'Estado') === 'Sin calcular', 'declara el estado');
    /* Lo que NO puede mostrar. */
    PROHIBIDO_EN_ATRIBUTOS.forEach(function (label) {
      assert(l.indexOf(label) < 0, 'sin calcular no debe imprimir "' + label + '": ' + l.join(', '));
    });
    ['Kappa', 'Efectividad', 'Error de fuga', 'Falsa alarma', 'Entre evaluadores',
     'Todos vs estandar'].forEach(function (frag) {
      assert(!l.some(function (x) { return x.indexOf(frag) >= 0; }),
             'no se anuncia "' + frag + '" antes de calcularla: ' + l.join(', '));
    });
  });

  test('F-03.1 b: la categoria de rechazo sale de la pantalla, o dice que falta', function () {
    var sin = R.headerRows(null, CTX_ATRIB);
    assert(valueOf(sin, 'Categoria de rechazo') === 'No seleccionada',
           'sin elegir se dice, no se inventa: ' + valueOf(sin, 'Categoria de rechazo'));
    var con = R.headerRows(null, Object.assign({}, CTX_ATRIB, { rejectCategory: 'No pasa' }));
    assert(valueOf(con, 'Categoria de rechazo') === '"No pasa"',
           'elegida se imprime: ' + valueOf(con, 'Categoria de rechazo'));
    /* Un valor en blanco de la pantalla es "no seleccionada", no "" ni NaN. */
    var vacio = R.headerRows(null, Object.assign({}, CTX_ATRIB, { rejectCategory: '   ' }));
    assert(valueOf(vacio, 'Categoria de rechazo') === 'No seleccionada', 'blancos = no seleccionada');
  });

  test('F-03.1 b: sin resultado, cruzado y anidado conservan su encabezado', function () {
    var cru = R.headerRows(null, CTX_CRUZADO), ani = R.headerRows(null, CTX_ANIDADO);
    assert(R.studyKind(null, CTX_CRUZADO) === 'variables', 'studyKind cruzado');
    assert(R.studyKind(null, CTX_ANIDADO) === 'variables', 'studyKind anidado');
    [cru, ani].forEach(function (rows, i) {
      assert(valueOf(rows, 'Estudio').indexOf('operadores') >= 0, 'caso ' + i + ': operadores');
      assert(valueOf(rows, 'Estudio').indexOf('mediciones') >= 0, 'caso ' + i + ': mediciones');
      assert(valueOf(rows, 'Especificacion') !== undefined, 'caso ' + i + ': especificacion');
      assert(valueOf(rows, 'Multiplicador') === '6 sigma', 'caso ' + i + ': multiplicador');
      assert(valueOf(rows, 'Modelo') === 'Sin calcular', 'caso ' + i + ': modelo sin calcular');
      /* Ni %SV ni NDC ni discriminacion: no hay de donde sacarlos. */
      ['% Study Variation (GRR)', 'Categorias distintas', 'Discriminacion'].forEach(function (l) {
        assert(labels(rows).indexOf(l) < 0, 'caso ' + i + ': no inventa "' + l + '"');
      });
    });
    assert(labels(cru).indexOf('Alfa') >= 0, 'alfa en el cruzado');
    assert(labels(ani).indexOf('Alfa') < 0, 'alfa NO en el anidado, tampoco sin calcular');
  });

  test('F-03.1 c: sin resultado y sin metodo reconocible, encabezado neutral', function () {
    [undefined, {}, { method: '' }, { method: 'inventado' }].forEach(function (c, i) {
      var ctx = Object.assign({ date: 'hoy', operators: 3, parts: 10, replicates: 3 }, c || {});
      var rows = R.headerRows(null, ctx);
      assert(R.studyKind(null, ctx) === null, 'caso ' + i + ': studyKind neutral');
      var l = labels(rows);
      assert(l.join(',') === 'Fecha,Estudio,Estado',
             'caso ' + i + ': solo fecha, tamano y estado -> ' + l.join(','));
      assert(valueOf(rows, 'Estudio') === '3 x 10 x 3 = 90 celdas',
             'caso ' + i + ': el tamano no se adjetiva -> ' + valueOf(rows, 'Estudio'));
      assert(valueOf(rows, 'Estado') === 'Sin calcular', 'caso ' + i + ': estado');
    });
  });

  test('F-03.1: ningun encabezado sin calcular trae undefined, null ni NaN', function () {
    [CTX_CRUZADO, CTX_ANIDADO, CTX_ATRIB, {}, { method: 'atributos' }].forEach(function (ctx, i) {
      R.headerRows(null, ctx).forEach(function (row) {
        assert(typeof row[1] === 'string' && row[1] !== '', 'caso ' + i + ': valor vacio en ' + row[0]);
        assert(!/undefined|null|NaN/.test(row[1]),
               'caso ' + i + ': "' + row[0] + '" = "' + row[1] + '"');
      });
    });
  });

  /* ======================================================================== *
   * F-05: un resultado caduco no se imprime como si fuera de estos datos
   * ======================================================================== */

  test('F-05: con ctx.stale, ninguna cifra del resultado viejo llega al papel', function () {
    var r = crossedResult();
    var vivo = R.headerRows(r, CTX_CRUZADO);
    var caduco = R.headerRows(r, Object.assign({}, CTX_CRUZADO, { stale: true }));

    assert(valueOf(vivo, '% Study Variation (GRR)') !== undefined, 'el vivo si publica el %SV');
    ['% Study Variation (GRR)', 'Categorias distintas', 'Discriminacion', 'Modelo',
     'Especificacion', 'Multiplicador', 'Alfa'].forEach(function (l) {
      assert(labels(caduco).indexOf(l) < 0, 'caduco no debe traer "' + l + '"');
    });
    assert(valueOf(caduco, 'Estado') === R.STALE_TEXT, 'lo dice: ' + valueOf(caduco, 'Estado'));
    /* Ni siquiera por accidente puede colarse el numero viejo. */
    var texto = caduco.map(function (row) { return row.join(' '); }).join(' | ');
    assert(texto.indexOf(r.metrics.pctStudyVar.toFixed(2)) < 0,
           'el %SV viejo no aparece en ninguna fila: ' + texto);
  });

  test('F-05: caduco en atributos tampoco publica sus cifras', function () {
    var a = attributeResult();
    var caduco = R.headerRows(a, Object.assign({}, CTX_ATRIB, { stale: true }));
    ['Kappa', 'Efectividad', 'Error de fuga', 'Falsa alarma', 'Entre evaluadores'].forEach(function (f) {
      assert(!labels(caduco).some(function (l) { return l.indexOf(f) >= 0; }),
             'caduco no debe traer "' + f + '": ' + labels(caduco).join(', '));
    });
    assert(valueOf(caduco, 'Estado') === R.STALE_TEXT, 'lo dice');
    /* El tamano del estudio si se conserva, y con las palabras del metodo
       activo: no depende del calculo, se lee de la pantalla. */
    assert(valueOf(caduco, 'Estudio').indexOf('evaluadores') >= 0,
           'sigue siendo un estudio de atributos: ' + valueOf(caduco, 'Estudio'));
  });

  test('F-05: sin resultado, ctx.stale no cambia nada', function () {
    /* stale solo tiene sentido frente a un resultado publicado. Sin el, el
       encabezado es el de "sin calcular" de F-03.1, no un tercer estado. */
    ['cruzado', 'atributos'].forEach(function (m) {
      var ctx = Object.assign({}, m === 'cruzado' ? CTX_CRUZADO : CTX_ATRIB, { stale: true });
      var a = R.headerRows(null, ctx);
      var b = R.headerRows(null, Object.assign({}, ctx, { stale: false }));
      assert(JSON.stringify(a) === JSON.stringify(b), m + ': stale sin resultado no cambia nada');
      assert(valueOf(a, 'Estado') !== R.STALE_TEXT, m + ': no anuncia caducidad de nada');
    });
  });

})(typeof window !== 'undefined' ? window : globalThis);
