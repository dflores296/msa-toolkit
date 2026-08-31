#!/usr/bin/env node
/* ============================================================================
 * prueba-diseno.js - F-02 en la pantalla, en un navegador de verdad.
 *
 * POR QUE EXISTE
 *
 * F-02 de la auditoria vivia en tres sitios a la vez: el motor anidado, la
 * validacion de la configuracion y el enrutado de la importacion. Los dos
 * primeros ya se prueban sin DOM (tests-design.js, tests-nested.js), y el
 * tercero se saco a assets/js/design.js justo para poder probarlo igual.
 *
 * Queda el trozo que solo existe en la pantalla: que la app CABLEE ese modelo.
 * Un `route()` impecable no sirve de nada si app.js sigue llamando al viejo
 * `detectDesign`, y esa diferencia no la ve ninguna suite de motor. Eso es lo
 * que se comprueba aqui, disparado como lo dispara una persona.
 *
 * QUE COMPRUEBA
 *
 *   1. En anidado, numerar las piezas 1..n en cada operador se acepta: la
 *      tabla de captura se arma y no aparece el error de nombres repetidos.
 *   2. Y aparece el aviso, con los dos textos que pide la auditoria.
 *   3. Un estudio asi calcula, y publica Pieza(Operador) sin operador x pieza.
 *   4. Importar ese mismo estudio (CSV, que no declara metodo) NO saca del
 *      anidado ni afirma que todos midieron las mismas piezas.
 *   5. Importar un archivo que declara `method` lo respeta.
 *   6. Reordenar las filas del archivo no cambia el metodo ni los resultados.
 *   7. En cruzado, repetir un nombre de pieza sigue siendo un error.
 *
 * Y, desde F-06, el enrutado por TIPO de dato:
 *
 *   8. Un pasa / no pasa codificado 0/1 importado estando en atributos NO
 *      saca del metodo (antes si, y corria un ANOVA de variables).
 *   9. Estando en variables, ese mismo archivo se pregunta, no se decide.
 *  10. Escribir 0/1 a mano en la rejilla -- que no pasa por la importacion --
 *      avisa junto al resultado.
 *
 * USO
 *   node tests/prueba-diseno.js
 *
 * DEPENDENCIA
 *
 * Necesita Playwright y un Chromium, que NO son dependencias del proyecto,
 * igual que tests/prueba-impresion.js y tests/regresion-visual.js. La suite
 * de motor (node tests/run-node.js) no lo necesita:
 *
 *   npm i playwright && npx playwright install chromium
 *
 * Si Chromium ya vive en otro lado, se le indica con PLAYWRIGHT_CHROMIUM.
 * ==========================================================================*/
'use strict';

var http = require('http'), fs = require('fs'), path = require('path');

var REPO = path.resolve(__dirname, '..');

var chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  console.error('Falta Playwright, que no es dependencia del proyecto.\n' +
    '  npm i playwright && npx playwright install chromium\n' +
    'La suite de motor (node tests/run-node.js) no lo necesita.');
  process.exit(2);
}

var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
             '.json': 'application/json', '.md': 'text/plain' };

function serve() {
  return new Promise(function (resolve) {
    var srv = http.createServer(function (req, res) {
      var rel = decodeURIComponent(req.url.split('?')[0]);
      if (rel === '/') rel = '/index.html';
      var file = path.join(REPO, rel);
      if (file.indexOf(REPO) !== 0 || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); return res.end('no');
      }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', function () { resolve(srv); });
  });
}

var pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ok     ' + name); }
  else { fail++; console.log('  FALLO  ' + name + (detail ? '\n         ' + detail : '')); }
}

/* Un estudio destructivo 3 x 5 x 3 con las piezas numeradas 1..5 en CADA
   operador: la captura que antes cambiaba la app sola al metodo cruzado. */
var OPS = ['Ana', 'Beto', 'Cruz'], PER_OP = 5, REPS = 3;
function valueAt(oi, p, k) {
  return 10 + p * 0.7 + oi * 0.04 + ((p * 7 + k * 3 + oi * 11) % 5) * 0.01;
}
function csvRows() {
  var out = [];
  OPS.forEach(function (op, oi) {
    for (var p = 0; p < PER_OP; p++) {
      for (var k = 0; k < REPS; k++) {
        out.push([op, String(p + 1), String(k + 1), String(valueAt(oi, p, k))]);
      }
    }
  });
  return out;
}
function csvText(rows) {
  return 'operador,pieza,replica,medicion\n' + rows.map(function (r) { return r.join(','); }).join('\n');
}

