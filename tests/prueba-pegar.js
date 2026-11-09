#!/usr/bin/env node
/* ============================================================================
 * prueba-pegar.js - Pegar desde Excel, en un navegador de verdad.
 *
 * POR QUE EXISTE
 *
 * tests-paste.js prueba la LECTURA del texto pegado (assets/js/paste.js),
 * pero lo que el usuario veia fallar era la pantalla: pegar una columna de
 * nombres en las casillas de operadores o de piezas dejaba todos los nombres
 * en la primera casilla. Aqui se pega como lo hace una persona: un evento
 * paste con el texto tal como lo deja Excel (tabuladores, saltos de linea, el
 * salto final).
 *
 * QUE COMPRUEBA
 *
 *   1. Una columna de nombres de operador se reparte desde la casilla donde
 *      se pega; pegar mas piezas de las que hay hace crecer la lista.
 *   2. La columna de una tabla larga (un nombre por renglon de medicion) se
 *      toma una vez por nombre, sin el encabezado, y se avisa.
 *   3. En el anidado las piezas se reparten por los grupos de cada operador.
 *   4. En la tabla de captura, el bloque completo con nombres (Operador |
 *      Pieza | Replica 1 | Replica 2) arma el estudio con esos nombres y esas
 *      mediciones, y el calculo da lo mismo que importar el archivo.
 *   5. Un pedazo del bloque (un solo operador, con sus columnas de nombres)
 *      se pega por posicion SIN meter el texto de los nombres en las celdas.
 *   6. Pegar solo numeros sigue funcionando igual que antes.
 *   7. Ningun error de pagina.
 *
 * USO
 *   node tests/prueba-pegar.js
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

/* El ejemplo de clase de 2 operadores x 14 piezas x 2 replicas. */
var R1 = [[746.43, 746.41], [746.41, 746.38], [746.49, 746.4], [746.03, 746.04], [746.16, 746.04],
  [746.06, 746.14], [746.17, 746.17], [746.08, 746.2], [746.29, 746.19], [746.36, 746.44],
  [746.5, 746.48], [745.61, 745.67], [746.35, 746.23], [746.28, 746.22]];
var R2 = [[746.31, 746.32], [745.71, 745.6], [745.98, 745.94], [745.8, 745.86], [745.64, 745.64],
  [746.16, 745.86], [745.83, 745.74], [746.05, 746.08], [746.42, 746.45], [746.05, 746.04],
  [746.03, 746.06], [745.55, 745.56], [745.88, 746.29], [746.35, 746]];

function block(ops) {
  var lines = ['Operador\tPieza\tReplica 1\tReplica 2'];
  ops.forEach(function (o) {
    for (var p = 0; p < 14; p++) {
      lines.push(['Operador ' + (o + 1), 'Pieza ' + (p + 1), R1[p][o], R2[p][o]].join('\t'));
    }
  });
  return lines.join('\r\n') + '\r\n';
}

