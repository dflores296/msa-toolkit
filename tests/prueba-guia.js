#!/usr/bin/env node
/* ============================================================================
 * prueba-guia.js - La guia paso a paso y el reinicio del scroll, en un
 * navegador de verdad.
 *
 * POR QUE EXISTE
 *
 * La guia (assets/js/guide.js) no calcula nada, pero si se equivoca de paso
 * manda al usuario al campo que no es, y eso no lo ve ninguna suite de motor.
 * Aqui se recorre como lo hace una persona.
 *
 * QUE COMPRUEBA
 *
 *   1. Primera visita: la guia empieza encendida, en el paso 1, con el numero
 *      de pasos de cada metodo.
 *   2. Generar la tabla lleva al paso de captura; cargar el ejemplo, al de
 *      Calcular; calcular, al dictamen. El destino de cada paso queda
 *      resaltado.
 *   3. Atras no rebota: volver a un paso cuyo hito ya se cumplio no empuja la
 *      guia otra vez hacia adelante.
 *   4. Cerrarla la apaga y se recuerda al recargar; el boton Guia la enciende.
 *   5. Cambiar de metodo reinicia la guia y devuelve al inicio el scroll de la
 *      captura y de los resultados.
 *   6. Ningun error de pagina.
 *
 * USO
 *   node tests/prueba-guia.js
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
             '.json': 'application/json', '.woff2': 'font/woff2' };

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

/** Lo que la guia muestra: rotulo, titulo y que elemento resalta. */
function guia(page) {
  return page.evaluate(function () {
    var c = document.getElementById('guideCard');
    var t = document.querySelector('.guide-target');
    return {
      visible: !!c && !c.hidden,
      rotulo: c && !c.hidden ? c.querySelector('.guide-k').textContent : '',
      titulo: c && !c.hidden ? c.querySelector('.guide-title').textContent : '',
      destino: t ? (t.id || t.className) : '',
      boton: document.getElementById('guideBtn').getAttribute('aria-pressed')
    };
  });
}

(async function () {
  var srv = await serve();
  var base = 'http://127.0.0.1:' + srv.address().port + '/';
  var browser = await chromium.launch();
  var ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  var page = await ctx.newPage();
  var errores = [];
  page.on('pageerror', function (e) { errores.push(String(e.message)); });
  page.on('dialog', function (d) { d.accept(); });   // el aviso de "se borran los datos"

  console.log('\n===== PRIMERA VISITA =====\n');
  await page.goto(base + '#cruzado', { waitUntil: 'networkidle' });
  var g = await guia(page);
  check('la guia empieza encendida', g.visible && g.boton === 'true', JSON.stringify(g));
  check('en el paso 1 de 10 del cruzado', /paso 1 de 10/i.test(g.rotulo) && /cruzado/i.test(g.rotulo), g.rotulo);
  check('resalta el nombre del estudio', g.destino === 'studyName', g.destino);
  var cuenta = await page.evaluate(function () {
    var html = document.documentElement, antes = html.getAttribute('data-method'), out = {};
    ['cruzado', 'anidado', 'atributos'].forEach(function (m) {
      html.setAttribute('data-method', m); out[m] = MSAGuide.steps();
    });
    html.setAttribute('data-method', antes);
    return out;
  });
  check('cruzado y anidado tienen 10 pasos; atributos 10, con los suyos',
    cuenta.cruzado.length === 10 && cuenta.anidado.length === 10 && cuenta.atributos.length === 10 &&
    cuenta.atributos.indexOf('categorias') >= 0 && cuenta.atributos.indexOf('estandar') >= 0 &&
    cuenta.atributos.indexOf('especificacion') < 0 && cuenta.cruzado.indexOf('estandar') < 0,
    JSON.stringify(cuenta));

  console.log('\n===== AVANCE POR HITOS =====\n');
  await page.click('#generateBtn');
  await page.waitForTimeout(300);
  g = await guia(page);
  check('generar la tabla lleva al paso de captura', g.titulo === 'Capturar', g.titulo);
  check('y resalta la rejilla de captura', /capture-scroll/.test(g.destino), g.destino);

  await page.click('[data-guide="prev"]');
  await page.fill('#studyName', 'Prueba de la guia');
  await page.waitForTimeout(150);
  g = await guia(page);
  check('Atras no rebota hacia adelante por un hito ya cumplido', g.titulo === 'Generar la tabla', g.titulo);

  await page.click('#demoBtn');
  await page.waitForTimeout(800);
  g = await guia(page);
  check('cargar el ejemplo lleva al paso de Calcular', g.titulo === 'Calcular' && g.destino === 'calcBtn',
    JSON.stringify(g));

  await page.click('#calcBtn');
  await page.waitForTimeout(800);
  g = await guia(page);
  check('calcular lleva al dictamen', g.titulo === 'Leer el dictamen' && g.destino === 'msaSummary',
    JSON.stringify(g));

  console.log('\n===== CAMBIO DE METODO =====\n');
  await page.evaluate(function () {
    document.querySelector('.col-capture').scrollTop = 600;
    document.querySelector('.results-panel').scrollTop = 300;
  });
  await page.click('.method-opt[data-method="atributos"]');
  await page.waitForTimeout(700);
  var scroll = await page.evaluate(function () {
    return [document.querySelector('.col-capture').scrollTop, document.querySelector('.results-panel').scrollTop];
  });
  check('la captura vuelve al inicio', scroll[0] === 0, scroll[0]);
  check('los resultados vuelven al inicio', scroll[1] === 0, scroll[1]);
  g = await guia(page);
  check('la guia reinicia en el paso 1 de atributos', /atributos/i.test(g.rotulo) && /paso 1 de/i.test(g.rotulo),
    g.rotulo);

  console.log('\n===== APAGAR Y ENCENDER =====\n');
  await page.click('.guide-close');
  g = await guia(page);
  var guardado = await page.evaluate(function () { return localStorage.getItem('msa-guide'); });
  check('la X apaga la guia y quita el resalte', !g.visible && !g.destino && g.boton === 'false', JSON.stringify(g));
  check('y lo recuerda', guardado === 'off', guardado);
  await page.reload({ waitUntil: 'networkidle' });
  g = await guia(page);
  check('al recargar sigue apagada', !g.visible, JSON.stringify(g));
  await page.click('#guideBtn');
  g = await guia(page);
  check('el boton Guia la vuelve a encender', g.visible && g.boton === 'true', JSON.stringify(g));

  console.log('\n===== ERRORES =====\n');
  check('ningun error de pagina en todo el recorrido', errores.length === 0, errores.join(' | '));

  await browser.close();
  srv.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' comprobaciones pasaron.');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
