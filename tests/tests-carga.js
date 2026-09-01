/* ============================================================================
 * tests-carga.js - El orden de carga de los scripts. Solo Node.
 *
 * POR QUE EXISTE
 *
 * F-27: `anova-nested.js` lee `global.MSADesign.KEY_SEP` al EVALUARSE, no
 * dentro de una funcion. Eso convierte el orden de las etiquetas <script> en
 * index.html en una precondicion del programa: si `design.js` no esta antes,
 * el motor anidado muere al cargar. Y como `loadPayload` tambien usa
 * `MSADesign`, con el modulo ausente se caen ademas el boton de ejemplo y
 * toda importacion, en los TRES metodos.
 *
 * La decision, deliberada, es NO degradar en silencio: un motor anidado que
 * se apana sin su dependencia calcularia con una clave de celda distinta de
 * la que usa la pantalla, y eso es peor que no arrancar. Si la precondicion
 * es real, se prueba; no se disimula.
 *
 * Esta suite comprueba dos cosas distintas:
 *
 *   1. ESTATICO - que los tres cargadores (index.html, tests/index.html y
 *      run-node.js) listen cada modulo despues de sus dependencias.
 *   2. DINAMICO - que cargar en ese orden funcione de verdad, y que cargar en
 *      el orden equivocado falle. Lo segundo es lo que le da dientes a lo
 *      primero: una prueba de orden que pasara con cualquier orden no probaria
 *      nada.
 *
 * Vive fuera de tests/index.html porque lee archivos del disco: en el
 * navegador no hay `fs`. CI corre run-node.js, que si la incluye.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var T = global.MSATestKit;
  var test = T.test, assert = T.assert;

  /* En el navegador este archivo no se carga (tests/index.html no lo lista).
     La guarda esta por si alguien lo agrega por error: mejor una prueba que
     se declara inaplicable que una que revienta la pagina de pruebas. */
  if (typeof require === 'undefined' || typeof process === 'undefined') {
    test('carga: esta suite solo corre en Node (lee archivos del disco)', function () {
      assert(true);
    });
    return;
  }

  var fs = require('fs'), path = require('path'), vm = require('vm');
  var REPO = path.resolve(__dirname, '..');

  /* --- El contrato de dependencias, escrito a mano y a proposito ----------
   * `needs` son los globales que el modulo necesita. `atLoad` es el subconjunto
   * que dereferencia al EVALUARSE, no dentro de una funcion: esos no admiten
   * ningun orden salvo el correcto, mientras que los de runtime solo fallarian
   * al usarse. La distincion importa porque son dos modos de fallo distintos y
   * se diagnostican distinto.
   * -------------------------------------------------------------------- */
  var MODULES = [
    { file: 'design.js',      provides: 'MSADesign',    needs: [],                          atLoad: [] },
    { file: 'stats.js',       provides: 'MSAStats',     needs: [],                          atLoad: [] },
    { file: 'anova.js',       provides: 'MSAAnova',     needs: ['MSAStats'],                atLoad: [] },
    { file: 'anova-nested.js', provides: 'MSANested',   needs: ['MSAStats', 'MSAAnova', 'MSADesign'],
      atLoad: ['MSADesign'] },
    { file: 'attribute.js',   provides: 'MSAAttribute', needs: ['MSAStats'],                atLoad: [] },
    { file: 'report.js',      provides: 'MSAReport',    needs: [],                          atLoad: [] },
    { file: 'mls.js',         provides: 'MSAMls',       needs: ['MSAStats'],                atLoad: [] },
    /* interval.js nombra MSAMls, pero solo dentro de una funcion y sabiendo
       apanarselas sin el: sin mls.js cargado, el cruzado cae al GPQ en vez de
       reventar. Va en `needs` -y por tanto obliga a que mls.js se pida antes-
       pero no en `atLoad`, que es justo la distincion que este contrato hace. */
    { file: 'interval.js',    provides: 'MSAInterval',  needs: ['MSAMls'],                  atLoad: [] }
  ];
  var PROVIDER = {};
  MODULES.forEach(function (m) { PROVIDER[m.provides] = m.file; });

  /** Nombres de archivo .js de assets, en el orden en que un cargador los pide. */
  function orderIn(relFile, re) {
    var text = fs.readFileSync(path.join(REPO, relFile), 'utf8');
    var out = [], m;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) out.push(m[1]);
    return out;
  }

  var LOADERS = [
    { name: 'index.html',
      order: orderIn('index.html', /<script src="assets\/js\/([a-z-]+\.js)/g) },
    { name: 'tests/index.html',
      order: orderIn('tests/index.html', /<script src="\.\.\/assets\/js\/([a-z-]+\.js)/g) },
    { name: 'tests/run-node.js',
      order: orderIn('tests/run-node.js', /require\('\.\.\/assets\/js\/([a-z-]+\.js)'\)/g) }
  ];

  /* ---------------------------------------------------------------------- *
   * 1. Estatico: cada modulo, despues de sus dependencias
   * ---------------------------------------------------------------------- */
  test('carga: los tres cargadores listan todos los modulos del contrato', function () {
    LOADERS.forEach(function (L) {
      MODULES.forEach(function (m) {
        assert(L.order.indexOf(m.file) >= 0,
          L.name + ' no carga ' + m.file + ' (carga: ' + L.order.join(', ') + ')');
      });
    });
  });

  test('carga: ningun modulo se pide antes que una dependencia suya', function () {
    LOADERS.forEach(function (L) {
      MODULES.forEach(function (m) {
        var mine = L.order.indexOf(m.file);
        if (mine < 0) return;
        m.needs.forEach(function (dep) {
          var depFile = PROVIDER[dep], theirs = L.order.indexOf(depFile);
          assert(theirs >= 0 && theirs < mine,
            L.name + ': ' + m.file + ' necesita ' + dep + ' (' + depFile + ') y se carga ' +
            (theirs < 0 ? 'sin el' : 'antes que el') + ' -> ' + L.order.join(', '));
        });
      });
    });
  });

  test('carga: cada modulo declara en el contrato los globales que nombra', function () {
    /* Si alguien anade una dependencia nueva y se olvida del contrato, esta
       prueba lo dice. Se ignoran los comentarios, donde los nombres aparecen
       como prosa y no como dereferencias. */
    MODULES.forEach(function (m) {
      var src = fs.readFileSync(path.join(REPO, 'assets/js', m.file), 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
      var found = {};
      (src.match(/MSA[A-Za-z]+/g) || []).forEach(function (n) { found[n] = true; });
      Object.keys(found).forEach(function (name) {
        if (name === m.provides || !PROVIDER[name]) return;
        assert(m.needs.indexOf(name) >= 0,
          m.file + ' usa ' + name + ' y no lo declara en `needs` de tests-carga.js');
      });
      m.needs.forEach(function (dep) {
        assert(found[dep], m.file + ' declara necesitar ' + dep + ' y no lo nombra');
      });
    });
  });

  /* ---------------------------------------------------------------------- *
   * 2. Dinamico: el orden bueno funciona y el malo falla
   * ---------------------------------------------------------------------- */
  /** Evalua una lista de modulos en un contexto limpio. Devuelve el error. */
  function loadInto(files) {
    var sandbox = { console: console };
    sandbox.window = undefined;
    sandbox.globalThis = sandbox;
    vm.createContext(sandbox);
    try {
      files.forEach(function (f) {
        vm.runInContext(fs.readFileSync(path.join(REPO, 'assets/js', f), 'utf8'), sandbox,
                        { filename: f });
      });
      return { error: null, sandbox: sandbox };
    } catch (e) {
      return { error: e, sandbox: sandbox };
    }
  }

  test('carga: en el orden de index.html todos los modulos quedan definidos', function () {
    var files = LOADERS[0].order.filter(function (f) {
      return MODULES.some(function (m) { return m.file === f; });
    });
    var r = loadInto(files);
    assert(!r.error, 'cargar en el orden de index.html lanzo: ' + (r.error && r.error.message));
    MODULES.forEach(function (m) {
      assert(typeof r.sandbox[m.provides] === 'object' && r.sandbox[m.provides] !== null,
        m.provides + ' no quedo definido tras cargar ' + files.join(', '));
    });
  });

  test('carga: el orden equivocado FALLA, y por eso la prueba de arriba vale', function () {
    /* anova-nested.js dereferencia MSADesign.KEY_SEP al evaluarse. Cargarlo
       sin design.js delante tiene que reventar ahi mismo. Si algun dia esto
       deja de fallar, es que alguien puso una degradacion silenciosa en el
       motor anidado, y hay que enterarse: calcular con una clave de celda
       distinta de la de la pantalla es peor que no arrancar. */
    var r = loadInto(['stats.js', 'anova.js', 'anova-nested.js']);
    assert(r.error, 'cargar anova-nested.js sin design.js deberia lanzar, y no lanzo');
    assert(/MSADesign|KEY_SEP|undefined/.test(r.error.message),
      'el error deberia senalar la dependencia ausente: ' + r.error.message);
    assert(typeof r.sandbox.MSANested === 'undefined',
      'y MSANested no debe quedar a medio definir');
  });

  test('carga: sin MSAStats, anova.js carga pero falla al usarse (runtime, no evaluacion)', function () {
    /* El contraste con el caso anterior: las dependencias de runtime no
       impiden cargar. Se prueba para que la distincion del contrato no sea
       una opinion escrita en un comentario. */
    var r = loadInto(['anova.js']);
    assert(!r.error, 'anova.js deberia cargar aunque falte MSAStats: ' + (r.error && r.error.message));
    assert(typeof r.sandbox.MSAAnova === 'object' && r.sandbox.MSAAnova !== null,
      'MSAAnova queda definido');
  });

})(typeof window !== 'undefined' ? window : globalThis);