/** Escribe la captura completa en la rejilla, por posicion. */
function fillGrid(page) {
  return page.evaluate(function (arg) {
    var inputs = [].slice.call(document.querySelectorAll('#dataTable input'));
    inputs.forEach(function (inp, i) {
      var reps = arg.reps, perOp = arg.perOp;
      var cell = Math.floor(i / reps), k = i % reps;
      var oi = Math.floor(cell / perOp), p = cell % perOp;
      inp.value = String(10 + p * 0.7 + oi * 0.04 + ((p * 7 + k * 3 + oi * 11) % 5) * 0.01);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
    return inputs.length;
  }, { reps: REPS, perOp: PER_OP });
}

/** Deja un archivo en el <input type=file> de importacion. */
function importText(page, name, text) {
  return page.setInputFiles('#importFile', {
    name: name, mimeType: name.slice(-4) === 'json' ? 'application/json' : 'text/csv',
    buffer: Buffer.from(text, 'utf8')
  });
}

/* Abrir la pagina en un metodo, SIEMPRE desde cero. Ir de "#anidado" a
   "#cruzado" con page.goto no recarga el documento: dispara un hashchange, y
   eso es un cambio de metodo pedido por el usuario, que con datos capturados
   pregunta antes de borrar. Correcto en la app, ruido en la prueba. */
function open(page, hash) {
  return page.goto('about:blank').then(function () { return page.goto(hash); });
}

function screenState(page) {
  return page.evaluate(function () {
    var txt = function (id) { var e = document.getElementById(id); return e ? e.textContent : ''; };
    return {
      metodo: document.documentElement.getAttribute('data-method'),
      configMsg: txt('configMsg'),
      configError: !!document.querySelector('#configMsg .err'),
      resultMsg: txt('resultMsg'),
      anova: txt('anovaTable'),
      celdas: [].slice.call(document.querySelectorAll('#dataTable input, #dataTable select'))
                .map(function (i) { return i.value; }).join('|'),
      filas: document.querySelectorAll('#dataTable tbody tr').length,
      veredictos: txt('verdicts')
    };
  });
}

(async function () {
  var srv = await serve();
  var base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  var browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  var page = await browser.newPage();
  /* Ningun caso de esta prueba debe llegar a preguntar: si sale un confirm,
     es que la app volvio a decidir el metodo por su cuenta y hay que verlo. */
  var confirms = [];
  page.on('dialog', function (d) { confirms.push(d.message()); d.accept(); });

  var NOTICE = 'se consideran objetos fisicos distintos';
  var HINT = 'utiliza el metodo cruzado';

  /* ---------------------------------------------------------------------- */
  console.log('\n===== CAPTURA MANUAL, PIEZAS 1..5 POR OPERADOR =====');
  await open(page, base + '#anidado');
  await page.fill('#numOperators', String(OPS.length));
  await page.fill('#numParts', String(PER_OP));
  await page.fill('#numReplicates', String(REPS));
  await page.click('#generateBtn');
  // Renombrar las piezas de los tres operadores a 1..5 (la app propone 1..15).
  await page.evaluate(function (arg) {
    var inputs = [].slice.call(document.querySelectorAll('#partNames input'));
    inputs.forEach(function (inp, i) {
      inp.value = String((i % arg.perOp) + 1);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }, { perOp: PER_OP });
  await page.click('#generateBtn');

  var s = await screenState(page);
  check('la tabla de captura se arma con nombres repetidos entre operadores',
    s.filas === OPS.length * PER_OP, 'filas = ' + s.filas);
  check('no aparece el error de nombres repetidos', !s.configError, s.configMsg);
  check('sigue en el metodo anidado', s.metodo === 'anidado', 'metodo = ' + s.metodo);
  check('avisa que son objetos fisicos distintos', s.configMsg.indexOf(NOTICE) >= 0, s.configMsg);
  check('y ofrece el cruzado como alternativa condicional', s.configMsg.indexOf(HINT) >= 0, s.configMsg);
  check('no afirma que todos midieran las mismas piezas',
    s.configMsg.indexOf('midieron las mismas piezas') < 0, s.configMsg);

  await fillGrid(page);
  await page.click('#calcBtn');
  var manual = await screenState(page);
  check('el estudio calcula y publica Pieza (Operador)',
    manual.anova.indexOf('Pieza (Operador)') >= 0, manual.anova.slice(0, 200));
  check('y no publica un termino operador x pieza',
    manual.anova.indexOf('Operador * Parte') < 0 && manual.anova.indexOf('Interaccion') < 0,
    manual.anova.slice(0, 200));
  check('los avisos del resultado repiten el aviso de identidad',
    manual.resultMsg.indexOf(NOTICE) >= 0 && manual.resultMsg.indexOf(HINT) >= 0,
    manual.resultMsg.slice(0, 300));
  check('nadie pregunto nada por el camino', confirms.length === 0, confirms.join(' // '));

  /* ---------------------------------------------------------------------- */
  console.log('\n===== IMPORTAR CSV ESTANDO EN ANIDADO =====');
  await open(page, base + '#anidado');
  confirms = [];
  await importText(page, 'destructivo.csv', csvText(csvRows()));
  await page.waitForFunction(function () {
    return document.querySelectorAll('#dataTable tbody tr').length > 0;
  });
  var imp = await screenState(page);
  check('el CSV no saca del metodo anidado', imp.metodo === 'anidado', 'metodo = ' + imp.metodo);
  check('no se afirma que todos midieron las mismas piezas',
    imp.configMsg.indexOf('midieron las mismas piezas') < 0, imp.configMsg);
  check('se avisa como se leen los nombres repetidos', imp.configMsg.indexOf(NOTICE) >= 0, imp.configMsg);
  check('la importacion no pregunto nada', confirms.length === 0, confirms.join(' // '));
  check('se cargaron las 45 mediciones', imp.filas === OPS.length * PER_OP,
    'filas = ' + imp.filas);

  await page.click('#calcBtn');
  var impCalc = await screenState(page);
  check('importado da el mismo resultado que capturado a mano',
    impCalc.anova === manual.anova, 'las tablas ANOVA difieren');

  /* ---------------------------------------------------------------------- */
  console.log('\n===== REORDENAR LAS FILAS DEL ARCHIVO =====');
  await open(page, base + '#anidado');
  confirms = [];
  var rows = csvRows(), mixed = [], step = 23;
  for (var i = 0; i < rows.length; i++) mixed.push(rows[(i * step) % rows.length]);
  await importText(page, 'destructivo-desordenado.csv', csvText(mixed));
  await page.waitForFunction(function () {
    return document.querySelectorAll('#dataTable tbody tr').length > 0;
  });
  await page.click('#calcBtn');
  var mix = await screenState(page);
  check('el orden de las filas no cambia el metodo', mix.metodo === 'anidado', 'metodo = ' + mix.metodo);
  check('el orden de las filas no cambia el ANOVA', mix.anova === manual.anova,
    'las tablas ANOVA difieren');
  check('el orden de las filas no cambia los veredictos', mix.veredictos === manual.veredictos,
    'los veredictos difieren');

  /* ---------------------------------------------------------------------- */
  console.log('\n===== EL ARCHIVO DECLARA SU METODO =====');
  await open(page, base + '#cruzado');
  confirms = [];
  var payload = { format: 'msa-toolkit/gage-rr-anova-nested', method: 'anidado',
                  data: csvRows().map(function (r) {
                    return { operator: r[0], part: r[1], replicate: Number(r[2]), value: Number(r[3]) };
                  }) };
  await importText(page, 'declarado.json', JSON.stringify(payload));
  await page.waitForFunction(function () {
    return document.querySelectorAll('#dataTable tbody tr').length > 0;
  });
  var dec = await screenState(page);
  check('el metodo declarado por el archivo se respeta', dec.metodo === 'anidado',
    'metodo = ' + dec.metodo);
  check('y se dice de donde salio el cambio',
    dec.configMsg.indexOf('declara el metodo anidado') >= 0, dec.configMsg);
  check('sin preguntar, porque el archivo no lo esta adivinando',
    confirms.length === 0, confirms.join(' // '));

  /* Y al reves: estando en anidado, un archivo que declara cruzado manda. */
  await open(page, base + '#anidado');
  confirms = [];
  var cross = { method: 'cruzado', data: [] };
  OPS.forEach(function (op, oi) {
    for (var p = 0; p < PER_OP; p++) {
      for (var k = 0; k < REPS; k++) {
        cross.data.push({ operator: op, part: String(p + 1), replicate: k + 1,
                          value: valueAt(0, p, k) + oi * 0.03 });
      }
    }
  });
  await importText(page, 'cruzado.json', JSON.stringify(cross));
  await page.waitForFunction(function () {
    return document.querySelectorAll('#dataTable tbody tr').length > 0;
  });
  var dec2 = await screenState(page);
  check('un archivo que declara cruzado saca del anidado', dec2.metodo === 'cruzado',
    'metodo = ' + dec2.metodo);

  /* ---------------------------------------------------------------------- */
  console.log('\n===== EN CRUZADO, LOS NOMBRES SIGUEN SIENDO UNICOS =====');
  await open(page, base + '#cruzado');
  await page.fill('#numOperators', '3');
  await page.fill('#numParts', '4');
  await page.click('#generateBtn');
  await page.evaluate(function () {
    var inputs = [].slice.call(document.querySelectorAll('#partNames input'));
    inputs[1].value = inputs[0].value;                 // dos piezas con el mismo nombre
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#generateBtn');
  var cru = await screenState(page);
  check('el cruzado sigue rechazando dos piezas con el mismo nombre', cru.configError, cru.configMsg);
  check('y el mensaje no habla de operadores', cru.configMsg.indexOf('entre operadores') < 0, cru.configMsg);

  /* En anidado, en cambio, repetir DENTRO de un operador si es un error. */
  await open(page, base + '#anidado');
  await page.fill('#numOperators', '3');
  await page.fill('#numParts', '4');
  await page.click('#generateBtn');
  await page.evaluate(function () {
    var inputs = [].slice.call(document.querySelectorAll('#partNames input'));
    inputs[1].value = inputs[0].value;                 // mismo operador, mismo nombre
    inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.click('#generateBtn');
  var ani = await screenState(page);
  check('el anidado rechaza repetir un nombre dentro del mismo operador', ani.configError, ani.configMsg);
  check('y lo dice con esas palabras',
    ani.configMsg.indexOf('dentro de un mismo operador') >= 0, ani.configMsg);

  /* ---------------------------------------------------------------------- */
  console.log('\n===== F-06: PASA / NO PASA CODIFICADO COMO 0 / 1 =====');

  /* El caso peligroso no es el que da 99 %: es el que da un numero creible.
     Aqui los tres evaluadores casi siempre coinciden, asi que analizado como
     variables sale un %GRR bajo y un veredicto "Aceptable" sobre datos donde
     la varianza no mide nada. */
  function csvCodificado() {
    var out = 'operador,pieza,replica,medicion\n';
    for (var p = 1; p <= 10; p++) {
      var verdad = p <= 5 ? 1 : 0;
      ['Ana', 'Beto', 'Cruz'].forEach(function (op, oi) {
        for (var k = 1; k <= 3; k++) {
          // un solo desacuerdo en todo el estudio: acuerdo casi perfecto
          var v = (p === 6 && oi === 1 && k === 2) ? 1 - verdad : verdad;
          out += [op, 'Pieza ' + p, k, v].join(',') + '\n';
        }
      });
    }
    return out;
  }

  await open(page, base + '#atributos');
  confirms = [];
  await importText(page, 'codificado.csv', csvCodificado());
  await page.waitForFunction(function () {
    return document.querySelectorAll('#dataTable tbody tr').length > 0;
  });
  var cod = await screenState(page);
  check('F-06: importar 0/1 en atributos NO saca del metodo',
        cod.metodo === 'atributos', 'metodo = ' + cod.metodo);
  check('F-06: y explica por que se queda',
        cod.configMsg.indexOf('pasa / no pasa codificado') >= 0, cod.configMsg);
  check('F-06: sin preguntar (el metodo activo ya era el correcto)',
        confirms.length === 0, confirms.join(' // '));
  check('F-06: ya no dice "se salio del metodo de atributos"',
        cod.configMsg.indexOf('se salio del metodo de atributos') < 0, cod.configMsg);

  /* Estando en cruzado, el mismo archivo tiene que preguntar. */
  await open(page, base + '#cruzado');
  confirms = [];
  page.removeAllListeners('dialog');
  page.on('dialog', function (d) { confirms.push(d.message()); d.dismiss(); });   // cancelar
  await importText(page, 'codificado.csv', csvCodificado());
  await page.waitForFunction(function () {
    return document.querySelectorAll('#dataTable tbody tr').length > 0;
  });
  var codCru = await screenState(page);
  check('F-06: en cruzado, el archivo 0/1 pregunta',
        confirms.length === 1, 'dialogos: ' + confirms.length);
  check('F-06: la pregunta trae las cifras del archivo',
        confirms.join(' ').indexOf('2 valores distintos') >= 0, confirms.join(' // '));
  check('F-06: cancelar conserva el metodo elegido',
        codCru.metodo === 'cruzado', 'metodo = ' + codCru.metodo);
  check('F-06: y deja dicho el supuesto con el que se sigue',
        codCru.configMsg.indexOf('no significa nada') >= 0, codCru.configMsg);

  /* Y al calcular, el aviso vuelve a estar junto al resultado. */
  await page.click('#calcBtn');
  await page.waitForTimeout(400);
  var codCalc = await screenState(page);
  check('F-06: el aviso acompana al resultado, no solo a la importacion',
        codCalc.resultMsg.indexOf('pasa / no pasa codificado') >= 0,
        codCalc.resultMsg.slice(0, 400));

  /* Aceptar la propuesta lleva a atributos. */
  await open(page, base + '#cruzado');
  confirms = [];
  page.removeAllListeners('dialog');
  page.on('dialog', function (d) { confirms.push(d.message()); d.accept(); });
  await importText(page, 'codificado.csv', csvCodificado());
  await page.waitForFunction(function () {
    return document.querySelectorAll('#dataTable tbody tr').length > 0;
  });
  var codOk = await screenState(page);
  check('F-06: aceptar la propuesta lleva a atributos',
        codOk.metodo === 'atributos', 'metodo = ' + codOk.metodo);

  /* Captura MANUAL: escribir 0/1 a mano no pasa por la importacion. */
  await open(page, base + '#cruzado');
  await page.fill('#numOperators', '3');
  await page.fill('#numParts', '5');
  await page.fill('#numReplicates', '2');
  await page.click('#generateBtn');
  await page.evaluate(function () {
    [].slice.call(document.querySelectorAll('#dataTable input')).forEach(function (inp, i) {
      inp.value = String(Math.floor(i / 2) % 2);
      inp.dispatchEvent(new Event('input', { bubbles: true }));
    });
  });
  await page.click('#calcBtn');
  await page.waitForTimeout(400);
  var manual = await screenState(page);
  check('F-06: escribir 0/1 a mano tambien avisa',
        manual.resultMsg.indexOf('pasa / no pasa codificado') >= 0,
        manual.resultMsg.slice(0, 400));
  check('F-06: y el aviso nombra el metodo que si corresponde',
        manual.resultMsg.indexOf('Atributos') >= 0, manual.resultMsg.slice(0, 400));

  /* Un estudio de mediciones de verdad no debe recibir ninguno de estos avisos. */
  await open(page, base + '#cruzado');
  await page.click('#demoBtn');
  await page.waitForFunction(function () { return !document.getElementById('calcBtn').disabled; });
  await page.click('#calcBtn');
  await page.waitForTimeout(400);
  var real = await screenState(page);
  check('F-06: el ejemplo AIAG no recibe el aviso de codificacion',
        real.resultMsg.indexOf('codificado') < 0, real.resultMsg.slice(0, 300));

  await browser.close();
  srv.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' comprobaciones pasaron.');
  process.exitCode = fail === 0 ? 0 : 1;
})().catch(function (e) {
  console.error('\nLa prueba se cayo:', e && e.stack || e);
  process.exit(1);
});
