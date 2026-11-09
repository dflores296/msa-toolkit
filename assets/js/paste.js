/* ============================================================================
 * paste.js - Leer lo que se pega desde una hoja de calculo. Sin DOM.
 *
 * POR QUE EXISTE
 *
 * Las mediciones se podian pegar desde Excel directamente en la tabla de
 * captura, pero los nombres no: las casillas de operadores y de piezas eran
 * cajas de texto sueltas, y pegar una columna de 14 nombres dejaba los 14
 * dentro de la primera caja, pegados en una sola linea. Habia que escribirlos
 * uno por uno.
 *
 * Y en la tabla de captura, copiar el bloque completo de la hoja -con las
 * columnas de operador y pieza a la izquierda, que es como casi todo el mundo
 * lo tiene- metia "Operador 1" y "Pieza 1" en las celdas de medicion.
 *
 * Aqui vive solo la LECTURA del texto pegado: que celdas trae, si la primera
 * fila es un encabezado, si las primeras columnas son nombres. Lo que se hace
 * con eso (llenar casillas, armar la tabla) es de app.js. Separado asi se
 * prueba en Node, sin navegador, como el resto de los motores.
 *
 * EL FORMATO DE EXCEL
 *
 * Al copiar un rango, Excel (y Google Sheets, y LibreOffice) deja las columnas
 * separadas por tabulador y los renglones por salto de linea, normalmente con
 * un salto al final. Una celda combinada se copia con su valor en el primer
 * renglon y vacia en los demas: por eso un operador vacio hereda el de arriba.
 * ==========================================================================*/
