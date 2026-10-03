#!/usr/bin/env node
/* ============================================================================
 * build-propuesta.js - Genera propuesta/index.html a partir de index.html.
 *
 * La vista previa del rediseno (docs/propuesta-rediseno.md) es la MISMA app,
 * con el mismo motor y el mismo HTML, mas la hoja assets/css/propuesta.css y
 * unos pocos cambios de marcado en la barra y en el estado vacio. Se genera en
 * vez de copiarse a mano para que no se despegue de la app cuando esta cambie:
 * cada sustitucion exige encontrar su texto exacto, y si index.html cambio y
 * ya no lo encuentra, el script falla y dice cual.
 *
 * USO
 *   node tools/build-propuesta.js           # escribe propuesta/index.html
 *   node tools/build-propuesta.js --check   # falla si el archivo no esta al dia
 * ==========================================================================*/
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var SRC = path.join(ROOT, 'index.html');
var OUT = path.join(ROOT, 'propuesta', 'index.html');

function replaceOnce(html, from, to, label) {
  var i = html.indexOf(from);
  if (i < 0) throw new Error('build-propuesta: no encontre "' + label + '" en index.html');
  if (html.indexOf(from, i + from.length) >= 0) throw new Error('build-propuesta: "' + label + '" aparece mas de una vez');
  return html.slice(0, i) + to + html.slice(i + from.length);
}

var SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true">' +
  '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
var MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
  '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/></svg>';

