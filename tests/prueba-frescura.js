#!/usr/bin/env node
/* ============================================================================
 * prueba-frescura.js - F-05: el resultado publicado y los datos en pantalla.
 *
 * POR QUE EXISTE
 *
 * F-05 de la auditoria. Editar una celda disparaba `validateLive()`, que solo
 * movia el contador y el boton: `state.result` seguia ahi, el panel seguia
 * visible con los numeros de antes, y el rotulo de la columna derecha decia
 * "actualizado al escribir", que era falso. Al imprimir, el encabezado y las
 * tablas salian del resultado VIEJO mientras el anexo se armaba leyendo el DOM
 * ACTUAL, y el anexo cerraba afirmando:
 *
 *     "Los calculos de este reporte salen exactamente de estos datos."
 *
 * En ese escenario la frase es falsa, en un documento que sirve para liberar
 * un instrumento en una planta.
 *
 * QUE COMPRUEBA
 *
 *   1. Reproduce el escenario: calcular, editar una celda, y ver que el
 *      resultado publicado ya no corresponde a lo capturado.
 *   2. La pantalla lo dice: banner, panel atenuado y el rotulo cambiado.
 *   3. "Imprimir / PDF" queda bloqueado hasta recalcular.
 *   4. Ctrl+P -- que no pasa por el boton -- tampoco publica el resultado
 *      viejo: el encabezado lo declara desactualizado y no trae ni una cifra
 *      del calculo anterior.
 *   5. El anexo deja de afirmar que los calculos salen de esas mediciones.
 *   6. Recalcular lo devuelve todo a la normalidad.
 *   7. Deshacer la edicion (volver al valor original) tambien: la huella se
 *      compara por contenido, no por "hubo un evento de teclado".
 *   8. Cambiar un campo de opciones no deja el panel caduco, porque esos SI
 *      recalculan solos.
 *   9. Vale en los tres metodos.
 *
 * USO
 *   node tests/prueba-frescura.js
 *
 * DEPENDENCIA
 *
 * Playwright y un Chromium, que NO son dependencias del proyecto, igual que
 * las otras herramientas de navegador. `node tests/run-node.js` no lo necesita.
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
  else { fail++; console.log('  FALLO  ' + name + (detail ? '\n         ' + String(detail).slice(0, 300) : '')); }
}

/** Todo lo que hay que mirar para juzgar la frescura, de una sola pasada. */
function estado(page) {
  return page.evaluate(function () {
    var el = function (id) { return document.getElementById(id); };
    return {
      bannerVisible: !!el('resultStale') && !el('resultStale').hidden,
      cuerpoAtenuado: !!el('resultBody') && el('resultBody').classList.contains('stale'),
      panelVisible: !!el('resultBody') && !el('resultBody').hidden,
      rotulo: (el('resultsLive') || {}).textContent || '',
      imprimirBloqueado: !!el('printBtn') && el('printBtn').disabled,
      veredictos: (el('verdicts') || {}).textContent || '',
      primeraCelda: (document.querySelector('#dataTable input, #dataTable select') || {}).value
    };
  });
}

/* Ctrl+P: el navegador emite beforeprint sin pasar por el boton, asi que es
   el camino que un bloqueo de boton NO cubre. Es justo el que hay que probar. */
function imprimirPorCtrlP(page) {
  return page.evaluate(function () {
    window.dispatchEvent(new Event('beforeprint'));
    var h = document.getElementById('printHeader');
    var a = document.getElementById('printAnnex');
    var out = { encabezado: h ? h.textContent : '', anexo: a ? a.textContent : '' };
    window.dispatchEvent(new Event('afterprint'));
    return out;
  });
}

var FRASE_VIEJA = 'Los calculos de este reporte salen exactamente de estos datos';
var FRASE_CADUCA = 'NO salen de estas mediciones';

