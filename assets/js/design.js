/* ============================================================================
 * design.js - Que diseno traen unos datos, y a que metodo pertenecen.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 *
 * F-02 de la auditoria. La convencion mas natural para etiquetar una prueba
 * destructiva es numerar las piezas de CADA operador 1..n: Ana rompe sus
 * piezas 1 a 5, Beto rompe las suyas 1 a 5. Son diez objetos fisicos
 * distintos que comparten cinco nombres.
 *
 * La aplicacion leia esos nombres como identidades globales, y de ahi salian
 * tres fallos encadenados:
 *
 *   1. `detectDesign` veia "todos los operadores traen 1..5" y concluia
 *      CRUZADO, asi que la app se cambiaba sola de metodo y afirmaba "todos
 *      los operadores midieron las mismas piezas", que es falso.
 *   2. El validador del anidado rechazaba la captura con un mensaje que
 *      empujaba al metodo equivocado ("usa el metodo Cruzado").
 *   3. El motor cruzado aceptaba la matriz -esta balanceada- y publicaba un
 *      ANOVA con un termino operador x pieza que no existe fisicamente: la
 *      pieza 1 de Ana y la pieza 1 de Beto nunca fueron la misma pieza.
 *
 * LA REGLA
 *
 * En el anidado la identidad estadistica de una pieza es el PAR
 * (operador, pieza), no el nombre suelto: la pieza "1" de "Ana" es "Ana|1".
 * El nombre local se conserva intacto para tablas, graficas, importacion y
 * reportes -- es el que el operador escribio en la etiqueta -- y solo la
 * identidad interna se califica.
 *
 * Y LA REGLA DE ENRUTADO
 *
 * Un nombre repetido es evidencia de nada. Que dos operadores usen "1" no
 * demuestra que midieran la misma pieza, igual que dos piezas llamadas
 * distinto no demuestran ser distintas. Asi que:
 *
 *   - Estando en anidado, NINGUNA coincidencia de nombres saca del anidado.
 *   - Un cambio de metodo solo ocurre si el archivo lo pide EXPLICITAMENTE
 *     (campo `method`, o el `format` del propio archivo), o si quien importa
 *     lo confirma. Lo demas se pregunta, no se afirma.
 *
 * Vive fuera de app.js por la misma razon que report.js (F-03): mientras la
 * decision estuvo pegada al DOM, la unica manera de descubrir que estaba mal
 * era abrir el navegador e importar un archivo.
 *
 * Sin dependencias. Sin DOM. Determinista. Reutilizable desde los tests.
 * ==========================================================================*/