function build() {
  var html = fs.readFileSync(SRC, 'utf8');

  // Rutas: la vista previa vive un nivel abajo.
  html = html.replace(/(href|src)="assets\//g, '$1="../assets/');
  html = replaceOnce(html, 'href="tests/"', 'href="../tests/"', 'enlace a pruebas');
  html = replaceOnce(html, 'href="LICENSE"', 'href="../LICENSE"', 'enlace a licencia');

  // La capa de la propuesta va DESPUES de style.css, y la vista previa no se indexa.
  html = html.replace(/(<link rel="stylesheet" href="\.\.\/assets\/css\/style\.css\?v=([^"]+)">)/,
    function (m, link, v) {
      return link + '\n<link rel="stylesheet" href="../assets/css/propuesta.css?v=' + v + '">' +
        '\n<meta name="robots" content="noindex">';
    });
  if (html.indexOf('propuesta.css') < 0) throw new Error('build-propuesta: no encontre la hoja style.css');

  // Barra: aviso de vista previa + cabecera de publicacion (marca, y debajo
  // el estudio citado y su tamano), en vez de marca | insignia | resumen.
  html = replaceOnce(html,
    '<header class="toolbar">\n  <div class="toolbar-inner">\n    <div class="brand">MSA Toolkit</div>\n    <div class="vsep"></div>',
    '<header class="toolbar">\n' +
    '  <div class="preview-note">Vista previa de la propuesta de rediseno' +
    ' <a href="../">Ver version actual</a>' +
    ' <a href="https://github.com/dflores296/msa-toolkit/blob/main/docs/propuesta-rediseno.md">Leer la propuesta</a></div>\n' +
    '  <div class="toolbar-inner">\n' +
    '    <div class="masthead">\n' +
    '      <div class="brand">MSA <em>Toolkit</em></div>\n' +
    '      <div class="dateline"><div class="badge" id="methodBadge">Gage R&amp;R &middot; ANOVA cruzado</div>' +
    '<span class="sep" aria-hidden="true">&middot;</span>' +
    '<div class="study-summary"><strong id="studyLabel"></strong><span id="captureCount"></span></div></div>\n' +
    '    </div>\n' +
    '    <div class="vsep"></div>',
    'marca de la barra');
  html = replaceOnce(html,
    '    <div class="badge" id="methodBadge">Gage R&amp;R &middot; ANOVA cruzado</div>\n' +
    '    <div class="vsep"></div>\n' +
    '    <div class="study-summary"><strong id="studyLabel"></strong><span id="captureCount"></span></div>\n',
    '', 'insignia y resumen del estudio');

  // Acciones de archivo como botones de texto; tema con iconos.
  html = replaceOnce(html, '<button id="demoBtn">', '<button id="demoBtn" class="quiet">', 'boton Ejemplo AIAG');
  html = replaceOnce(html, '<button id="importBtn">', '<button id="importBtn" class="quiet">', 'boton Importar');
  html = replaceOnce(html, '<button id="exportCsvBtn">', '<button id="exportCsvBtn" class="quiet">', 'boton Exportar');
  html = replaceOnce(html,
    '<button type="button" class="theme-opt" data-theme-choice="light">Claro</button>',
    '<button type="button" class="theme-opt" data-theme-choice="light" title="Tema claro">' + SUN + '<span class="sr-only">Claro</span></button>',
    'tema claro');
  html = replaceOnce(html,
    '<button type="button" class="theme-opt" data-theme-choice="dark">Oscuro</button>',
    '<button type="button" class="theme-opt" data-theme-choice="dark" title="Tema oscuro">' + MOON + '<span class="sr-only">Oscuro</span></button>',
    'tema oscuro');
  // Orden: archivo (texto) | tema | Recalcular + Imprimir. Las dos acciones
  // que deciden van al final y juntas, el par relleno + fantasma.
  var theme = html.match(/    <div class="theme-toggle" id="themeToggle"[\s\S]*?\n    <\/div>\n/);
  if (!theme) throw new Error('build-propuesta: no encontre el interruptor de tema');
  html = replaceOnce(html, theme[0], '', 'interruptor de tema');
  html = replaceOnce(html, '    <button id="recalcBtn" class="ghost">',
    '    <div class="vsep"></div>\n' + theme[0] + '    <button id="recalcBtn" class="ghost">', 'boton Recalcular');

  // Estado vacio: el unico durazno de la pantalla. Conserva id y clase, que
  // son las que usa la hoja para ocultarlo cuando hay resultados.
  html = html.replace(
    /<p class="hint results-placeholder" id="resultsPlaceholder">[\s\S]*?<\/p>/,
    '<div class="results-placeholder empty-state" id="resultsPlaceholder">\n' +
    '        <p class="empty-k">Analisis de sistemas de medicion</p>\n' +
    '        <h2 class="empty-h">Antes de confiar en una medicion, mide <em>al que mide</em>.</h2>\n' +
    '        <p class="empty-p">Completa la captura y presiona <strong>Calcular</strong> para ver aqui el dictamen, ' +
    'las tablas y las graficas. O empieza con el estudio publicado del manual AIAG.</p>\n' +
    '        <div class="empty-actions">\n' +
    '          <button type="button" class="primary" data-proxy="demoBtn">Cargar ejemplo AIAG</button>\n' +
    '          <button type="button" class="ghost" data-proxy="importBtn">Importar CSV</button>\n' +
    '        </div>\n' +
    '      </div>');
  if (html.indexOf('empty-state') < 0) throw new Error('build-propuesta: no encontre el estado vacio');

  html = replaceOnce(html, '</body>',
    '<script>\n' +
    '/* Vista previa: los botones del estado vacio delegan en los de la barra. */\n' +
    '[].slice.call(document.querySelectorAll("[data-proxy]")).forEach(function (b) {\n' +
    '  b.addEventListener("click", function () { document.getElementById(b.dataset.proxy).click(); });\n' +
    '});\n' +
    '</script>\n</body>', 'cierre del body');

  // El aviso va DESPUES del doctype: un comentario antes lo manda a modo quirks.
  return replaceOnce(html, '<!DOCTYPE html>\n',
    '<!DOCTYPE html>\n<!-- GENERADO por tools/build-propuesta.js a partir de index.html. No editar a mano. -->\n', 'doctype');
}

var out = build();
if (process.argv.indexOf('--check') >= 0) {
  var cur = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : '';
  if (cur !== out) {
    console.error('propuesta/index.html no esta al dia: corre node tools/build-propuesta.js');
    process.exit(1);
  }
  console.log('propuesta/index.html al dia.');
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, out);
  console.log('Escrito ' + path.relative(ROOT, OUT));
}
