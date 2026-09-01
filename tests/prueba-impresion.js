#!/usr/bin/env node
/* ============================================================================
 * prueba-impresion.js - El reporte impreso, en un navegador de verdad.
 *
 * POR QUE EXISTE
 *
 * F-03 de la auditoria: imprimir un estudio de atributos lanzaba TypeError,
 * la preparacion abortaba y la pantalla se quedaba a medias. Las 137 pruebas
 * de motor seguian en verde, porque ninguna toca el DOM. Esa es la deuda que
 * el README ya documentaba, y esta herramienta cubre el trozo que importa:
 * el camino completo de impresion, disparado como lo dispara una persona.
 *
 * QUE COMPRUEBA, en los tres metodos
 *
 *   1. El boton "Imprimir / PDF" prepara el reporte sin lanzar.
 *   2. Ctrl+P (el evento beforeprint) hace exactamente lo mismo.
 *   3. El encabezado no contiene undefined, null ni NaN, y no trae campos de
 *      otro metodo.
 *   4. No se imprimen los paneles del metodo ajeno.
 *   5. Al terminar (afterprint) la interfaz vuelve EXACTAMENTE a como estaba:
 *      paneles, pestana activa, tema.
 *   6. Imprimir no altera ni los calculos ni el estado capturado: las celdas,
 *      las tarjetas de veredicto y las tablas de resultados son identicas
 *      antes y despues.
 *   7. La restauracion ocurre AUNQUE la preparacion falle a mitad.
 *
 * Y, desde F-03.1, los recorridos que el bloque de arriba no tocaba:
 *
 *   8. Imprimir SIN haber calculado, en los tres metodos. Ahi no hay
 *      `result` del que deducir la familia del estudio, y atributos se
 *      imprimia con el encabezado de variables ("3 operadores x 30 piezas =
 *      270 mediciones", Especificacion, Multiplicador).
 *   9. Importar un estudio de atributos, calcular e imprimir. Las
 *      comprobaciones de arriba entran por el boton de ejemplo, asi que el
 *      camino de importacion -- que F-02 reescribio -- no lo miraba nadie.
 *  10. Categoria de rechazo pendiente: el encabezado tiene que decir que
 *      falta, no inventarla ni callarla.
 *  11. La interfaz se restaura tambien en todos esos recorridos.
 *
 * USO
 *   node tests/prueba-impresion.js
 *
 * DEPENDENCIA
 *
 * Necesita Playwright y un Chromium, que NO son dependencias del proyecto,
 * igual que tests/regresion-visual.js. La aplicacion y la suite de motor
 * (node tests/run-node.js) siguen corriendo sin instalar nada:
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

/* Retrato de lo que el usuario ve y tiene capturado. Se compara antes y
   despues de imprimir: si imprimir toca algo, aqui se nota. */
function snapshot(page) {
  return page.evaluate(function () {
    var txt = function (id) { var e = document.getElementById(id); return e ? e.innerHTML : null; };
    return {
      celdas: [].slice.call(document.querySelectorAll('#dataTable input, #dataTable select'))
                .map(function (i) { return i.value; }).join(''),
      veredictos: txt('verdicts'),
      barras: txt('evalBars'),
      avisos: txt('resultMsg'),
      tablaVar: txt('varianceTable'),
      tablaAnova: txt('anovaTable'),
      tablaAcuerdo: txt('agreeWithinTable'),
      notas: txt('resultNotes'),
      tema: document.documentElement.getAttribute('data-theme') || 'light',
      metodo: document.documentElement.getAttribute('data-method'),
      pestanaActiva: (document.querySelector('.tab-btn.active') || {}).textContent || null,
      panelesVisibles: [].slice.call(document.querySelectorAll('.tab-panel'))
        .filter(function (p) { return !p.hidden; })
        .map(function (p) { return p.dataset.panel; }).sort().join(','),
      titulo: document.title
    };
  });
}

function headerText(page) {
  return page.evaluate(function () {
    var h = document.getElementById('printHeader');
    return { html: h.innerHTML, texto: h.textContent || '' };
  });
}

function diff(a, b) {
  return Object.keys(a).filter(function (k) { return a[k] !== b[k]; });
}

/* Imprimir de verdad: el boton dispara window.print(), que aqui se sustituye
   por los dos eventos que el navegador emite alrededor -- que es exactamente
   lo que la aplicacion escucha -- para no abrir el dialogo del sistema. */
async function prepararImpresion(page) {
  await page.evaluate(function () {
    window.print = function () {
      window.dispatchEvent(new Event('beforeprint'));
      window.__imprimio = true;
    };
  });
}

