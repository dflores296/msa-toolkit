/* ============================================================================
 * tests-design.js - F-02: identidad de la pieza y enrutado de metodo.
 *
 * QUE SE ESTA PROBANDO Y POR QUE
 *
 * F-02 de la auditoria: numerar 1..n las piezas de cada operador -- la
 * convencion mas natural de una prueba destructiva -- hacia que la aplicacion
 * se cambiara sola al metodo cruzado, afirmando "todos los operadores midieron
 * las mismas piezas". Es falso, y el ANOVA que salia de ahi traia un termino
 * operador x pieza que no existe fisicamente: la pieza 1 de Ana y la pieza 1
 * de Beto nunca fueron la misma pieza porque medirlas las destruyo.
 *
 * Las seis situaciones que cubre esta suite son las que pide la auditoria:
 *
 *   a) anidado con piezas 1..n repetidas localmente por operador
 *   b) anidado con identificadores unicos globales
 *   c) cruzado donde todos miden las mismas piezas
 *   d) importacion que conserva explicitamente el metodo seleccionado
 *   e) reordenar filas no cambia el diseno ni los resultados
 *   f) cambiar nombres locales de piezas, conservando la estructura, no cambia
 *      los componentes de varianza
 *
 * La pareja (a) y (b) es la prueba central: son LAS MISMAS mediciones con dos
 * convenciones de etiquetado distintas, y tienen que dar exactamente los
 * mismos componentes de varianza. Antes de F-02, (b) pasaba y (a) ni siquiera
 * llegaba al motor.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var test = global.MSATestKit.test, near = global.MSATestKit.near,
      assert = global.MSATestKit.assert;

  /* --- Un estudio destructivo pequeno, deterministico y con estructura clara.
     Tres operadores, cinco piezas cada uno, tres replicas. Los valores no
     salen de ningun dataset publicado: lo que se prueba aqui no son cifras
     de referencia (de eso se encarga tests-nested.js contra AIAG) sino que
     el ETIQUETADO no mueve el resultado. --------------------------------- */
  var OPS = ['Ana', 'Beto', 'Cruz'];
  var PER_OP = 5, REPS = 3;

  /** Valor de la replica k de la pieza p del operador oi. Sin azar. */
  function valueAt(oi, p, k) {
    return 10 + p * 0.7 + oi * 0.04 + ((p * 7 + k * 3 + oi * 11) % 5) * 0.01;
  }

  /* nameOf(oi, p) decide la CONVENCION de etiquetado; la estructura del
     experimento (quien midio que, y con que valores) es siempre la misma. */
  function build(nameOf) {
    var rows = [];
    OPS.forEach(function (op, oi) {
      for (var p = 0; p < PER_OP; p++) {
        for (var k = 0; k < REPS; k++) {
          rows.push({ operator: op, part: nameOf(oi, p), value: valueAt(oi, p, k) });
        }
      }
    });
    return rows;
  }

  /** (a) Cada operador numera SUS piezas 1..5. Los nombres se repiten. */
  function localNames(oi, p) { return String(p + 1); }
  /** (b) Numeracion corrida 1..15. Ningun nombre se repite. */
  function globalNames(oi, p) { return String(oi * PER_OP + p + 1); }
  /** (f) Otros nombres locales, misma estructura. */
  function otherLocalNames(oi, p) { return 'Probeta-' + String.fromCharCode(65 + p); }

  function comps(res) {
    return { part: res.variance.part, op: res.variance.operator, rep: res.variance.repeatability,
             repro: res.variance.reproducibility, grr: res.variance.grr, total: res.variance.total };
  }
  function sameComponents(a, b, what) {
    Object.keys(a).forEach(function (k) {
      near(b[k], a[k], 1e-12, what + ' -> componente ' + k);
    });
  }
  function sourcesOf(res) { return res.anova.map(function (r) { return r.source; }); }

  /* ---------------------------------------------------------------------- *
   * a) Anidado con piezas 1..n repetidas localmente por operador
   * ---------------------------------------------------------------------- */
  test('F-02 a: el anidado acepta piezas 1..n renumeradas por cada operador', function () {
    var v = MSANested.validate(build(localNames));
    assert(v.ok, 'la validacion debe pasar: ' + v.errors.join(' | '));
    assert(v.meta.partsPerOperator === PER_OP, '5 piezas por operador, se obtuvo ' + v.meta.partsPerOperator);
    assert(v.meta.replicates === REPS, '3 replicas, se obtuvo ' + v.meta.replicates);
    /* El nombre local se conserva; la identidad interna se califica. */
    assert(v.meta.parts.join(',') === '1,2,3,4,5,1,2,3,4,5,1,2,3,4,5',
      'los nombres capturados se conservan tal cual: ' + v.meta.parts.join(','));
    assert(v.meta.partIds[0] === 'Ana|1' && v.meta.partIds[5] === 'Beto|1',
      'la identidad estadistica califica el nombre con el operador: ' + v.meta.partIds.slice(0, 6).join(','));
    var ids = {};
    v.meta.partIds.forEach(function (id) { ids[id] = true; });
    assert(Object.keys(ids).length === OPS.length * PER_OP,
      '15 identidades distintas, se obtuvieron ' + Object.keys(ids).length);
  });

  test('F-02 a: el mensaje ya no empuja al metodo cruzado, avisa y ofrece la salida', function () {
    var v = MSANested.validate(build(localNames));
    var w = v.warnings.join(' | ');
    assert(v.errors.length === 0, 'sin errores: ' + v.errors.join(' | '));
    assert(w.indexOf(MSADesign.REPEATED_LABEL_NOTICE) >= 0,
      'debe decir que son objetos fisicos distintos: ' + w);
    assert(w.indexOf(MSADesign.CROSSED_HINT) >= 0,
      'debe ofrecer el cruzado como alternativa condicional: ' + w);
    /* Punto 6 de la auditoria: no se afirma que las piezas sean las mismas. */
    assert(w.indexOf('midieron las mismas piezas') < 0,
      'no se afirma que las piezas sean las mismas: ' + w);
    assert(w.indexOf('usa el metodo Cruzado') < 0,
      'no se ordena cambiar de metodo: ' + w);
  });

  test('F-02 a: identificadores unicos no levantan el aviso', function () {
    var v = MSANested.validate(build(globalNames));
    assert(v.ok, 'la validacion debe pasar: ' + v.errors.join(' | '));
    assert(v.meta.repeatedLabels.length === 0, 'sin nombres repetidos');
    var w = v.warnings.join(' | ');
    assert(w.indexOf(MSADesign.REPEATED_LABEL_NOTICE) < 0, 'sin aviso de nombres repetidos: ' + w);
    assert(w.indexOf(MSADesign.CROSSED_HINT) < 0, 'sin sugerencia de cruzado: ' + w);
  });

  /* ---------------------------------------------------------------------- *
   * a) + b) Las mismas mediciones con las dos convenciones -> el mismo ANOVA
   * ---------------------------------------------------------------------- */
  test('F-02 a=b: numerar 1..n por operador o 1..15 corrido da el mismo resultado', function () {
    var local = MSANested.compute(build(localNames), {});
    var glob = MSANested.compute(build(globalNames), {});
    sameComponents(comps(glob), comps(local), 'etiquetado local contra global');
    near(local.metrics.pctStudyVar, glob.metrics.pctStudyVar, 1e-12, '% Study Variation');
    near(local.metrics.pctContribution, glob.metrics.pctContribution, 1e-12, '% Contribucion');
    assert(local.ndc === glob.ndc, 'mismo NDC (' + local.ndc + ' contra ' + glob.ndc + ')');
    local.anova.forEach(function (row, i) {
      assert(row.source === glob.anova[i].source, 'misma tabla ANOVA fila ' + i);
      if (row.ss !== null) near(row.ss, glob.anova[i].ss, 1e-12, 'SC ' + row.source);
      assert(row.df === glob.anova[i].df, 'gl ' + row.source);
    });
  });

  /* ---------------------------------------------------------------------- *
   * 7) El motor anidado calcula Pieza(Operador) y no fabrica interaccion
   * ---------------------------------------------------------------------- */
  test('F-02: el anidado calcula Pieza(Operador) y no genera Operador x Pieza', function () {
    [localNames, globalNames].forEach(function (nameOf, i) {
      var res = MSANested.compute(build(nameOf), {});
      var src = sourcesOf(res).join(' | ');
      assert(src.indexOf('Pieza (Operador)') >= 0, 'convencion ' + i + ': falta Pieza (Operador) -> ' + src);
      assert(src.indexOf('Operador * Parte') < 0 && src.indexOf('Operador x Pieza') < 0 &&
             src.indexOf('Interaccion') < 0,
        'convencion ' + i + ': la tabla trae un termino de interaccion -> ' + src);
      assert(res.variance.interaction === 0, 'la varianza de interaccion es cero por construccion');
      assert(res.model === 'nested' && res.method === 'anidado', 'el resultado se declara anidado');
      /* Los grados de libertad son los del modelo anidado, no los del cruzado:
         o(n-1) = 3*4 = 12 para Pieza(Operador), sin 4 y 8 separados. */
      var pieza = res.anova.filter(function (r) { return r.source === 'Pieza (Operador)'; })[0];
      assert(pieza.df === OPS.length * (PER_OP - 1), 'gl Pieza(Operador) = o(n-1) = 12, se obtuvo ' + pieza.df);
    });
  });

  /* ---------------------------------------------------------------------- *
   * c) Cruzado donde todos miden las mismas piezas
   * ---------------------------------------------------------------------- */
  test('F-02 c: el cruzado con piezas realmente compartidas sigue siendo cruzado', function () {
    /* Aqui la pieza p SI es la misma para los tres operadores, asi que el
       valor depende de la pieza y no del operador que la etiqueto. */
    var rows = [];
    OPS.forEach(function (op, oi) {
      for (var p = 0; p < PER_OP; p++) {
        for (var k = 0; k < REPS; k++) {
          rows.push({ operator: op, part: String(p + 1), value: valueAt(0, p, k) + oi * 0.03 });
        }
      }
    });
    var observed = MSADesign.observe([['1', '2', '3', '4', '5'], ['1', '2', '3', '4', '5'],
                                      ['1', '2', '3', '4', '5']]);
    assert(observed.allShared, 'los tres operadores traen la misma lista');
    assert(observed.repeatedLabels.length === PER_OP, 'los cinco nombres se repiten');

    /* Estando en cruzado, un archivo asi no mueve nada: ni cambia de metodo
       ni pregunta. Es el caso para el que el cruzado existe. */
    var routed = MSADesign.route({ activeMethod: 'cruzado', explicitMethod: null,
                                   observed: observed, categorical: false });
    assert(routed.method === 'cruzado' && !routed.changed, 'se queda en cruzado');
    assert(routed.question === null, 'no pregunta nada: ' + routed.question);

    var res = MSAAnova.compute(rows, { interaction: 'include' });
    var src = sourcesOf(res).join(' | ');
    assert(src.indexOf('Operador * Parte') >= 0,
      'el cruzado si tiene interaccion estimable: ' + src);
    assert(res.design.parts.length === PER_OP, 'cinco piezas compartidas, no quince');
  });

  /* ---------------------------------------------------------------------- *
   * 3) Nunca convertir un anidado en cruzado por coincidencia de nombres
   * ---------------------------------------------------------------------- */
  test('F-02: estando en anidado, nombres repetidos NO cambian el metodo', function () {
    var observed = MSADesign.observe([['1', '2', '3', '4', '5'], ['1', '2', '3', '4', '5'],
                                      ['1', '2', '3', '4', '5']]);
    var routed = MSADesign.route({ activeMethod: 'anidado', explicitMethod: null,
                                   observed: observed, categorical: false });
    assert(routed.method === 'anidado', 'sigue en anidado, se obtuvo ' + routed.method);
    assert(routed.changed === false, 'no se cambio de metodo');
    assert(routed.proposal === null && routed.question === null,
      'ni siquiera se propone el cambio: ' + routed.proposal);
    var n = routed.notes.join(' | ');
    assert(n.indexOf(MSADesign.REPEATED_LABEL_NOTICE) >= 0, 'avisa como se leen los nombres: ' + n);
    assert(n.indexOf(MSADesign.CROSSED_HINT) >= 0, 'ofrece el cruzado si las piezas eran las mismas: ' + n);
    assert(n.indexOf('midieron las mismas piezas') < 0, 'no afirma que sean las mismas: ' + n);
  });

  test('F-02: estando en cruzado, piezas todas distintas se PREGUNTA, no se decide', function () {
    var observed = MSADesign.observe([['1', '2'], ['3', '4'], ['5', '6']]);
    var routed = MSADesign.route({ activeMethod: 'cruzado', explicitMethod: null,
                                   observed: observed, categorical: false });
    assert(routed.method === 'cruzado' && !routed.changed, 'no se cambia solo');
    assert(routed.proposal === 'anidado', 'se propone el anidado, se obtuvo ' + routed.proposal);
    assert(/\?$/.test(String(routed.question).trim()), 'la propuesta es una pregunta: ' + routed.question);
  });

  /* ---------------------------------------------------------------------- *
   * d) Importacion que conserva explicitamente el metodo seleccionado
   * ---------------------------------------------------------------------- */
  test('F-02 d: el metodo declarado por el archivo manda sobre los nombres', function () {
    assert(MSADesign.methodOfPayload({ method: 'anidado' }) === 'anidado', 'campo method');
    assert(MSADesign.methodOfPayload({ config: { method: 'anidado' } }) === 'anidado', 'config.method');
    assert(MSADesign.methodOfPayload({ format: 'msa-toolkit/gage-rr-anova-nested' }) === 'anidado',
      'format nested');
    assert(MSADesign.methodOfPayload({ format: 'msa-toolkit/gage-rr-anova-crossed' }) === 'cruzado',
      'format crossed');
    assert(MSADesign.methodOfPayload({ format: 'msa-toolkit/atributos' }) === 'atributos', 'format atributos');
    assert(MSADesign.methodOfPayload({ format: 'algo-que-no-dice' }) === null, 'formato mudo -> null');
    assert(MSADesign.methodOfPayload({ method: 'inventado' }) === null, 'metodo desconocido -> null');

    /* Un archivo anidado cuyas piezas se llaman 1..5 en los tres operadores,
       importado estando en cruzado: antes se cargaba como cruzado. */
    var observed = MSADesign.observe([['1', '2', '3'], ['1', '2', '3'], ['1', '2', '3']]);
    var routed = MSADesign.route({ activeMethod: 'cruzado', explicitMethod: 'anidado',
                                   observed: observed, categorical: false });
    assert(routed.method === 'anidado' && routed.changed && routed.explicit,
      'el archivo declara anidado y se respeta: ' + routed.method);
    assert(routed.question === null, 'no se pregunta lo que el archivo ya dijo');
    assert(routed.notes.join(' | ').indexOf(MSADesign.REPEATED_LABEL_NOTICE) >= 0,
      'y se avisa como se leeran los nombres repetidos');
  });

  test('F-02 d: sin declaracion, importar no saca del metodo activo', function () {
    /* Es el caso del CSV, que no lleva metodo. La unica garantia posible es
       que el metodo elegido por la persona sobreviva a la importacion. */
    var repetidos = MSADesign.observe([['1', '2', '3'], ['1', '2', '3'], ['1', '2', '3']]);
    var propios = MSADesign.observe([['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9']]);
    [repetidos, propios].forEach(function (observed, i) {
      var routed = MSADesign.route({ activeMethod: 'anidado', explicitMethod: null,
                                     observed: observed, categorical: false });
      assert(routed.method === 'anidado' && !routed.changed,
        'caso ' + i + ': el anidado sobrevive a la importacion, se obtuvo ' + routed.method);
    });
  });

  test('F-02 d: el tipo de dato sigue mandando, y no lo pisa el diseno', function () {
    var observed = MSADesign.observe([['1', '2'], ['1', '2']]);
    var routed = MSADesign.route({ activeMethod: 'anidado', explicitMethod: null,
                                   observed: observed, categorical: true });
    assert(routed.method === 'atributos' && routed.changed,
      'un archivo de categorias va a atributos, se obtuvo ' + routed.method);
  });

  /* ---------------------------------------------------------------------- *
   * e) Reordenar filas no cambia el diseno ni los resultados
   * ---------------------------------------------------------------------- */
  test('F-02 e: reordenar las filas no cambia el diseno observado', function () {
    var rows = build(localNames);
    /* Barajado deterministico: se recorre con paso primo. */
    var shuffled = [], step = 23;
    for (var i = 0; i < rows.length; i++) shuffled.push(rows[(i * step) % rows.length]);

    var a = MSADesign.observeRows(rows), b = MSADesign.observeRows(shuffled);
    assert(a.operators.sort().join(',') === b.operators.slice().sort().join(','), 'mismos operadores');
    assert(a.allDistinct === b.allDistinct && a.allShared === b.allShared, 'misma lectura del diseno');
    assert(a.repeatedLabels.slice().sort().join(',') === b.repeatedLabels.slice().sort().join(','),
      'mismos nombres repetidos');
    /* Y el enrutado, que es lo que decide el metodo, tampoco se mueve. */
    ['cruzado', 'anidado'].forEach(function (m) {
      var ra = MSADesign.route({ activeMethod: m, observed: a, categorical: false });
      var rb = MSADesign.route({ activeMethod: m, observed: b, categorical: false });
      assert(ra.method === rb.method && ra.proposal === rb.proposal,
        'desde ' + m + ': el orden de las filas no mueve el enrutado');
    });
  });

  test('F-02 e: reordenar las filas no cambia los componentes de varianza', function () {
    var rows = build(localNames);
    var shuffled = [], step = 23;
    for (var i = 0; i < rows.length; i++) shuffled.push(rows[(i * step) % rows.length]);
    var base = MSANested.compute(rows, {});
    var mix = MSANested.compute(shuffled, {});
    sameComponents(comps(base), comps(mix), 'filas reordenadas');
    near(mix.metrics.pctStudyVar, base.metrics.pctStudyVar, 1e-12, '% Study Variation');
  });

  /* ---------------------------------------------------------------------- *
   * f) Renombrar las piezas, conservando la estructura, no mueve nada
   * ---------------------------------------------------------------------- */
  test('F-02 f: renombrar las piezas no cambia los componentes de varianza', function () {
    var base = MSANested.compute(build(localNames), {});
    [globalNames, otherLocalNames].forEach(function (nameOf, i) {
      var res = MSANested.compute(build(nameOf), {});
      sameComponents(comps(base), comps(res), 'convencion de nombres ' + i);
      assert(res.ndc === base.ndc, 'mismo NDC con la convencion ' + i);
      assert(res.design.partsPerOperator === base.design.partsPerOperator, 'mismas piezas por operador');
    });
  });

  test('F-02 f: renombrar solo cambia lo que se muestra, no lo que se calcula', function () {
    var res = MSANested.compute(build(otherLocalNames), {});
    assert(res.design.parts[0] === 'Probeta-A', 'se muestra el nombre capturado: ' + res.design.parts[0]);
    assert(res.design.partIds[0] === 'Ana|Probeta-A',
      'la identidad interna lleva el operador: ' + res.design.partIds[0]);
    assert(res.charts.labels[0] === 'Ana - Probeta-A',
      'las graficas rotulan con el nombre capturado: ' + res.charts.labels[0]);
    assert(res.design.repeatedPartLabels.length === PER_OP,
      'y se registra que los nombres se repiten entre operadores');
  });

  /* ---------------------------------------------------------------------- *
   * Lo que NO cambio: un nombre repetido DENTRO de un operador sigue siendo
   * la misma celda, y las identidades no se pueden fundir por casualidad.
   * ---------------------------------------------------------------------- */
  test('F-02: repetir un nombre dentro del mismo operador sigue siendo la misma pieza', function () {
    var v = MSADesign.observe([['1', '1', '2'], ['1', '2']]);
    assert(v.partsByOperator[0].length === 3, 'observe no deduplica, solo describe');
    assert(v.repeatedLabels.sort().join(',') === '1,2', 'los dos nombres se repiten entre operadores');

    /* En el motor si se funden: son replicas de la misma celda. */
    var rows = [];
    ['Ana', 'Beto'].forEach(function (op) {
      ['1', '2'].forEach(function (pt) {
        for (var k = 0; k < 4; k++) rows.push({ operator: op, part: pt, value: k * 0.1 + pt * 1 });
      });
    });
    var val = MSANested.validate(rows);
    assert(val.ok, 'estudio 2x2x4 valido: ' + val.errors.join(' | '));
    assert(val.meta.replicates === 4, '4 replicas por celda, se obtuvo ' + val.meta.replicates);
    assert(val.meta.partIds.join(',') === 'Ana|1,Ana|2,Beto|1,Beto|2',
      'cuatro identidades: ' + val.meta.partIds.join(','));
  });

  test('F-02: la clave interna de celda no colisiona con el separador visible', function () {
    /* "Ana" + "1|2" y "Ana|1" + "2" dan la misma identidad LEGIBLE, y por eso
       la clave interna usa un separador que no puede aparecer en un nombre. */
    assert(MSADesign.partIdOf('Ana', '1|2') === MSADesign.partIdOf('Ana|1', '2'),
      'la identidad legible si puede coincidir, y se acepta: es solo para leer');
    assert(MSADesign.cellKey('Ana', '1|2') !== MSADesign.cellKey('Ana|1', '2'),
      'la clave interna NO puede coincidir, o dos celdas se fundirian en una');

    var rows = [];
    [['Ana', '1|2'], ['Ana|1', '2']].forEach(function (pair) {
      for (var p = 0; p < 2; p++) {
        for (var k = 0; k < 3; k++) {
          rows.push({ operator: pair[0], part: pair[1] + '-' + p, value: p + k * 0.1 });
        }
      }
    });
    var val = MSANested.validate(rows);
    assert(val.ok, 'dos operadores con nombres tramposos: ' + val.errors.join(' | '));
    assert(val.meta.operators.length === 2, 'siguen siendo dos operadores');
    assert(val.meta.partsPerOperator === 2, 'dos piezas cada uno');
  });

})(typeof window !== 'undefined' ? window : globalThis);
