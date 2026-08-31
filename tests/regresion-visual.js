#!/usr/bin/env node
/* ============================================================================
 * regresion-visual.js - Comprueba que un cambio no movio un metodo.
 *
 * POR QUE EXISTE
 *
 * Cruzado y anidado comparten el mismo HTML: los mismos pasos, las mismas
 * tarjetas, las mismas pestanas, el mismo reporte impreso. Es lo que permite
 * que arreglar el diseno una vez lo arregle para todos. El precio es que tocar
 * la pantalla toca los dos metodos, y una suite de motor no lo ve: el motor
 * puede seguir dando los mismos numeros mientras la pantalla los muestra mal,
 * se come una grafica o rompe el reporte.
 *
 * Esta herramienta corre EL MISMO estudio en dos versiones del repo -la de
 * ahora y la de una revision de git- y compara todo lo que la pagina publica:
 * veredictos, barras, avisos, las tres tablas, las notas, el CSV exportado,
 * cada grafica (imagen por imagen) y el reporte impreso completo, pixel a
 * pixel. Si algo cambio, lo dice y muestra los dos valores.
 *
 * USO
 *   node tests/regresion-visual.js <revision-base> [metodo]
 *
 *   node tests/regresion-visual.js HEAD~1              # cruzado contra el commit anterior
 *   node tests/regresion-visual.js main anidado        # anidado contra main
 *
 * Un cambio a proposito hace que falle: eso es lo correcto. Se lee la
 * diferencia, se confirma que es la que se buscaba y se sigue.
 *
 * DEPENDENCIA
 *
 * Necesita Playwright y un Chromium, que NO son dependencias del proyecto: la
 * aplicacion y la suite de motor (tests/run-node.js) siguen corriendo sin
 * instalar nada. Esta es una herramienta de escritorio, aparte y opcional:
 *
 *   npm i playwright && npx playwright install chromium
 *
 * Si Chromium ya vive en otro lado, se le indica con PLAYWRIGHT_CHROMIUM.
 * ==========================================================================*/
'use strict';

var http = require('http'), fs = require('fs'), path = require('path');
var os = require('os'), crypto = require('crypto'), cp = require('child_process');

var REPO = path.resolve(__dirname, '..');
var BASE_REV = process.argv[2];
var METHOD = process.argv[3] || 'cruzado';

if (!BASE_REV) {
  console.error('Uso: node tests/regresion-visual.js <revision-base> [cruzado|anidado]');
  process.exit(2);
}

var chromium;
try { chromium = require('playwright').chromium; }
catch (e) {
  console.error('Falta Playwright, que no es dependencia del proyecto.\n' +
    '  npm i playwright && npx playwright install chromium\n' +
    'La suite de motor (node tests/run-node.js) no lo necesita.');
  process.exit(2);
}

var MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
             '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };

function serve(root, port) {
  var s = http.createServer(function (q, r) {
    var p = decodeURIComponent(q.url.split('?')[0]);
    if (p.slice(-1) === '/') p += 'index.html';
    var f = path.join(root, p);
    if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'text/plain' });
    r.end(fs.readFileSync(f));
  });
  return new Promise(function (res) { s.listen(port, function () { res(s); }); });
}

/* Un estudio con parametros no triviales, para que el recorrido toque todas
   las ramas que el metodo tenga: especificacion, sigma historica, y en el
   cruzado ademas alfa, interaccion forzada y denominador de F. */