(function (global) {
  'use strict';

  /* Dos separadores a proposito, y no es duplicacion:
     ID_SEP  arma la identidad LEGIBLE que se muestra y se documenta ("Ana|1").
     KEY_SEP arma la clave interna de celda. Es NUL porque no puede
             colisionar: un operador "Ana" con la pieza "1|2" y otro "Ana|1"
             con la pieza "2" darian la misma cadena si la clave usara "|", y
             serian dos celdas distintas fundidas en una. */
  var ID_SEP = '|';
  var KEY_SEP = '\u0000';

  function trim(v) { return (v === undefined || v === null) ? '' : String(v).trim(); }

  /** Identidad estadistica de una pieza dentro del anidado: "Ana|1". */
  function partIdOf(operator, part) { return trim(operator) + ID_SEP + trim(part); }

  /** Clave interna de celda, a prueba de colisiones. No se muestra nunca. */
  function cellKey(operator, part) { return trim(operator) + KEY_SEP + trim(part); }

  /* Los dos textos que la auditoria pide literalmente. Viven aqui, en un solo
     sitio, para que la pantalla y el motor digan lo mismo palabra por palabra. */
  var REPEATED_LABEL_NOTICE =
    'En el metodo anidado, las piezas con el mismo identificador bajo operadores ' +
    'diferentes se consideran objetos fisicos distintos.';
  var CROSSED_HINT =
    'Si los operadores midieron realmente las mismas piezas fisicas, utiliza el metodo cruzado.';

  /* ------------------------------------------------------------------------
   * observe(partsByOperator) -> como se reparten los NOMBRES, y nada mas.
   *
   * Devuelve una observacion, no un veredicto. Deliberadamente no se llama
   * `detectDesign`: los nombres no determinan el diseno, y ponerle ese nombre
   * a esta funcion fue justamente lo que llevo a creer que si.
   *
   *   repeatedLabels  nombres que aparecen bajo mas de un operador
   *   allDistinct     ningun nombre se repite entre operadores
   *   allShared       todos los operadores traen exactamente la misma lista
   * ----------------------------------------------------------------------*/
  function observe(partsByOperator) {
    var groups = (partsByOperator || []).map(function (g) { return (g || []).map(trim); });
    var owner = Object.create(null), repeated = [];
    groups.forEach(function (g, oi) {
      var seen = Object.create(null);
      g.forEach(function (pt) {
        if (seen[pt]) return;              // repetido dentro del operador: es la misma celda
        seen[pt] = true;
        if (owner[pt] === undefined) owner[pt] = oi;
        else if (owner[pt] !== oi && repeated.indexOf(pt) < 0) repeated.push(pt);
      });
    });
    var first = groups[0] || [];
    var allShared = groups.length > 1 && groups.every(function (g) {
      return g.length === first.length && g.every(function (pt) { return first.indexOf(pt) >= 0; });
    });
    return {
      operatorCount: groups.length,
      partsByOperator: groups,
      repeatedLabels: repeated,
      allDistinct: repeated.length === 0,
      allShared: allShared
    };
  }

  /** Los mismos datos, pero leidos de filas sueltas (un archivo importado). */
  function observeRows(rows) {
    var ops = [], groups = [], seen = [];
    (rows || []).forEach(function (r) {
      var o = trim(r.operator), pt = trim(r.part);
      var oi = ops.indexOf(o);
      if (oi < 0) { oi = ops.length; ops.push(o); groups.push([]); seen.push(Object.create(null)); }
      if (!seen[oi][pt]) { seen[oi][pt] = true; groups[oi].push(pt); }
    });
    var out = observe(groups);
    out.operators = ops;
    return out;
  }

  /* Los avisos del punto 4 y 5 de la auditoria: se emiten cuando hay nombres
     repetidos entre operadores y el metodo activo es el anidado. No afirman
     que las piezas sean las mismas ni que sean distintas: dicen como las va a
     tratar el modelo, y cual es el metodo si la realidad fue la otra. */
  function repeatedLabelNotes(observed) {
    if (!observed || observed.allDistinct) return [];
    return [REPEATED_LABEL_NOTICE, CROSSED_HINT];
  }

  /* ------------------------------------------------------------------------
   * methodOfPayload(payload) - el metodo que el ARCHIVO declara, o null.
   *
   * Un archivo exportado por esta pagina declara su metodo dos veces: en
   * `method` y en el `format`. Se lee para que reimportar un estudio anidado
   * lo devuelva anidado, sin depender de como se repartan los nombres de las
   * piezas. Es la unica via por la que un archivo puede cambiar el metodo
   * activo sin preguntar: lo esta diciendo, no se esta adivinando.
   * ----------------------------------------------------------------------*/
  var FORMAT_METHOD = [
    { re: /nested|anidad/i,     method: 'anidado' },
    { re: /attribute|atribut/i, method: 'atributos' },
    { re: /crossed|cruzad/i,    method: 'cruzado' }
  ];
  var METHODS = ['cruzado', 'anidado', 'atributos'];

  function methodOfPayload(payload) {
    if (!payload) return null;
    var declared = trim(payload.method) || (payload.config ? trim(payload.config.method) : '');
    if (METHODS.indexOf(declared) >= 0) return declared;
    var fmt = trim(payload.format);
    for (var i = 0; i < FORMAT_METHOD.length; i++) {
      if (FORMAT_METHOD[i].re.test(fmt)) return FORMAT_METHOD[i].method;
    }
    return null;
  }

  /* ------------------------------------------------------------------------
   * route(ctx) - a que metodo va este archivo.
   *
   * ctx: { activeMethod, explicitMethod, observed, categorical, isAvailable }
   * -> { method, changed, explicit, notes[], question|null, proposal|null }
   *
   *   method    el metodo con el que hay que cargar YA (sin preguntar)
   *   proposal  un metodo distinto que los datos sugieren y que NO se aplica
   *             solo: `question` es lo que hay que preguntarle a la persona,
   *             y si dice que si, quien llama aplica `proposal`.
   *
   * El tipo de dato (numeros contra categorias) sigue mandando sin preguntar:
   * ahi no hay ambiguedad que consultar, un archivo de categorias no se puede
   * analizar con un ANOVA de variables de ninguna manera.
   * ----------------------------------------------------------------------*/
  function route(ctx) {
    ctx = ctx || {};
    var active = ctx.activeMethod, observed = ctx.observed || observe([]);
    var available = ctx.isAvailable || function () { return true; };
    var notes = [], out = { method: active, changed: false, explicit: false,
                            notes: notes, question: null, proposal: null };

    function go(m, why) {
      if (m !== active && available(m)) { out.method = m; out.changed = true; if (why) notes.push(why); }
    }

    // 1. El tipo de dato manda, como antes: no es una ambiguedad de diseno.
    if (ctx.categorical && active !== 'atributos') {
      go('atributos', 'El archivo trae clasificaciones y no mediciones numericas, asi que se cambio ' +
                      'al metodo de atributos.');
      return out;
    }
    if (!ctx.categorical && active === 'atributos' && !ctx.explicitMethod) {
      go('cruzado', 'El archivo trae mediciones numericas, asi que se salio del metodo de atributos.');
      active = out.method;
    }

    // 2. Lo que el archivo DECLARA. Un cambio pedido por el archivo no es
    //    silencioso: se aplica y se dice de donde salio.
    var declared = ctx.explicitMethod;
    if (declared && available(declared)) {
      out.explicit = true;
      go(declared, 'El archivo declara el metodo ' + declared + ', asi que se cambio a ese metodo. ' +
                   'El diseno no se dedujo de los nombres de las piezas.');
      if (declared === 'anidado') repeatedLabelNotes(observed).forEach(function (n) { notes.push(n); });
      return out;
    }

    // 3. Sin declaracion. Aqui es donde el codigo viejo adivinaba.
    if (active === 'anidado') {
      /* REGLA F-02: estando en anidado, ninguna coincidencia de nombres saca
         del anidado. Que Ana y Beto usen "1" no demuestra que rompieran la
         misma pieza; demostrarlo es imposible desde los datos. */
      repeatedLabelNotes(observed).forEach(function (n) { notes.push(n); });
      return out;
    }

    if (active === 'cruzado' && observed.operatorCount > 1 && observed.allDistinct &&
        available('anidado')) {
      /* Ninguna pieza aparece bajo dos operadores. Puede ser un anidado, o un
         cruzado al que le faltan filas, y los datos no distinguen los dos
         casos. Antes se cambiaba solo; ahora se pregunta. */
      out.proposal = 'anidado';
      out.question = 'El archivo trae ' + observed.operatorCount + ' operadores y ninguna pieza ' +
        'aparece bajo mas de uno.\n\n' +
        'Eso es lo que se espera de un estudio ANIDADO (destructivo: cada operador mide SUS ' +
        'propias piezas). Pero tambien puede ser un estudio cruzado al que le faltan filas, y ' +
        'los datos no distinguen los dos casos.\n\n' +
        'Cambiar al metodo anidado?';
    }
    return out;
  }

  global.MSADesign = {
    ID_SEP: ID_SEP, KEY_SEP: KEY_SEP,
    partIdOf: partIdOf, cellKey: cellKey,
    observe: observe, observeRows: observeRows,
    repeatedLabelNotes: repeatedLabelNotes,
    methodOfPayload: methodOfPayload,
    route: route,
    REPEATED_LABEL_NOTICE: REPEATED_LABEL_NOTICE,
    CROSSED_HINT: CROSSED_HINT
  };
})(typeof window !== 'undefined' ? window : globalThis);
