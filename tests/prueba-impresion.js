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
    await page.evaluate(function () {
      /* window.print() abriria el dialogo del sistema y bloquearia. Se
         sustituye por un disparo de los dos eventos que el navegador emite
         alrededor, que es exactamente lo que la aplicacion escucha. */
      window.print = function () {
        window.dispatchEvent(new Event('beforeprint'));
        window.__imprimio = true;
      };
    });
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

  await browser.close();
  srv.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' comprobaciones pasaron.');
  process.exitCode = fail ? 1 : 0;
})().catch(function (e) {
  console.error('Error de la herramienta:', e);
  process.exit(1);
});
