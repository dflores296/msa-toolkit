#!/usr/bin/env node
/* ============================================================================
 * prueba-guia.js - El asistente paso a paso y el reinicio del scroll, en un
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
 *   1. La guia empieza encendida, en el paso 1, con el numero de pasos de
 *      cada metodo.
 *   2. Generar la tabla lleva al paso de captura; cargar el ejemplo, al de
 *      Calcular; calcular, al dictamen. Un control se senala con el anillo
 *      (.guide-target); una seccion, con el fondo tenue (.guide-area).
 *   3. Atras no rebota: volver a un paso cuyo hito ya se cumplio no empuja la
 *      guia otra vez hacia adelante.
 *   4. Cerrarla la apaga; al recargar vuelve a encenderse (no se recuerda);
 *      el boton Asistente la enciende y la apaga.
 *   5. Enter va casilla por casilla dentro del paso y, en la ultima, pasa al
 *      paso siguiente solo si esta completo (un tamano invalido, nombres
 *      repetidos o celdas vacias lo detienen, y la tarjeta dice que falta);
 *      despues de los campos de la configuracion va al boton Generar tabla,
 *      que otro Enter pulsa. El boton dice Generar en un estudio nuevo y
 *      Regenerar con la tabla hecha.
 *   6. Cambiar de metodo reinicia la guia y devuelve al inicio el scroll de la
 *      captura y de los resultados.
 *   7. Ningun error de pagina.
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
    var anillos = [].slice.call(document.querySelectorAll('.guide-target'));
    var areas = [].slice.call(document.querySelectorAll('.guide-area'));
    return {
      visible: !!c && !c.hidden,
      rotulo: c && !c.hidden ? c.querySelector('.guide-k').textContent : '',
      titulo: c && !c.hidden ? c.querySelector('.guide-title').textContent : '',
      destino: anillos.map(function (t) { return t.id; }).join(','),
      area: areas.map(function (t) { return t.className; }).join(','),
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
  check('el asistente empieza encendido', g.visible && g.boton === 'true', JSON.stringify(g));
  check('en el paso 1 de 10 del cruzado', /asistente/i.test(g.rotulo) && /paso 1 de 10/i.test(g.rotulo) &&
    /cruzado/i.test(g.rotulo), g.rotulo);
  check('resalta el nombre del estudio con el anillo', g.destino === 'studyName', g.destino);
  await page.click('[data-guide="next"]');
  g = await guia(page);
  check('el tamano senala los tres campos, no la fila entera',
    g.destino === 'numOperators,numParts,numReplicates' && !g.area, JSON.stringify(g));
  await page.click('[data-guide="next"]');
  g = await guia(page);
  check('los nombres, una seccion, van con fondo tenue y sin anillo',
    /namelist-cols/.test(g.area) && !g.destino, JSON.stringify(g));
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
  check('y marca la rejilla de captura con fondo tenue', /capture-scroll/.test(g.area) && !g.destino,
    JSON.stringify(g));

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
  var dictamen = await page.evaluate(function () {
    var r = document.getElementById('msaSummary').getBoundingClientRect();
    return r.top < innerHeight && r.bottom > 0;
  });
  check('calcular lleva al dictamen, a la vista y sin marca encima',
    g.titulo === 'Leer el dictamen' && dictamen && !g.destino && !g.area, JSON.stringify(g));

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
  check('la X apaga el asistente y quita las marcas', !g.visible && !g.destino && !g.area && g.boton === 'false',
    JSON.stringify(g));
  check('sin guardar nada en el navegador', guardado === null, guardado);
  await page.click('#guideBtn');
  g = await guia(page);
  check('el boton Asistente lo vuelve a encender', g.visible && g.boton === 'true', JSON.stringify(g));
  await page.click('#guideBtn');
  g = await guia(page);
  check('y lo apaga', !g.visible && g.boton === 'false', JSON.stringify(g));
  await page.reload({ waitUntil: 'networkidle' });
  g = await guia(page);
  check('al recargar vuelve a encenderse', g.visible && g.boton === 'true', JSON.stringify(g));

  console.log('\n===== TARJETA CENTRADA =====\n');
  var pos = await page.evaluate(function () {
    var r = document.getElementById('guideCard').getBoundingClientRect();
    return { centro: Math.round(r.left + r.width / 2), mitad: Math.round(innerWidth / 2), pie: Math.round(innerHeight - r.bottom) };
  });
  check('la tarjeta va centrada en la pagina, al pie', Math.abs(pos.centro - pos.mitad) <= 1 && pos.pie >= 8 && pos.pie <= 24,
    JSON.stringify(pos));

  console.log('\n===== ENTER, CASILLA POR CASILLA =====\n');
  await page.goto('about:blank');
  await page.goto(base + '#cruzado', { waitUntil: 'networkidle' });
  var foco = function () {
    return page.evaluate(function () { var a = document.activeElement; return a ? (a.id || a.getAttribute('data-idx') || a.tagName) : ''; });
  };
  var focoValor = function () {
    return page.evaluate(function () { var a = document.activeElement; return a && 'value' in a ? a.value : ''; });
  };
  var pie = function () {
    return page.evaluate(function () { return (document.getElementById('guideHint') || {}).textContent || ''; });
  };
  check('en un estudio nuevo el boton dice Generar tabla',
    (await page.textContent('#generateBtn')).trim() === 'Generar tabla', await page.textContent('#generateBtn'));
  check('el pie avisa que Enter sigue', /Enter para seguir/.test(await pie()), await pie());
  await page.focus('#studyName');
  await page.keyboard.press('Enter');
  g = await guia(page);
  check('Enter en el nombre avanza al tamano, en su primera casilla',
    g.titulo === 'Tamano del estudio' && (await foco()) === 'numOperators', g.titulo + ' / ' + await foco());
  await page.keyboard.press('Enter');
  check('Enter pasa de Operadores a Piezas sin cambiar de paso',
    (await foco()) === 'numParts' && (await guia(page)).titulo === 'Tamano del estudio', await foco());
  await page.keyboard.type('1');               // la casilla queda seleccionada: se sobrescribe
  await page.keyboard.press('Enter');
  check('y de Piezas a Replicas', (await foco()) === 'numReplicates', await foco());
  await page.keyboard.press('Enter');
  g = await guia(page);
  check('en la ultima casilla, con el tamano invalido, no avanza y dice que falta',
    g.titulo === 'Tamano del estudio' && /Para seguir/.test(await pie()), g.titulo + ' / ' + await pie());
  await page.fill('#numParts', '10');
  await page.focus('#numReplicates');
  await page.keyboard.press('Enter');
  g = await guia(page);
  check('corregido, Enter en la ultima casilla avanza a los nombres', g.titulo === 'Nombres', g.titulo);
  check('con el foco en el primer nombre de operador', (await focoValor()) === 'Operador 1', await focoValor());

  var nombres = await page.$$eval('#operatorNames input, #partNames input', function (l) { return l.length; });
  var segundo = await page.inputValue('#operatorNames input >> nth=1');
  await page.fill('#operatorNames input >> nth=1', 'Operador 1');
  await page.focus('#operatorNames input >> nth=0');
  for (var k = 0; k < nombres - 1; k++) await page.keyboard.press('Enter');
  check('Enter recorre los ' + nombres + ' nombres, de operadores a piezas', (await focoValor()) === 'Pieza 10',
    await focoValor());
  await page.keyboard.press('Enter');
  g = await guia(page);
  check('con un operador repetido, el ultimo Enter no avanza', g.titulo === 'Nombres' && /repetidos/.test(await pie()),
    g.titulo + ' / ' + await pie());
  await page.fill('#operatorNames input >> nth=1', segundo);
  await page.focus('#partNames input >> nth=9');
  await page.keyboard.press('Enter');
  g = await guia(page);
  check('sin repetidos, despues de los campos va al boton', g.titulo === 'Generar la tabla' && (await foco()) === 'generateBtn',
    g.titulo + ' / ' + await foco());
  await page.keyboard.press('Enter');          // el Enter del boton: lo pulsa
  await page.waitForTimeout(300);
  g = await guia(page);
  check('otro Enter genera la tabla y el asistente pasa a capturar', g.titulo === 'Capturar', g.titulo);
  check('ya generada, el boton dice Regenerar tabla',
    (await page.textContent('#generateBtn')).trim() === 'Regenerar tabla', await page.textContent('#generateBtn'));
  check('con el foco en la primera celda', await page.evaluate(function () {
    return document.activeElement === document.querySelector('#dataTable input');
  }));
  await page.keyboard.type('0.5');
  await page.keyboard.press('Enter');
  check('Enter pasa a la celda siguiente', await page.evaluate(function () {
    return document.activeElement === document.querySelectorAll('#dataTable input')[1];
  }));
  await page.focus('#dataTable input >> nth=-1');
  await page.keyboard.press('Enter');
  g = await guia(page);
  check('en la ultima celda, con la captura incompleta, no avanza y vuelve a la primera vacia',
    g.titulo === 'Capturar' && /faltan \d+ celda/.test(await pie()) && await page.evaluate(function () {
      return document.activeElement === document.querySelectorAll('#dataTable input')[1];
    }), g.titulo + ' / ' + await pie());
  await page.click('#resetBtn');
  check('al reiniciar el estudio el boton vuelve a decir Generar tabla',
    (await page.textContent('#generateBtn')).trim() === 'Generar tabla', await page.textContent('#generateBtn'));

  console.log('\n===== ERRORES =====\n');
  check('ningun error de pagina en todo el recorrido', errores.length === 0, errores.join(' | '));

  await browser.close();
  srv.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' comprobaciones pasaron.');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