/** Pega `text` en el elemento `sel` como lo haria Ctrl+V desde Excel. */
async function paste(page, sel, text) {
  await page.evaluate(function (a) {
    /* Enfocar puede disparar el `change` pendiente de un campo de tamano, que
       vuelve a pintar las casillas: se busca el elemento DESPUES de enfocar,
       como le pasa a una persona que hace clic y luego pega. */
    document.querySelector(a.sel).focus();
    var el = document.querySelector(a.sel);
    var dt = new DataTransfer();
    dt.setData('text/plain', a.text);
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, { sel: sel, text: text });
  await page.waitForTimeout(150);
}

function values(page, sel) {
  return page.$$eval(sel, function (els) { return els.map(function (e) { return e.value; }); });
}

(async function main() {
  var srv = await serve();
  var base = 'http://127.0.0.1:' + srv.address().port + '/';
  var browser = await chromium.launch();
  var page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  var errors = [], dialogs = [];
  page.on('pageerror', function (e) { errors.push(e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push(m.text()); });
  page.on('dialog', function (d) { dialogs.push(d.message()); d.accept(); });

  console.log('Nombres (paso 1)');
  await page.goto(base + '#cruzado', { waitUntil: 'networkidle' });

  await paste(page, '#operatorNames input:nth-child(1)', 'Ana\r\nBeto\r\nCruz\r\n');
  check('operadores: una columna se reparte, uno por casilla',
    JSON.stringify(await values(page, '#operatorNames input')) === '["Ana","Beto","Cruz"]',
    JSON.stringify(await values(page, '#operatorNames input')));

  await paste(page, '#operatorNames input:nth-child(2)', 'Diana\nElena\n');
  var ops = await values(page, '#operatorNames input');
  check('operadores: se pega desde la casilla elegida, y la lista crece si no cabe',
    JSON.stringify(ops) === '["Ana","Diana","Elena"]' && await page.inputValue('#numOperators') === '3',
    JSON.stringify(ops));

  var parts = [];
  for (var i = 1; i <= 14; i++) parts.push('P-' + i);
  await paste(page, '#partNames input:nth-child(1)', parts.join('\n') + '\n');
  var got = await values(page, '#partNames input');
  check('piezas: 14 nombres en un estudio de 10 dejan 14 piezas',
    await page.inputValue('#numParts') === '14' && JSON.stringify(got) === JSON.stringify(parts),
    (await page.inputValue('#numParts')) + ' ' + JSON.stringify(got));

  var col = ['Operador'];
  for (i = 0; i < 14; i++) col.push('Operador 1');
  for (i = 0; i < 14; i++) col.push('Operador 2');
  await paste(page, '#operatorNames input:nth-child(1)', col.join('\n') + '\n');
  ops = await values(page, '#operatorNames input');
  var msg = await page.innerText('#configMsg');
  check('tabla larga: cada operador una vez, sin el encabezado',
    ops[0] === 'Operador 1' && ops[1] === 'Operador 2', JSON.stringify(ops));
  check('tabla larga: se avisa del encabezado y de los repetidos',
    /Se descarto "Operador"/.test(msg) && /26 nombre\(s\) de operador repetidos/.test(msg), msg);

  console.log('Nombres en el anidado');
  await page.goto(base + '#anidado', { waitUntil: 'networkidle' });
  await page.fill('#numOperators', '2'); await page.dispatchEvent('#numOperators', 'change');
  await page.fill('#numParts', '3'); await page.dispatchEvent('#numParts', 'change');
  await paste(page, '#partNames input', '1\n2\n3\n1\n2\n3\n');
  got = await values(page, '#partNames input');
  check('anidado: las piezas se reparten por los grupos y los repetidos se conservan',
    JSON.stringify(got) === '["1","2","3","1","2","3"]', JSON.stringify(got));
  await paste(page, '#partNames input', 'a\nb\nc\nd\ne\nf\ng\n');
  msg = await page.innerText('#configMsg');
  check('anidado: lo que no cabe se avisa y no se inventa un grupo',
    await page.inputValue('#numParts') === '3' && /Quedaron fuera: g/.test(msg), msg);

  console.log('Tabla de captura (paso 2)');
  await page.goto(base + '#cruzado', { waitUntil: 'networkidle' });
  await page.evaluate(function () { if (window.MSAGuide) window.MSAGuide.disable(); });
  await page.click('#generateBtn');
  await paste(page, '#dataTable input', block([0, 1]));
  var size = [await page.inputValue('#numOperators'), await page.inputValue('#numParts'),
              await page.inputValue('#numReplicates')];
  check('bloque con nombres: el estudio toma su tamano (2 x 14 x 2)',
    size.join('x') === '2x14x2', size.join('x'));
  var heads = await page.$$eval('#dataTable tbody th.col-op', function (e) { return e.map(function (x) { return x.textContent; }); });
  var cell = await page.inputValue('#dataTable input[data-op="Operador 2"][data-part="Pieza 14"][data-rep="1"]');
  check('bloque con nombres: los nombres y las mediciones quedan en su celda',
    JSON.stringify(heads) === '["Operador 1","Operador 2"]' && cell === '746',
    JSON.stringify(heads) + ' ' + cell);
  check('bloque con nombres: se dice de donde salio la tabla',
    /nombres del bloque pegado: 2 operadores, 14 piezas y 2 replicas/.test(await page.innerText('#configMsg')));

  await page.fill('#lsl', '745.5'); await page.fill('#usl', '746.5');
  await page.click('#calcBtn');
  await page.waitForTimeout(500);
  var body = await page.innerText('#resultBody');
  check('bloque con nombres: el calculo da lo del estudio original (76.87 %, 128.05 %)',
    /76\.87 %/.test(body) && /128\.05 %/.test(body), body.slice(0, 200));

  // Un pedazo: las piezas de un solo operador con sus nombres. No rehace nada.
  await page.click('#clearDataBtn');          // pregunta antes de borrar: esa si se espera
  await page.waitForTimeout(150);
  dialogs = [];
  var oneOp = block([1]).split('\r\n').slice(1, 4).join('\r\n') + '\r\n';
  await paste(page, '#dataTable input[data-op="Operador 2"][data-part="Pieza 1"][data-rep="0"]', oneOp);
  var v = await values(page, '#dataTable input[data-op="Operador 2"]');
  check('pedazo con nombres: solo los numeros, en su lugar',
    v.slice(0, 6).join(',') === '746.41,746.32,746.38,745.6,746.4,745.94' &&
    await page.inputValue('#numOperators') === '2', v.slice(0, 6).join(','));
  var texto = await page.$$eval('#dataTable input', function (els) {
    return els.filter(function (e) { return /[A-Za-z]/.test(e.value); }).length;
  });
  check('pedazo con nombres: ningun nombre acabo en una celda de medicion', texto === 0, texto);

  // Solo numeros, como antes.
  await paste(page, '#dataTable input[data-op="Operador 1"][data-part="Pieza 1"][data-rep="0"]',
    '1.5\t1.6\n2.5\t2.6\n');
  v = await values(page, '#dataTable input[data-op="Operador 1"]');
  check('solo numeros: se pega por posicion igual que antes',
    v.slice(0, 4).join(',') === '1.5,1.6,2.5,2.6', v.slice(0, 4).join(','));

  check('nadie pregunto nada por el camino', dialogs.length === 0, dialogs.join(' // '));
  check('ningun error de pagina', errors.length === 0, errors.join(' // '));

  await browser.close();
  srv.close();
  console.log('\n' + pass + '/' + (pass + fail) + ' comprobaciones pasaron.');
  process.exit(fail ? 1 : 0);
})().catch(function (e) { console.error(e); process.exit(1); });