/* Un recorrido completo de impresion sobre la pagina tal como este: imprime,
   lee el encabezado, restaura y compara. Devuelve lo necesario para juzgar. */
async function recorridoImpresion(page, errores) {
  await prepararImpresion(page);
  var antes = await snapshot(page);
  errores.length = 0;
  await page.click('#printBtn');
  await page.waitForTimeout(250);
  var hdr = await headerText(page);
  await page.evaluate(function () { window.dispatchEvent(new Event('afterprint')); });
  await page.waitForTimeout(250);
  var despues = await snapshot(page);
  return { errores: errores.slice(), hdr: hdr, cambios: diff(antes, despues) };
}

/* Lo que un encabezado de atributos NO puede traer: son campos del mundo de
   la varianza, y en concordancia no existen. La lista es la de F-03.1. */
var PROHIBIDO_ATRIBUTOS = ['Especificacion', 'Multiplicador', 'Alfa', 'Modelo',
                           'Categorias distintas', '% Study Variation'];
/* Y lo que no puede traer ANTES de calcular: existen, pero todavia no se han
   calculado, y ponerlas en blanco seria decir que fallaron. */
var PROHIBIDO_SIN_CALCULAR = ['Kappa', 'Efectividad', 'Error de fuga', 'Falsa alarma',
                              'Entre evaluadores', 'Todos vs estandar', 'Discriminacion'];

var METODOS = [
  { id: 'cruzado',   nombre: 'CRUZADO',
    prohibidos: ['Concordancia', 'Kappa'],
    esperados: ['% Study Variation', 'Categorias distintas', 'Alfa', 'Discriminacion'] },
  { id: 'anidado',   nombre: 'ANIDADO',
    prohibidos: ['Concordancia', 'Kappa'],
    esperados: ['% Study Variation', 'Categorias distintas', 'Discriminacion'] },
  { id: 'atributos', nombre: 'ATRIBUTOS',
    prohibidos: ['% Study Variation', 'Categorias distintas', 'Alfa', 'Multiplicador',
                 'Especificacion', 'Discriminacion'],
    esperados: ['Entre evaluadores', 'Kappa', 'Categoria de rechazo', 'Error de fuga'] }
];