(function (global) {
  'use strict';

  function trim(s) { return String(s === undefined || s === null ? '' : s).trim(); }

  /** Una medicion: numero con punto o coma decimal. La celda vacia no lo es. */
  function isNumeric(s) {
    var t = trim(s);
    return t !== '' && isFinite(Number(t.replace(',', '.')));
  }

  /** true si el texto trae mas de una celda y por tanto hay que repartirlo. */
  function isBlock(text) { return /[\t\n\r]/.test(String(text || '')); }

  /** Texto del portapapeles -> renglones de celdas, ya recortadas. */
  function grid(text) {
    var t = String(text || '').replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    if (!t) return [];
    return t.split('\n').map(function (line) { return line.split('\t').map(trim); });
  }

  /* ---------------------------------------------------------------------- *
   * Listas de nombres (paso 1)
   * ---------------------------------------------------------------------- */

  /* Un encabezado de columna, no un nombre. Solo la palabra sola: "Pieza 3"
     es un nombre, "Pieza" es el titulo de la columna que se copio con ella. */
  var HEADER_WORD = /^(operador(es)?|operario(s)?|evaluador(es)?|inspector(es)?|tecnico(s)?|técnico(s)?|pieza(s)?|parte(s)?|muestra(s)?|nombre(s)?|operators?|appraisers?|parts?|names?)$/i;

  /**
   * names(text, { unique }) - una columna (o fila) de nombres copiada.
   * Devuelve { names, header, repeated }:
   *   names    los nombres, en orden, sin celdas vacias.
   *   header   el encabezado que se descarto, o null.
   *   repeated cuantos se quitaron por repetidos (solo con unique).
   *
   * `unique` es para listas que no admiten repetidos (operadores; piezas del
   * cruzado). Sirve sobre todo al copiar una columna de una tabla larga, donde
   * "Operador 1" aparece una vez por renglon: se toma una vez, en el orden en
   * que aparece. En el anidado las piezas NO se depuran: "1" bajo Ana y "1"
   * bajo Beto son dos piezas distintas (ver design.js).
   */
  function names(text, opts) {
    opts = opts || {};
    var cells = [];
    grid(text).forEach(function (row) {
      row.forEach(function (c) { if (c) cells.push(c); });
    });
    var header = null;
    if (cells.length > 1 && HEADER_WORD.test(cells[0])) header = cells.shift();
    var out = [], repeated = 0;
    if (opts.unique) {
      cells.forEach(function (c) {
        if (out.indexOf(c) < 0) out.push(c); else repeated++;
      });
    } else {
      out = cells;
    }
    return { names: out, header: header, repeated: repeated };
  }

  /* ---------------------------------------------------------------------- *
   * Bloques de la tabla de captura (paso 2)
   * ---------------------------------------------------------------------- */

  /* Los mismos nombres de columna que acepta la importacion de CSV. */
  var COLS = {
    operator: ['operador', 'operator', 'operario', 'evaluador', 'appraiser'],
    part: ['pieza', 'parte', 'part', 'muestra'],
    replicate: ['replica', 'réplica', 'replicate', 'repeticion', 'repetición', 'trial'],
    value: ['medicion', 'medición', 'valor', 'value', 'measurement', 'lectura']
  };
  function colIndex(head, key) {
    var low = head.map(function (h) { return h.toLowerCase(); });
    for (var i = 0; i < COLS[key].length; i++) {
      var k = low.indexOf(COLS[key][i]);
      if (k >= 0) return k;
    }
    return -1;
  }

  function nonEmptyRows(g) {
    return g.filter(function (r) { return r.some(function (c) { return c !== ''; }); });
  }

  /* Un renglon de encabezado: despues de las dos primeras columnas trae texto
     que no es numero ("Replica 1", "Medicion"). Un renglon de datos ahi solo
     tiene numeros o celdas vacias. */
  function looksHeader(row) {
    return row.length >= 3 && row.slice(2).some(function (c) { return c !== '' && !isNumeric(c); });
  }

  /* Nombre de pieza valido en un bloque con nombres. Puede ser un numero
     entero ("1", "12"), que es como muchos numeran sus piezas; un numero con
     decimales no, porque eso es una medicion y querria decir que el bloque
     solo trae UNA columna de nombres. */
  function partOk(s) {
    return s !== '' && (!isNumeric(s) || /^\d+$/.test(s));
  }

  /**
   * table(text) - un bloque que trae a la izquierda los nombres de operador y
   * de pieza, en cualquiera de las formas en que se suele tener en la hoja:
   *
   *   ancho:  Operador | Pieza | Replica 1 | ... | Replica r   (como esta tabla)
   *   largo:  Operador | Pieza | Replica | Medicion            (como el CSV que exporta)
   *   largo:  Operador | Pieza | Medicion                      (la replica sale del orden)
   *
   * El encabezado es opcional. Sin el, la forma se distingue sin adivinar: en
   * el ancho cada par operador-pieza sale UNA vez; en el largo, una vez por
   * replica.
   *
   * Devuelve { rows, layout, operators, parts, replicates } con rows en el
   * formato de la importacion ({ operator, part, replicate, value }), o null si
   * el bloque no es un estudio completo con nombres. Completo quiere decir al
   * menos dos operadores con al menos dos piezas cada uno, que es lo minimo
   * que acepta la configuracion: un pedazo de la tabla (las piezas de un solo
   * operador, digamos) no puede rehacer el estudio, y se pega por posicion.
   */
  function table(text) {
    var g = nonEmptyRows(grid(text));
    if (g.length < 2) return null;
    var head = looksHeader(g[0]) ? g.shift() : null;
    if (!g.length) return null;

    var iOp = 0, iPt = 1, iRep = -1, iVal = -1;
    if (head) {
      var ho = colIndex(head, 'operator'), hp = colIndex(head, 'part');
      var hv = colIndex(head, 'value'), hr = colIndex(head, 'replicate');
      if (hv >= 0) {
        if (ho < 0 || hp < 0) return null;
        iOp = ho; iPt = hp; iVal = hv; iRep = hr;
      }
    }

    // Renglones validos: operador de texto (vacio = el de arriba), pieza, y
    // el resto numeros o vacios.
    var parsed = [], lastOp = '';
    for (var r = 0; r < g.length; r++) {
      var row = g[r];
      var op = row[iOp] || '';
      if (op === '') op = lastOp;
      if (op === '' || isNumeric(op)) return null;
      lastOp = op;
      var pt = row[iPt] || '';
      if (!partOk(pt)) return null;
      var vals;
      if (iVal >= 0) {
        vals = [row[iVal] || ''];
        if (iRep >= 0 && !/^\d+$/.test(row[iRep] || '')) return null;
      } else {
        vals = row.slice(2);
      }
      if (!vals.length) return null;
      for (var k = 0; k < vals.length; k++) {
        if (vals[k] !== '' && !isNumeric(vals[k])) return null;
      }
      parsed.push({ op: op, part: pt, vals: vals, rep: iRep >= 0 ? parseInt(row[iRep], 10) : 0 });
    }

    // Ancho o largo. Con columna de medicion declarada es largo. Sin
    // encabezado, se mira si los pares se repiten.
    var seen = Object.create(null), repeats = false;
    parsed.forEach(function (p) {
      var key = p.op + '\u0000' + p.part;
      if (seen[key]) repeats = true;
      seen[key] = true;
    });
    var layout = iVal >= 0 || repeats ? 'largo' : 'ancho';
    if (layout === 'largo' && iVal < 0) {
      /* Largo sin encabezado: Operador | Pieza | [Replica |] Medicion. Con
         dos columnas de numeros, la primera es la replica si son enteros
         positivos; con una sola, la replica la da el orden. */
      var width = parsed[0].vals.length;
      if (parsed.some(function (p) { return p.vals.length !== width; })) return null;
      if (width === 2) {
        if (!parsed.every(function (p) { return /^\d+$/.test(p.vals[0]) && +p.vals[0] > 0; })) return null;
        parsed.forEach(function (p) { p.rep = parseInt(p.vals[0], 10); p.vals = [p.vals[1]]; });
      } else if (width !== 1) {
        return null;
      }
    }

    var rows = [];
    if (layout === 'ancho') {
      // Columnas vacias al final (se selecciono de mas en la hoja): fuera.
      var last = -1;
      parsed.forEach(function (p) {
        p.vals.forEach(function (v, k) { if (v !== '' && k > last) last = k; });
      });
      if (last < 0) return null;
      parsed.forEach(function (p) {
        for (var k = 0; k <= last; k++) {
          rows.push({ operator: p.op, part: p.part, replicate: k + 1, value: p.vals[k] || '' });
        }
      });
    } else {
      var count = Object.create(null);
      parsed.forEach(function (p) {
        var key = p.op + '\u0000' + p.part;
        count[key] = (count[key] || 0) + 1;
        rows.push({ operator: p.op, part: p.part, replicate: p.rep > 0 ? p.rep : count[key],
                    value: p.vals[0] });
      });
    }

    // Estudio completo: dos o mas operadores, dos o mas piezas cada uno.
    var ops = [], partsOf = Object.create(null), allParts = [], maxRep = 0;
    rows.forEach(function (x) {
      if (!partsOf[x.operator]) { partsOf[x.operator] = []; ops.push(x.operator); }
      if (partsOf[x.operator].indexOf(x.part) < 0) partsOf[x.operator].push(x.part);
      if (allParts.indexOf(x.part) < 0) allParts.push(x.part);
      if (x.replicate > maxRep) maxRep = x.replicate;
    });
    if (ops.length < 2) return null;
    if (ops.some(function (o) { return partsOf[o].length < 2; })) return null;
    if (maxRep < 2) return null;

    return { rows: rows, layout: layout, operators: ops.length, parts: allParts.length,
             replicates: maxRep };
  }

  /**
   * values(text) - lo que se pega por posicion en la tabla de captura, sin las
   * columnas de nombres que vengan a la izquierda ni el renglon de
   * encabezado. Es el respaldo cuando el bloque no es un estudio completo:
   * pegar las piezas de un operador con su columna "Pieza" ya no mete el
   * texto "Pieza 1" en una celda de medicion.
   *
   * Devuelve { cells, labels } donde labels es cuantas columnas se quitaron.
   * Un bloque sin columnas de nombres sale igual que entro.
   */
  function values(text) {
    var g = grid(text);
    var data = g.filter(function (r) { return r.some(isNumeric); });
    // Columnas de nombres: las que, en TODOS los renglones con numeros, estan
    // antes del primer numero (o vacias). Como mucho dos: operador y pieza.
    var labels = data.length ? 2 : 0;
    data.forEach(function (r) {
      var k = 0;
      while (k < r.length && !isNumeric(r[k]) && k < 2) k++;
      if (k < labels) labels = k;
    });
    // Una columna de nombres de verdad trae texto en algun renglon: dos
    // columnas vacias a la izquierda son huecos de la seleccion y se respetan.
    while (labels > 0 && !data.some(function (r) { return trim(r[labels - 1]) !== ''; })) labels--;
    if (labels === 0) return { cells: g, labels: 0 };
    // El encabezado se va solo si hay nombres; sin ellos, el bloque se pega
    // tal cual, como antes.
    var start = 0;
    while (start < g.length && !g[start].some(isNumeric)) start++;
    return {
      cells: g.slice(start).map(function (r) { return r.slice(labels); }),
      labels: labels
    };
  }

  global.MSAPaste = { isBlock: isBlock, isNumeric: isNumeric, grid: grid, names: names,
                      table: table, values: values };
})(typeof window !== 'undefined' ? window : globalThis);
