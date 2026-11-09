/* ============================================================================
 * tests-paste.js - Pegar desde una hoja de calculo (assets/js/paste.js).
 *
 * QUE SE ESTA PROBANDO Y POR QUE
 *
 * Las casillas de nombres de operadores y piezas no aceptaban una columna
 * pegada desde Excel: los nombres caian todos en la primera casilla. Y en la
 * tabla de captura, pegar el bloque con sus columnas de operador y pieza
 * metia el texto de los nombres en las celdas de medicion.
 *
 * El texto de prueba esta escrito como lo deja Excel en el portapapeles:
 * tabulador entre columnas, salto de linea entre renglones (a veces \r\n) y
 * un salto al final. Las mediciones del bloque largo son las del ejemplo de
 * clase de 2 operadores x 14 piezas x 2 replicas que destapo el problema.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var T = global.MSATestKit;
  var test = T.test, assert = T.assert;
  var P = global.MSAPaste;

  function same(a, b, msg) {
    assert(JSON.stringify(a) === JSON.stringify(b),
      (msg || 'distintos') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
  }
  function tsv(rows, eol) { return rows.map(function (r) { return r.join('\t'); }).join(eol || '\n') + (eol || '\n'); }

  var R1 = [746.43, 746.41, 746.49, 746.03, 746.16, 746.06, 746.17, 746.08, 746.29, 746.36, 746.5, 745.61, 746.35, 746.28];
  var R2 = [746.31, 745.71, 745.98, 745.8, 745.64, 746.16, 745.83, 746.05, 746.42, 746.05, 746.03, 745.55, 745.88, 746.35];

  /** El bloque ancho, como la tabla de captura: Operador | Pieza | R1 | R2. */
  function wide(opts) {
    opts = opts || {};
    var rows = opts.header ? [['Operador', 'Pieza', 'Replica 1', 'Replica 2']] : [];
    ['Operador 1', 'Operador 2'].forEach(function (op) {
      for (var p = 0; p < 14; p++) {
        var name = opts.merged && p > 0 ? '' : op;   // celda combinada: vacia abajo
        var part = opts.numericParts ? String(p + 1) : 'Pieza ' + (p + 1);
        var a = String(R1[p]), b = String(R2[p]);
        if (opts.comma) { a = a.replace('.', ','); b = b.replace('.', ','); }
        rows.push([name, part, a, b].concat(opts.extraCol ? [''] : []));
      }
    });
    return tsv(rows, opts.eol);
  }

  /* ---------------------------------------------------------------------- *
   * Listas de nombres
   * ---------------------------------------------------------------------- */
  test('pegar: una columna de nombres se reparte en orden, sin el salto final', function () {
    var r = P.names('Ana\nBeto\nCruz\n');
    same(r.names, ['Ana', 'Beto', 'Cruz']);
    assert(r.header === null && r.repeated === 0);
  });

  test('pegar: saltos \\r\\n de Windows y celdas vacias no crean nombres vacios', function () {
    same(P.names('Ana\r\n\r\nBeto\r\n  Cruz  \r\n').names, ['Ana', 'Beto', 'Cruz']);
  });

  test('pegar: una FILA copiada (tabuladores) tambien se reparte', function () {
    same(P.names('Pieza A\tPieza B\tPieza C').names, ['Pieza A', 'Pieza B', 'Pieza C']);
  });

  test('pegar: el encabezado de la columna se descarta, un nombre numerado no', function () {
    var r = P.names('Operador\nOperador 1\nOperador 2\n');
    same(r.names, ['Operador 1', 'Operador 2']);
    assert(r.header === 'Operador', 'se informa cual se descarto');
    same(P.names('Pieza 1\nPieza 2\n').names, ['Pieza 1', 'Pieza 2'], 'sin encabezado no se toca');
    same(P.names('Piezas').names, ['Piezas'], 'una sola celda no es encabezado de nada');
  });

  test('pegar: la columna de una tabla larga se toma una vez por nombre (unique)', function () {
    var col = [];
    for (var i = 0; i < 14; i++) col.push('Operador 1');
    for (i = 0; i < 14; i++) col.push('Operador 2');
    var r = P.names(col.join('\n') + '\n', { unique: true });
    same(r.names, ['Operador 1', 'Operador 2']);
    assert(r.repeated === 26, 'repetidos: ' + r.repeated);
  });

  test('pegar: sin unique (piezas del anidado) los repetidos se conservan', function () {
    same(P.names('1\n2\n1\n2\n').names, ['1', '2', '1', '2']);
  });

  /* ---------------------------------------------------------------------- *
   * Bloques con nombres en la tabla de captura
   * ---------------------------------------------------------------------- */
  test('pegar: bloque ancho con nombres y encabezado arma el estudio completo', function () {
    var t = P.table(wide({ header: true }));
    assert(t, 'se reconoce');
    assert(t.layout === 'ancho' && t.operators === 2 && t.parts === 14 && t.replicates === 2,
      JSON.stringify([t.layout, t.operators, t.parts, t.replicates]));
    assert(t.rows.length === 56, 'filas: ' + t.rows.length);
    same(t.rows[0], { operator: 'Operador 1', part: 'Pieza 1', replicate: 1, value: '746.43' });
    same(t.rows[3], { operator: 'Operador 1', part: 'Pieza 2', replicate: 2, value: '745.71' });
    same(t.rows[55], { operator: 'Operador 2', part: 'Pieza 14', replicate: 2, value: '746.35' });
  });

  test('pegar: sin encabezado, con \\r\\n y con coma decimal da lo mismo', function () {
    var a = P.table(wide({ header: true }));
    var b = P.table(wide({ eol: '\r\n' }));
    same(a.rows, b.rows, 'sin encabezado y con CRLF');
    var c = P.table(wide({ comma: true }));
    assert(c && c.rows[0].value === '746,43', 'la coma se conserva: la captura ya la acepta');
  });

  test('pegar: celdas de operador combinadas (vacias abajo) heredan el de arriba', function () {
    same(P.table(wide({ merged: true })).rows, P.table(wide({})).rows);
  });

  test('pegar: una columna vacia de mas a la derecha no crea una replica', function () {
    var t = P.table(wide({ extraCol: true }));
    assert(t.replicates === 2 && t.rows.length === 56, 'replicas: ' + t.replicates);
  });

  test('pegar: piezas numeradas 1..n (numeros enteros) son nombres validos', function () {
    var t = P.table(wide({ numericParts: true }));
    assert(t && t.parts === 14 && t.rows[2].part === '2', JSON.stringify(t && t.rows[2]));
  });

  test('pegar: formato largo con encabezado (el CSV que exporta la pagina)', function () {
    var rows = [['operador', 'pieza', 'replica', 'medicion']];
    ['Ana', 'Beto'].forEach(function (op) {
      for (var p = 1; p <= 3; p++) for (var k = 1; k <= 2; k++) rows.push([op, 'P' + p, k, 10 + p + k / 10]);
    });
    var t = P.table(tsv(rows));
    assert(t && t.layout === 'largo' && t.operators === 2 && t.parts === 3 && t.replicates === 2);
    same(t.rows[1], { operator: 'Ana', part: 'P1', replicate: 2, value: '11.2' });
  });

  test('pegar: formato largo con columnas en otro orden se lee por encabezado', function () {
    var t = P.table(tsv([['Pieza', 'Medicion', 'Operador'],
      ['P1', '1.1', 'Ana'], ['P1', '1.2', 'Ana'], ['P2', '2.1', 'Ana'], ['P2', '2.2', 'Ana'],
      ['P1', '1.3', 'Beto'], ['P1', '1.4', 'Beto'], ['P2', '2.3', 'Beto'], ['P2', '2.4', 'Beto']]));
    assert(t && t.replicates === 2, 'la replica sale del orden');
    same(t.rows[4], { operator: 'Beto', part: 'P1', replicate: 1, value: '1.3' });
  });

  test('pegar: formato largo SIN encabezado se distingue del ancho porque repite pares', function () {
    var withRep = P.table(tsv([['Ana', 'P1', 1, 5.1], ['Ana', 'P1', 2, 5.2], ['Ana', 'P2', 1, 6.1],
      ['Ana', 'P2', 2, 6.2], ['Beto', 'P1', 1, 5.3], ['Beto', 'P1', 2, 5.4], ['Beto', 'P2', 1, 6.3],
      ['Beto', 'P2', 2, 6.4]]));
    assert(withRep && withRep.layout === 'largo' && withRep.replicates === 2);
    same(withRep.rows[1], { operator: 'Ana', part: 'P1', replicate: 2, value: '5.2' },
      'la columna de enteros es la replica, no una medicion');
    var noRep = P.table(tsv([['Ana', 'P1', 5.1], ['Ana', 'P1', 5.2], ['Ana', 'P2', 6.1],
      ['Ana', 'P2', 6.2], ['Beto', 'P1', 5.3], ['Beto', 'P1', 5.4], ['Beto', 'P2', 6.3],
      ['Beto', 'P2', 6.4]]));
    assert(noRep && noRep.replicates === 2 && noRep.rows[1].replicate === 2);
  });

  test('pegar: lo que NO es un estudio completo con nombres no rehace la tabla', function () {
    // Solo los numeros: se pega por posicion, como siempre.
    assert(P.table('746.43\t746.31\n746.41\t745.71\n') === null, 'solo numeros');
    // Las piezas de un solo operador: un pedazo de la tabla.
    var oneOp = tsv([['Operador 1', 'Pieza 1', 1.1, 1.2], ['Operador 1', 'Pieza 2', 2.1, 2.2]]);
    assert(P.table(oneOp) === null, 'un operador');
    // Una sola columna de nombres: la segunda columna es una medicion, no una pieza.
    assert(P.table(tsv([['Pieza 1', 746.43, 746.31], ['Pieza 2', 746.41, 745.71]])) === null,
      'una columna de nombres');
    // Texto en una celda de medicion (en un renglon de datos, no en el primero,
    // que se tomaria por encabezado).
    assert(P.table(tsv([['A', 'P1', 1, 1], ['A', 'P2', 1, 1], ['B', 'P1', 'x', 1], ['B', 'P2', 1, 1]])) === null,
      'texto en la medicion');
    // Una sola replica no es un Gage R&R.
    assert(P.table(tsv([['A', 'P1', 1], ['A', 'P2', 2], ['B', 'P1', 1], ['B', 'P2', 2]])) === null,
      'una replica');
  });

  /* ---------------------------------------------------------------------- *
   * Respaldo: pegar por posicion sin las columnas de nombres
   * ---------------------------------------------------------------------- */
  test('pegar: por posicion se quitan las columnas de operador y pieza, y el encabezado', function () {
    var v = P.values(tsv([['Operador', 'Pieza', 'R1', 'R2'],
      ['Operador 1', 'Pieza 1', '1.1', '1.2'], ['', 'Pieza 2', '2.1', '2.2']]));
    assert(v.labels === 2, 'columnas quitadas: ' + v.labels);
    same(v.cells, [['1.1', '1.2'], ['2.1', '2.2']]);
  });

  test('pegar: por posicion con una sola columna de nombres', function () {
    var v = P.values(tsv([['Pieza 1', '1.1', '1.2'], ['Pieza 2', '2.1', '2.2']]));
    assert(v.labels === 1);
    same(v.cells, [['1.1', '1.2'], ['2.1', '2.2']]);
  });

  test('pegar: un bloque de solo numeros (con huecos) sale igual que entro', function () {
    var text = '1.1\t1.2\n\t2.2\n';
    var v = P.values(text);
    assert(v.labels === 0);
    same(v.cells, P.grid(text), 'los huecos se respetan');
  });

  test('pegar: una celda copiada de Excel (con su salto final) es un solo valor', function () {
    assert(P.isBlock('746.43\r\n'), 'Excel deja el salto: se trata como bloque');
    same(P.values('746.43\r\n').cells, [['746.43']]);
    assert(!P.isBlock('746.43'), 'escrito a mano no es bloque');
  });

})(typeof window !== 'undefined' ? window : globalThis);