async function calcularEjemplo(page, base, metodo) {
  await page.goto('about:blank');
  await page.goto(base + '#' + metodo);
  await page.waitForFunction(function () { return !!document.getElementById('demoBtn'); });
  await page.click('#demoBtn');
  await page.waitForFunction(function () {
    return !document.getElementById('calcBtn').disabled;
  }, null, { timeout: 15000 });
  await page.click('#calcBtn');
  await page.waitForFunction(function () {
    return !document.getElementById('resultBody').hidden;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(300);
}

/** Cambia la primera celda de captura al valor dado. Devuelve el valor previo. */
function editarPrimeraCelda(page, nuevo) {
  return page.evaluate(function (v) {
    var i = document.querySelector('#dataTable input, #dataTable select');
    var previo = i.value;
    i.value = v;
    i.dispatchEvent(new Event('input', { bubbles: true }));
    i.dispatchEvent(new Event('change', { bubbles: true }));
    return previo;
  }, nuevo);
}

(async function () {
  var srv = await serve();
  var base = 'http://127.0.0.1:' + srv.address().port + '/index.html';
  var browser = await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});
  var page = await browser.newPage();
  var errores = [];
  page.on('pageerror', function (e) { errores.push(String(e)); });
  page.on('dialog', function (d) { d.accept(); });

  /* ---------------------------------------------------------------------- */
  console.log('\n===== CRUZADO: calcular, editar una celda =====');
  await calcularEjemplo(page, base, 'cruzado');
  var fresco = await estado(page);
  check('recien calculado: sin banner', !fresco.bannerVisible);
  check('recien calculado: panel nitido', !fresco.cuerpoAtenuado);
  check('recien calculado: imprimir habilitado', !fresco.imprimirBloqueado);
  check('el rotulo ya no promete lo que la app no hace',
        fresco.rotulo.indexOf('actualizado al escribir') < 0 &&
        fresco.rotulo.indexOf('se recalcula al pulsar Calcular') >= 0, fresco.rotulo);

  var original = await editarPrimeraCelda(page, '99');
  await page.waitForTimeout(200);
  var caduco = await estado(page);
  check('editar una celda deja el resultado caduco (banner)', caduco.bannerVisible);
  check('y el panel se atenua', caduco.cuerpoAtenuado);
  check('y el panel NO se esconde: los numeros siguen a la vista, atenuados',
        caduco.panelVisible);
  check('y el rotulo lo dice',
        caduco.rotulo.indexOf('desactualizados') >= 0, caduco.rotulo);
  check('y "Imprimir / PDF" queda bloqueado', caduco.imprimirBloqueado);
  check('los veredictos siguen siendo los viejos (no se recalculo solo)',
        caduco.veredictos === fresco.veredictos);

  /* --- Ctrl+P: el camino que el boton no cubre ------------------------- */
  var impresion = await imprimirPorCtrlP(page);
  check('Ctrl+P no publica el resultado viejo',
        impresion.encabezado.indexOf('Study Variation') < 0, impresion.encabezado);
  check('Ctrl+P declara el reporte desactualizado',
        impresion.encabezado.indexOf('desactualizados') >= 0, impresion.encabezado);
  check('el anexo deja de afirmar que los calculos salen de estos datos',
        impresion.anexo.indexOf(FRASE_VIEJA) < 0, impresion.anexo.slice(-300));
  check('y avisa de lo contrario, donde el lector buscaria la frase',
        impresion.anexo.indexOf(FRASE_CADUCA) >= 0, impresion.anexo.slice(-300));
  check('el anexo si trae la medicion nueva (es del DOM actual)',
        impresion.anexo.indexOf('99') >= 0);

  /* --- Deshacer la edicion --------------------------------------------- */
  await editarPrimeraCelda(page, original);
  await page.waitForTimeout(200);
  var vuelto = await estado(page);
  check('deshacer la edicion quita la caducidad (se compara contenido, no eventos)',
        !vuelto.bannerVisible && !vuelto.imprimirBloqueado, vuelto.rotulo);

  /* --- Recalcular ------------------------------------------------------- */
  await editarPrimeraCelda(page, '99');
  await page.waitForTimeout(150);
  await page.click('#staleRecalcBtn');
  await page.waitForTimeout(400);
  var recalculado = await estado(page);
  check('el boton Recalcular del propio aviso funciona',
        !recalculado.bannerVisible && !recalculado.imprimirBloqueado);
  check('y el veredicto ya es otro: se recalculo de verdad',
        recalculado.veredictos !== fresco.veredictos);
  var tras = await imprimirPorCtrlP(page);
  check('tras recalcular, el reporte vuelve a publicar cifras',
        tras.encabezado.indexOf('Study Variation') >= 0);
  check('y el anexo recupera su frase',
        tras.anexo.indexOf(FRASE_VIEJA) >= 0);

  /* --- Los campos de opciones SI recalculan solos ------------------------ */
  await calcularEjemplo(page, base, 'cruzado');
  var antesOpt = await estado(page);
  await page.evaluate(function () {
    var s = document.getElementById('svMultiplier');
    s.value = '5.15';
    s.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(400);
  var trasOpt = await estado(page);
  check('cambiar el multiplicador no deja el panel caduco: recalcula solo',
        !trasOpt.bannerVisible && !trasOpt.imprimirBloqueado, trasOpt.rotulo);
  check('y el resultado efectivamente cambio',
        trasOpt.veredictos !== antesOpt.veredictos);

  /* ---------------------------------------------------------------------- */
  console.log('\n===== ANIDADO Y ATRIBUTOS =====');
  for (var i = 0; i < 2; i++) {
    var m = ['anidado', 'atributos'][i];
    await calcularEjemplo(page, base, m);
    var f = await estado(page);
    check(m + ': recien calculado, sin banner', !f.bannerVisible);
    var nuevoValor = m === 'atributos' ? (f.primeraCelda === 'Pasa' ? 'No pasa' : 'Pasa') : '99';
    await editarPrimeraCelda(page, nuevoValor);
    await page.waitForTimeout(200);
    var c = await estado(page);
    check(m + ': editar deja el resultado caduco', c.bannerVisible, 'rotulo: ' + c.rotulo);
    check(m + ': imprimir bloqueado', c.imprimirBloqueado);
    var imp = await imprimirPorCtrlP(page);
    check(m + ': Ctrl+P declara el reporte desactualizado',
          imp.encabezado.indexOf('desactualizados') >= 0, imp.encabezado);
    check(m + ': y el anexo no afirma la frase',
          imp.anexo.indexOf(FRASE_VIEJA) < 0);
    await page.click('#staleRecalcBtn');
    await page.waitForTimeout(400);
    var r = await estado(page);
    check(m + ': recalcular lo normaliza', !r.bannerVisible && !r.imprimirBloqueado);
  }

  check('ningun error de pagina en todo el recorrido', errores.length === 0, errores.join(' | '));

  await browser.close();
  srv.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' comprobaciones pasaron.');
  process.exitCode = fail ? 1 : 0;
})().catch(function (e) {
  console.error('\nLa prueba se cayo:', e && e.stack || e);
  process.exit(1);
});