(async function () {
  var srv = await serve();
  var base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  /* PLAYWRIGHT_CHROMIUM permite usar un Chromium que ya viva en la maquina,
     util cuando la version que Playwright espera no es la instalada. */
  var browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});

  for (var i = 0; i < METODOS.length; i++) {
    var m = METODOS[i];
    console.log('\n===== ' + m.nombre + ' =====');
    var page = await browser.newPage();
    var errores = [];
    page.on('pageerror', function (e) { errores.push(String(e)); });

    await page.goto(base + '#' + m.id);
    await page.waitForFunction(function () { return !!document.getElementById('demoBtn'); });
    await page.click('#demoBtn');
    await page.waitForFunction(function () {
      return !document.getElementById('calcBtn').disabled;
    }, null, { timeout: 15000 });
    await page.click('#calcBtn');
    await page.waitForFunction(function () {
      return !document.getElementById('resultBody').hidden;
    }, null, { timeout: 15000 });
    await page.waitForTimeout(400);       // que Chart.js termine de dibujar

    var antes = await snapshot(page);
    errores.length = 0;

    /* --- 1. El boton Imprimir / PDF ------------------------------------- */
    await prepararImpresion(page);
    await page.click('#printBtn');
    await page.waitForTimeout(250);

    check(m.nombre + ': el boton Imprimir/PDF no lanza',
          errores.length === 0, errores.join(' | '));

    var hdr = await headerText(page);
    check(m.nombre + ': el encabezado se arma', hdr.texto.trim().length > 20, hdr.html.slice(0, 200));
    check(m.nombre + ': el encabezado no trae undefined, null ni NaN',
          !/undefined|null|NaN/.test(hdr.texto), hdr.texto.slice(0, 300));
    check(m.nombre + ': el encabezado no trae campos de otro metodo',
          m.prohibidos.every(function (p) { return hdr.texto.indexOf(p) < 0; }),
          'prohibidos presentes: ' + m.prohibidos.filter(function (p) {
            return hdr.texto.indexOf(p) >= 0; }).join(', '));
    check(m.nombre + ': el encabezado trae lo que si corresponde',
          m.esperados.every(function (p) { return hdr.texto.indexOf(p) >= 0; }),
          'faltan: ' + m.esperados.filter(function (p) {
            return hdr.texto.indexOf(p) < 0; }).join(', '));

    var anexo = await page.evaluate(function () {
      return (document.getElementById('printAnnex').textContent || '').slice(0, 400);
    });
    check(m.nombre + ': el anexo de mediciones se arma', anexo.indexOf('Anexo') >= 0, anexo.slice(0, 120));

    /* --- 4. Ningun panel del metodo ajeno queda visible ------------------ */
    var ajenos = await page.evaluate(function () {
      var metodo = document.documentElement.getAttribute('data-method');
      return [].slice.call(document.querySelectorAll('.tab-panel'))
        .filter(function (p) {
          if (p.hidden) return false;
          var lista = p.getAttribute('data-methods');
          return lista && lista.split(/[\s,]+/).indexOf(metodo) < 0;
        }).map(function (p) { return p.dataset.panel; });
    });
    check(m.nombre + ': no se revela ningun panel del metodo ajeno',
          ajenos.length === 0, 'revelados: ' + ajenos.join(', '));

    /* --- 5 y 6. afterprint restaura, y nada cambio ---------------------- */
    await page.evaluate(function () { window.dispatchEvent(new Event('afterprint')); });
    await page.waitForTimeout(250);
    var despues = await snapshot(page);
    var cambios = diff(antes, despues);
    check(m.nombre + ': la interfaz vuelve exactamente a como estaba',
          cambios.length === 0, 'cambio: ' + cambios.join(', '));
    check(m.nombre + ': ni los calculos ni la captura se alteraron',
          antes.celdas === despues.celdas && antes.veredictos === despues.veredictos &&
          antes.tablaVar === despues.tablaVar && antes.tablaAnova === despues.tablaAnova &&
          antes.tablaAcuerdo === despues.tablaAcuerdo && antes.notas === despues.notas,
          'difieren: ' + ['celdas', 'veredictos', 'tablaVar', 'tablaAnova', 'tablaAcuerdo', 'notas']
            .filter(function (k) { return antes[k] !== despues[k]; }).join(', '));

    /* --- 2. Ctrl+P: el mismo camino por el evento beforeprint ----------- */
    errores.length = 0;
    await page.evaluate(function () { window.dispatchEvent(new Event('beforeprint')); });
    await page.waitForTimeout(250);
    var hdr2 = await headerText(page);
    check(m.nombre + ': Ctrl+P (beforeprint) no lanza', errores.length === 0, errores.join(' | '));
    check(m.nombre + ': Ctrl+P arma el mismo encabezado que el boton',
          hdr2.texto === hdr.texto, 'boton != Ctrl+P');
    await page.evaluate(function () { window.dispatchEvent(new Event('afterprint')); });
    await page.waitForTimeout(250);
    var tras = await snapshot(page);
    check(m.nombre + ': tras Ctrl+P la interfaz tambien vuelve',
          diff(antes, tras).length === 0, 'cambio: ' + diff(antes, tras).join(', '));

    /* --- 7. Si la preparacion falla, la pantalla se restaura igual ------ */
    errores.length = 0;
    await page.evaluate(function () {
      window.__resizeReal = MSACharts.resizeAll;
      MSACharts.resizeAll = function () { throw new Error('fallo inyectado a proposito'); };
    });
    await page.evaluate(function () { window.dispatchEvent(new Event('beforeprint')); });
    await page.waitForTimeout(200);
    await page.evaluate(function () {
      MSACharts.resizeAll = window.__resizeReal;
      window.dispatchEvent(new Event('afterprint'));
    });
    await page.waitForTimeout(250);
    var traFallo = await snapshot(page);
    check(m.nombre + ': con la preparacion rota, la interfaz se restaura igual',
          diff(antes, traFallo).length === 0, 'quedo roto en: ' + diff(antes, traFallo).join(', '));

    await page.close();
  }

  /* ====================================================================== *
   * F-03.1 - Imprimir SIN haber calculado, en los tres metodos.
   *
   * Aqui `state.result` es null, asi que la familia del estudio solo puede
   * salir del metodo activo. Antes salia siempre "variables".
   * ====================================================================== */
  console.log('\n===== SIN CALCULAR =====');
  var SIN_CALCULAR = [
    { id: 'atributos', nombre: 'ATRIBUTOS sin calcular',
      esperados: ['evaluadores', 'clasificaciones', 'Attribute Agreement Analysis',
                  'Categoria de rechazo', 'Sin calcular'],
      prohibidos: PROHIBIDO_ATRIBUTOS.concat(PROHIBIDO_SIN_CALCULAR, ['operadores', 'mediciones']) },
    { id: 'cruzado', nombre: 'CRUZADO sin calcular',
      esperados: ['operadores', 'mediciones', 'Especificacion', 'Multiplicador', 'Alfa', 'Sin calcular'],
      prohibidos: ['evaluadores', 'clasificaciones', 'Kappa', '% Study Variation',
                   'Categorias distintas', 'Discriminacion'] },
    { id: 'anidado', nombre: 'ANIDADO sin calcular',
      esperados: ['operadores', 'mediciones', 'Especificacion', 'Multiplicador', 'Sin calcular'],
      prohibidos: ['evaluadores', 'clasificaciones', 'Kappa', 'Alfa', '% Study Variation',
                   'Categorias distintas', 'Discriminacion'] }
  ];

  for (var j = 0; j < SIN_CALCULAR.length; j++) {
    var sc = SIN_CALCULAR[j];
    var pg = await browser.newPage();
    var errs = [];
    pg.on('pageerror', function (e) { errs.push(String(e)); });
    await pg.goto(base + '#' + sc.id);
    await pg.waitForFunction(function () { return !!document.getElementById('generateBtn'); });
    // Se genera la tabla de captura pero NO se calcula: ese es el caso.
    await pg.click('#generateBtn');
    await pg.waitForTimeout(150);
    var sinCalc = await pg.evaluate(function () {
      return { hayResultado: !document.getElementById('resultsSection').hidden };
    });
    check(sc.nombre + ': el escenario es real (no hay resultado en pantalla)',
          sinCalc.hayResultado === false);

    var r = await recorridoImpresion(pg, errs);
    check(sc.nombre + ': imprimir no lanza', r.errores.length === 0, r.errores.join(' | '));
    check(sc.nombre + ': el encabezado se arma',
          r.hdr.texto.trim().length > 20, r.hdr.html.slice(0, 200));
    check(sc.nombre + ': sin undefined, null ni NaN',
          !/undefined|null|NaN/.test(r.hdr.texto), r.hdr.texto.slice(0, 300));
    check(sc.nombre + ': trae lo que corresponde',
          sc.esperados.every(function (e) { return r.hdr.texto.indexOf(e) >= 0; }),
          'faltan: ' + sc.esperados.filter(function (e) {
            return r.hdr.texto.indexOf(e) < 0; }).join(', ') + '  ->  ' + r.hdr.texto);
    check(sc.nombre + ': no trae campos que no aplican',
          sc.prohibidos.every(function (e) { return r.hdr.texto.indexOf(e) < 0; }),
          'presentes: ' + sc.prohibidos.filter(function (e) {
            return r.hdr.texto.indexOf(e) >= 0; }).join(', ') + '  ->  ' + r.hdr.texto);
    check(sc.nombre + ': la interfaz se restaura',
          r.cambios.length === 0, 'cambio: ' + r.cambios.join(', '));
    await pg.close();
  }

  /* ====================================================================== *
   * F-03.1 - Categoria de rechazo pendiente, y luego elegida.
   * ====================================================================== */
  console.log('\n===== CATEGORIA DE RECHAZO PENDIENTE =====');
  var pgRc = await browser.newPage();
  var errsRc = [];
  pgRc.on('pageerror', function (e) { errsRc.push(String(e)); });
  await pgRc.goto(base + '#atributos');
  await pgRc.waitForFunction(function () { return !!document.getElementById('generateBtn'); });
  await pgRc.click('#generateBtn');
  await pgRc.waitForTimeout(150);

  var rPend = await recorridoImpresion(pgRc, errsRc);
  check('RECHAZO: sin elegir, el encabezado lo dice',
        rPend.hdr.texto.indexOf('No seleccionada') >= 0, rPend.hdr.texto);
  check('RECHAZO: sin elegir, no se inventa una categoria',
        !/Categoria de rechazo\s*"/.test(rPend.hdr.texto), rPend.hdr.texto);
  check('RECHAZO: sin elegir, la interfaz se restaura',
        rPend.cambios.length === 0, 'cambio: ' + rPend.cambios.join(', '));

  await pgRc.evaluate(function () {
    var sel = document.getElementById('rejectCategory');
    sel.value = 'No pasa';
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  var rElegida = await recorridoImpresion(pgRc, errsRc);
  check('RECHAZO: elegida, el encabezado la imprime',
        rElegida.hdr.texto.indexOf('"No pasa"') >= 0, rElegida.hdr.texto);
  check('RECHAZO: elegida, ya no dice No seleccionada',
        rElegida.hdr.texto.indexOf('No seleccionada') < 0, rElegida.hdr.texto);
  check('RECHAZO: elegida, la interfaz se restaura',
        rElegida.cambios.length === 0, 'cambio: ' + rElegida.cambios.join(', '));
  await pgRc.close();

  /* ====================================================================== *
   * F-03.1 - Importar atributos, calcular e imprimir.
   *
   * Las comprobaciones por metodo entran por el boton de ejemplo. El camino
   * de importacion lo reescribio F-02 y no lo miraba ninguna suite hasta el
   * reporte.
   * ====================================================================== */
  console.log('\n===== IMPORTAR ATRIBUTOS, CALCULAR E IMPRIMIR =====');
  var pgImp = await browser.newPage();
  var errsImp = [];
  pgImp.on('pageerror', function (e) { errsImp.push(String(e)); });
  await pgImp.goto(base + '#atributos');
  await pgImp.waitForFunction(function () { return !!document.getElementById('importFile'); });
  var datasetAtrib = fs.readFileSync(path.join(REPO, 'datasets/atributos-ejemplo.json'), 'utf8');
  await pgImp.setInputFiles('#importFile', { name: 'atributos-ejemplo.json',
    mimeType: 'application/json', buffer: Buffer.from(datasetAtrib, 'utf8') });
  await pgImp.waitForFunction(function () {
    return document.querySelectorAll('#dataTable tbody tr').length > 0;
  }, null, { timeout: 15000 });
  check('IMPORTAR: el archivo entra en el metodo de atributos',
        await pgImp.evaluate(function () {
          return document.documentElement.getAttribute('data-method'); }) === 'atributos');

  /* Antes de calcular: el encabezado ya tiene que ser de atributos (F-03.1). */
  var rImpSin = await recorridoImpresion(pgImp, errsImp);
  check('IMPORTAR: sin calcular, el encabezado ya es de atributos',
        rImpSin.hdr.texto.indexOf('evaluadores') >= 0 &&
        rImpSin.hdr.texto.indexOf('clasificaciones') >= 0, rImpSin.hdr.texto);
  check('IMPORTAR: sin calcular, sin campos de varianza',
        PROHIBIDO_ATRIBUTOS.every(function (e) { return rImpSin.hdr.texto.indexOf(e) < 0; }),
        'presentes: ' + PROHIBIDO_ATRIBUTOS.filter(function (e) {
          return rImpSin.hdr.texto.indexOf(e) >= 0; }).join(', '));

  await pgImp.evaluate(function () {
    var sel = document.getElementById('rejectCategory');
    if (sel && !sel.value) {
      sel.value = 'No pasa';
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await pgImp.waitForFunction(function () {
    return !document.getElementById('calcBtn').disabled;
  }, null, { timeout: 15000 });
  await pgImp.click('#calcBtn');
  await pgImp.waitForFunction(function () {
    return !document.getElementById('resultBody').hidden;
  }, null, { timeout: 15000 });
  await pgImp.waitForTimeout(400);

  var rImp = await recorridoImpresion(pgImp, errsImp);
  check('IMPORTAR: calcular e imprimir no lanza', rImp.errores.length === 0, rImp.errores.join(' | '));
  check('IMPORTAR: sin undefined, null ni NaN',
        !/undefined|null|NaN/.test(rImp.hdr.texto), rImp.hdr.texto.slice(0, 300));
  check('IMPORTAR: el encabezado trae las cifras de decision',
        ['Entre evaluadores', 'Kappa', 'Categoria de rechazo', 'Error de fuga']
          .every(function (e) { return rImp.hdr.texto.indexOf(e) >= 0; }), rImp.hdr.texto);
  check('IMPORTAR: sin campos del mundo de la varianza',
        PROHIBIDO_ATRIBUTOS.every(function (e) { return rImp.hdr.texto.indexOf(e) < 0; }),
        'presentes: ' + PROHIBIDO_ATRIBUTOS.filter(function (e) {
          return rImp.hdr.texto.indexOf(e) >= 0; }).join(', '));
  check('IMPORTAR: el anexo se arma',
        (await pgImp.evaluate(function () {
          return document.getElementById('printAnnex').textContent || ''; })).indexOf('Anexo') >= 0);
  check('IMPORTAR: la interfaz se restaura',
        rImp.cambios.length === 0, 'cambio: ' + rImp.cambios.join(', '));
  await pgImp.close();

  await browser.close();
  srv.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' comprobaciones pasaron.');
  process.exitCode = fail ? 1 : 0;
})().catch(function (e) {
  console.error('Error de la herramienta:', e);
  process.exit(1);
});