async function capture(browser, port, tag, outDir) {
  var page = await browser.newPage({ viewport: { width: 1500, height: 1050 } });
  var errors = [];
  page.on('pageerror', function (e) { errors.push(String(e.message)); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });

  await page.goto('http://127.0.0.1:' + port + '/#' + METHOD, { waitUntil: 'networkidle' });
  await page.click('#demoBtn');
  await page.waitForTimeout(400);
  await page.fill('#studyName', 'Regresion ' + METHOD);
  await page.fill('#historicalSigma', '1.2');
  if (await page.isVisible('#alpha')) {
    await page.selectOption('#alpha', '0.05');
    await page.selectOption('#interactionMode', 'include');
    await page.selectOption('#fDenominator', 'repeatability');
  }
  await page.selectOption('#svMultiplier', '5.15');
  await page.click('#calcBtn');
  await page.waitForTimeout(600);

  /* Se compara lo que el usuario VE, no lo que hay en el DOM: los bloques de
     los otros metodos estan ahi, ocultos, y textContent los devolveria igual.
     innerText si respeta el CSS, pero solo si el elemento se esta pintando:
     sobre uno oculto vuelve a comportarse como textContent. Por eso cada panel
     se lee con su pestana abierta. */
  var txt = async function (sel) {
    var el = await page.$(sel);
    if (!el) return '(no existe)';
    return (await el.innerText()).replace(/\s+/g, ' ').trim();
  };
  var panel = async function (tab) {
    await page.click('.tab-btn[data-tab="' + tab + '"]');
    await page.waitForTimeout(150);
    return txt('[data-panel="' + tab + '"]');
  };

  var out = {
    veredictos: await page.$$eval('.verdict', function (els) {
      return els.map(function (x) {
        return [x.querySelector('.k').textContent, x.querySelector('.v').textContent,
                (x.querySelector('.t') || {}).textContent || ''].join(' | ');
      });
    }),
    /* La linea del intervalo dentro de cada tarjeta, y el bloque de resumen del
       %GRR entero -intervalo, nombre del metodo y advertencia de cruce-.
       Estaban fuera de la comparacion: `veredictos` solo mira .k, .v y .t, asi
       que un cambio de metodo del intervalo pasaba sin que esta herramienta
       dijera nada. Se vio al medir F-07, donde el reporte impreso salia
       DISTINTO y la pantalla decia igual aunque tambien habia cambiado. */
    intervalosTarjeta: await page.$$eval('.verdict .ci', function (els) {
      return els.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); });
    }),
    barrasEvaluacion: await page.$$eval('.eval-row', function (els) {
      return els.map(function (x) { return x.textContent.replace(/\s+/g, ' ').trim(); });
    }),
    avisos: await txt('#resultMsg'),
    bloqueGrr: await txt('#grrSummary'),
    conteoCaptura: await txt('#captureCount'),
    // El panel entero, no cada id: asi la comparacion sobrevive a que un
    // parrafo pase de estar escrito en el HTML a llenarse desde el JS.
    panelComponentes: await panel('componentes'),
    panelAnova: await panel('anova'),
    panelNotas: await panel('notas'),
    tituloPestana: await page.title(),
    erroresDeConsola: errors
  };

  out.csv = await page.evaluate(function () {
    var captured = null, orig = URL.createObjectURL;
    URL.createObjectURL = function (b) { captured = b; return orig.call(URL, b); };
    document.getElementById('exportCsvBtn').click();
    URL.createObjectURL = orig;
    return captured.text();
  });

  await page.click('.tab-btn[data-tab="graficas"]');
  await page.waitForTimeout(700);
  var boxes = await page.$$('.chart-box');
  out.graficas = [];
  for (var i = 0; i < boxes.length; i++) {
    if (await boxes[i].evaluate(function (e) { return e.hidden; })) continue;
    var name = await boxes[i].$eval('h3', function (e) { return e.textContent; });
    var buf = await boxes[i].screenshot({ path: path.join(outDir, tag + '-grafica-' + i + '.png') });
    out.graficas.push(name + ' :: ' + crypto.createHash('sha256').update(buf).digest('hex').slice(0, 16));
  }

  // Reporte impreso: se prepara con el mismo boton de la barra y se mide con
  // la hoja de impresion puesta, que es como sale en papel.
  await page.evaluate(function () { document.getElementById('printBtn').click(); });
  await page.waitForTimeout(800);
  // El encabezado y el anexo del reporte son .print-only: en pantalla no se
  // pintan, asi que se leen ya con la hoja de impresion puesta.
  await page.emulateMedia({ media: 'print' });
  await page.waitForTimeout(200);
  out.encabezadoImpreso = await txt('#printHeader');
  out.anexoImpreso = await txt('#printAnnex');
  await page.setViewportSize({ width: 1020, height: 1320 });
  await page.waitForTimeout(600);
  var report = await page.screenshot({ path: path.join(outDir, tag + '-reporte.png'), fullPage: true });
  out.reporteImpreso = crypto.createHash('sha256').update(report).digest('hex');

  await page.close();
  return out;
}

(async function () {
  var outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'msa-regresion-'));
  var baseTree = path.join(outDir, 'base');
  var sha;
  try {
    sha = cp.execSync('git rev-parse --short ' + JSON.stringify(BASE_REV),
      { cwd: REPO, encoding: 'utf8' }).trim();
    cp.execSync('git worktree add --detach ' + JSON.stringify(baseTree) + ' ' + JSON.stringify(BASE_REV),
      { cwd: REPO, stdio: 'pipe' });
  } catch (e) {
    console.error('No se pudo preparar la revision base "' + BASE_REV + '": ' +
      String(e.stderr || e.message).trim());
    process.exit(2);
  }

  var s1, s2, browser;
  try {
    s1 = await serve(baseTree, 8801);
    s2 = await serve(REPO, 8802);
    browser = await chromium.launch(
      process.env.PLAYWRIGHT_CHROMIUM ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM } : {});

    console.log('Metodo: ' + METHOD);
    console.log('Base:   ' + BASE_REV + ' (' + sha + ')');
    console.log('Ahora:  arbol de trabajo\n');

    var base = await capture(browser, 8801, 'base', outDir);
    var now = await capture(browser, 8802, 'ahora', outDir);

    var diffs = 0;
    Object.keys(base).forEach(function (k) {
      var a = JSON.stringify(base[k]), b = JSON.stringify(now[k]);
      if (a === b) { console.log('  igual     ' + k); return; }
      diffs++;
      console.log('  DISTINTO  ' + k);
      console.log('     base:  ' + a.slice(0, 700));
      console.log('     ahora: ' + b.slice(0, 700));
    });

    console.log(diffs
      ? '\n' + diffs + ' diferencia(s) en ' + METHOD + '. Imagenes en ' + outDir +
        '\nSi el cambio era a proposito, confirma que la diferencia es la que buscabas.'
      : '\nSin diferencias: ' + METHOD + ' se ve y se calcula igual que en ' + sha + '.');
    process.exitCode = diffs ? 1 : 0;
  } finally {
    if (browser) await browser.close();
    if (s1) s1.close();
    if (s2) s2.close();
    try { cp.execSync('git worktree remove --force ' + JSON.stringify(baseTree), { cwd: REPO, stdio: 'pipe' }); }
    catch (e) { console.error('Quedo el arbol temporal en ' + baseTree); }
  }
})();
