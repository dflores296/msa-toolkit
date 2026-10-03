/* ============================================================================
 * guide.js - Asistente paso a paso, uno por metodo.
 *
 * Una tarjeta centrada al pie de la pagina dice el paso actual y senala lo que
 * le toca. Un campo o un boton lleva el mismo anillo que el boton Calcular;
 * una seccion entera (la rejilla de captura, la lista de nombres) se marca
 * con un fondo tenue, porque un anillo alrededor de un bloque grande se ve
 * como un error de dibujo. No oscurece la pantalla ni bloquea nada.
 *
 * Los pasos son DATOS (STEPS): a que metodos aplican, que resaltan, que dicen
 * y cuando se dan por cumplidos. Un paso nuevo o un metodo nuevo se agregan
 * aqui, no con un `if (metodo === ...)` en el codigo de la tarjeta.
 *
 * La guia no sabe calcular ni lee el estado interno de app.js: mira la
 * pagina (si la tabla existe, si Calcular esta habilitado, si hay resultado).
 * app.js solo le avisa cuando mirar, con el evento `msa:state`.
 *
 * Empieza encendido en cada carga de la pagina. La X o el boton Asistente de
 * la barra lo apagan para esa visita; no se recuerda.
 * ==========================================================================*/
(function (global) {
  'use strict';

  function $(id) { return document.getElementById(id); }
  function method() { return document.documentElement.getAttribute('data-method') || 'cruzado'; }
  function visible(el) { return !!el && !el.closest('[hidden]') && el.getClientRects().length > 0; }

  /* Hitos: pasos que se cumplen solos al hacer algo en la pagina. Los demas
     son opcionales o de lectura y avanzan con Siguiente. */
  function tableReady() { return visible($('captureSection')); }
  function captureDone() { return tableReady() && !$('calcBtn').disabled; }
  function resultReady() { return visible($('resultsSection')) && !$('resultsSection').hidden; }

  /* Lo que le falta a un paso para darse por completo, en una frase; '' si
     ya lo esta. Enter solo avanza con el paso completo, y la frase es lo que
     la tarjeta dice cuando no. Los pasos opcionales o de lectura no definen
     `need`: estan completos siempre. */
  function num(id) {
    var el = $(id), v = el ? el.value.trim().replace(',', '.') : '';
    return v === '' ? null : (isFinite(Number(v)) ? Number(v) : NaN);
  }
  function needSize() {
    var bad = ['numOperators', 'numParts', 'numReplicates'].some(function (id) {
      var el = $(id); return !el || el.value.trim() === '' || !el.checkValidity() || el.classList.contains('invalid');
    });
    return bad || $('generateBtn').disabled ? 'corrige el tamano: cada campo, un entero dentro de su rango' : '';
  }
  function needCategories() {
    var cats = (($('categories') || {}).value || '').split(',')
      .map(function (c) { return c.trim(); }).filter(function (c, i, a) { return c && a.indexOf(c) === i; });
    if (cats.length < 2) return 'escribe al menos dos categorias, separadas por coma';
    if (cats.length === 2 && !$('rejectCategory').value) return 'elige la categoria de rechazo';
    return '';
  }
  /* Un nombre vacio no falta: el programa pone uno. Lo que impide seguir es
     repetirlo, porque dos operadores (o dos piezas, salvo en el anidado,
     donde la pieza es el par operador + pieza) se volverian uno. */
  function repeated(sel) {
    var seen = {}, dup = false;
    [].slice.call(document.querySelectorAll(sel)).forEach(function (i) {
      var v = i.value.trim().toLowerCase();
      if (!v) return;
      if (seen[v]) dup = true;
      seen[v] = true;
    });
    return dup;
  }
  function needNames() {
    if (document.querySelectorAll('.namelist-cols input.invalid').length) return 'corrige los nombres marcados en rojo';
    if (repeated('#operatorNames input')) return 'hay nombres de operador repetidos';
    if (method() !== 'anidado' && repeated('#partNames input')) return 'hay nombres de pieza repetidos';
    return '';
  }
  function needSpecs() {
    var ids = ['lsl', 'usl', 'tolerance', 'historicalSigma', 'processMean'];
    if (ids.some(function (id) { return isNaN(num(id)) && num(id) !== null; })) {
      return 'las especificaciones deben ser numeros (punto o coma decimal)';
    }
    var lsl = num('lsl'), usl = num('usl');
    if (lsl !== null && usl !== null && usl <= lsl) return 'USL tiene que ser mayor que LSL';
    return '';
  }

  var STEPS = [
    { id: 'nombre', target: '#studyName',
      title: 'Nombre del estudio',
      text: 'Opcional. Da nombre al archivo exportado y encabeza el reporte impreso.' },

    { id: 'tamano', target: '#numOperators, #numParts, #numReplicates', need: needSize,
      title: 'Tamano del estudio',
      text: {
        cruzado: 'Operadores, piezas y replicas. AIAG sugiere 3 operadores, 10 piezas y 3 replicas; ' +
          'todos miden LAS MISMAS piezas, y las piezas deben cubrir el rango del proceso.',
        anidado: 'Operadores, piezas POR OPERADOR y replicas. Cada operador mide sus propias piezas, ' +
          'tomadas del mismo lote: el estudio supone que el lote es homogeneo.',
        atributos: 'Evaluadores, piezas y replicas. AIAG sugiere unas 50 piezas, 3 evaluadores y ' +
          '3 replicas, con mitad buenas y mitad malas: un lote desbalanceado infla la concordancia.'
      } },

    { id: 'categorias', methods: ['atributos'], target: '#categories', need: needCategories,
      title: 'Categorias y categoria de rechazo',
      text: 'Las clasificaciones posibles, separadas por coma. Con dos, elige cual es la de rechazo: ' +
        'sin ella no se calculan efectividad, fuga ni falsa alarma.' },

    { id: 'nombres', area: '.namelist-cols', need: needNames,
      title: 'Nombres',
      text: {
        cruzado: 'Opcional. Escribe los nombres reales de operadores y piezas; salen en las graficas ' +
          'y en el reporte.',
        anidado: 'Opcional. Las piezas se listan bajo el operador que las midio, y puedes numerarlas ' +
          '1..n en cada uno: la "1" de uno y la "1" de otro son piezas distintas.',
        atributos: 'Opcional. Escribe los nombres reales de evaluadores y piezas; salen en las tablas ' +
          'y en el reporte.'
      } },

    { id: 'tabla', target: '#generateBtn', milestone: tableReady,
      need: function () { return tableReady() ? '' : 'pulsa Regenerar tabla'; },
      title: 'Generar la tabla',
      text: 'Pulsa Regenerar tabla para armar la rejilla de captura con este tamano y estos nombres.' },

    { id: 'estandar', methods: ['atributos'], area: '#standardTable',
      title: 'Estandar de cada pieza',
      text: 'Opcional. La clasificacion correcta de cada pieza. Sin estandar solo se sabe si los ' +
        'evaluadores coinciden, no si aciertan.' },

    { id: 'captura', area: '#captureSection .capture-scroll', milestone: captureDone,
      need: function () {
        return captureDone() ? '' : 'faltan celdas por capturar (' + (($('captureStatus') || {}).textContent || '') + ')';
      },
      title: 'Capturar',
      text: {
        cruzado: 'Escribe cada medicion, o copia un bloque desde Excel y pegalo en la primera celda: ' +
          'se reparte solo. Se acepta punto o coma decimal.',
        anidado: 'Escribe cada medicion, o copia un bloque desde Excel y pegalo en la primera celda: ' +
          'se reparte solo. Se acepta punto o coma decimal.',
        atributos: 'Elige la categoria de cada celda: lo que cada evaluador dijo de cada pieza en ' +
          'cada replica.'
      } },

    { id: 'especificacion', methods: ['cruzado', 'anidado'], target: '#lsl', need: needSpecs,
      title: 'Especificacion',
      text: 'Opcional. Con LSL y USL, o con la tolerancia directa, aparece el % Tolerance. Sin ellos ' +
        'solo se juzga contra la variacion del estudio.' },

    { id: 'opciones', methods: ['cruzado', 'anidado'], target: '#svMultiplier',
      title: 'Opciones de calculo',
      text: {
        cruzado: 'Multiplicador, interaccion, alfa y denominador de F. Si no tienes una razon para ' +
          'cambiarlos, los valores por defecto son los de AIAG y Minitab.',
        anidado: 'Multiplicador y confianza del intervalo. El anidado no tiene interaccion que ' +
          'probar, por eso no hay alfa ni denominador.'
      } },

    { id: 'calcular', target: '#calcBtn', milestone: resultReady,
      need: function () { return resultReady() ? '' : 'pulsa Calcular'; },
      title: 'Calcular',
      text: 'Con la captura completa, pulsa Calcular. Si despues cambias un dato, el resultado se ' +
        'marca como desactualizado hasta recalcular.' },

    /* El dictamen ya es la tarjeta que flota: se lleva a la vista y nada mas. */
    { id: 'dictamen', view: { cruzado: '#msaSummary', anidado: '#msaSummary', atributos: '#verdicts' },
      title: 'Leer el dictamen',
      text: {
        cruzado: 'Deciden el % Study Variation y, si diste especificacion, el % Tolerance: menos de ' +
          '10 % aceptable, mas de 30 % no aceptable. El intervalo matiza, no dictamina.',
        anidado: 'Deciden el % Study Variation y, si diste especificacion, el % Tolerance: menos de ' +
          '10 % aceptable, mas de 30 % no aceptable. El intervalo matiza, no dictamina.',
        atributos: 'Primero, si el sistema acierta contra el estandar; luego, si los evaluadores ' +
          'coinciden; despues fuga y falsa alarma, que se juzgan contra 2 % y 5 %.'
      } },

    { id: 'imprimir', target: '#printBtn',
      title: 'Imprimir el reporte',
      text: 'Imprimir / PDF arma un reporte completo -portada, dictamen, tablas, graficas y anexo ' +
        'con los datos-, no una captura de pantalla.' }
  ];

  var on = false, index = 0, marks = {}, marked = [], markedStep = null, card = null, seenMethod = null;

  function steps() {
    var m = method();
    return STEPS.filter(function (s) { return !s.methods || s.methods.indexOf(m) >= 0; });
  }
  function pick(v) { return (v && typeof v === 'object') ? v[method()] : v; }
  /* Lo que el paso senala: controles (anillo) o una seccion (fondo tenue).
     Lo primero visible de la lista es lo que se lleva a la vista. */
  function marksOf(step) {
    var out = [];
    [['target', 'guide-target'], ['area', 'guide-area'], ['view', null]].forEach(function (k) {
      var sel = pick(step[k[0]]);
      if (!sel) return;
      [].slice.call(document.querySelectorAll(sel)).forEach(function (el) {
        if (visible(el)) out.push({ el: el, cls: k[1] });
      });
    });
    return out;
  }

  /* El destino solo se lleva a la vista si no lo esta: mover la columna
     mientras alguien escribe en otra celda desorienta. */
  function inView(el) {
    var r = el.getBoundingClientRect();
    var box = el.closest('.col-capture, .results-panel');
    var top = 0, bottom = window.innerHeight;
    if (box && box.scrollHeight > box.clientHeight) {
      var b = box.getBoundingClientRect(); top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom);
    }
    var cardH = card && !card.hidden ? card.getBoundingClientRect().height + 16 : 0;
    return r.top >= top && r.bottom <= bottom - cardH;
  }

  function clearTarget() {
    marked.forEach(function (m) { m.el.classList.remove('guide-target', 'guide-area', 'guide-pulse'); });
    marked = []; markedStep = null;
  }

  function render(scroll) {
    if (!card) return;
    if (!on) { card.hidden = true; clearTarget(); document.documentElement.removeAttribute('data-guide'); return; }
    var list = steps();
    if (index >= list.length) index = list.length - 1;
    if (index < 0) index = 0;
    var step = list[index];
    document.documentElement.setAttribute('data-guide', 'on');

    var label = { cruzado: 'Cruzado', anidado: 'Anidado', atributos: 'Atributos' }[method()] || method();
    var last = index === list.length - 1;
    card.innerHTML =
      '<div class="guide-head"><span class="guide-k">Asistente &middot; ' + label + ' &middot; paso ' +
        (index + 1) + ' de ' + list.length + '</span>' +
        '<button type="button" class="guide-close" data-guide="close" aria-label="Cerrar el asistente" title="Cerrar el asistente">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
        '<path d="M6 6l12 12M18 6L6 18"/></svg></button></div>' +
      '<div class="guide-bar"><span style="width:' + Math.round(100 * (index + 1) / list.length) + '%"></span></div>' +
      '<p class="guide-title">' + step.title + '</p>' +
      '<p class="guide-text">' + pick(step.text) + '</p>' +
      '<div class="guide-actions"><span class="guide-hint" id="guideHint"></span>' +
        '<button type="button" data-guide="prev"' + (index === 0 ? ' disabled' : '') + '>Atras</button>' +
        (last
          ? '<button type="button" class="primary" data-guide="close">Terminar</button>'
          : '<button type="button" class="primary" data-guide="next">Siguiente</button>') +
      '</div>';
    card.hidden = false;
    updateHint();

    var key = method() + ':' + step.id;
    var found = marksOf(step);
    if (key !== markedStep || found.length !== marked.length) {
      clearTarget();
      found.forEach(function (m) {
        if (m.cls) m.el.classList.add(m.cls);
        if (m.cls === 'guide-target') m.el.classList.add('guide-pulse');
      });
      marked = found; markedStep = key;
      var now = found.slice();
      setTimeout(function () {
        if (markedStep === key) now.forEach(function (m) { m.el.classList.remove('guide-pulse'); });
      }, 2600);
    }
    var first = found.length ? found[0].el : null;
    if (scroll && first && !inView(first)) {
      var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
      first.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'center' });
    }
  }

  function goTo(id) {
    var list = steps();
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { index = i; break; }
    render(true);
  }

  /* Un hito que se cumple lleva al paso que le sigue; uno que deja de
     cumplirse (se reinicio el estudio, se vacio la tabla) regresa a el. Solo
     cuentan los CAMBIOS: si alguien vuelve atras a releer un paso, la guia no
     lo empuja de nuevo hacia adelante por un hito que ya estaba cumplido. */
  function current() { var list = steps(); return list[Math.max(0, Math.min(index, list.length - 1))]; }
  function needOf(step) { return step && step.need ? step.need() : ''; }

  /* El pie de la tarjeta dice si Enter ya puede avanzar o que falta. */
  function updateHint(warn) {
    var h = $('guideHint');
    if (!h || !on) return;
    var step = current(), last = index >= steps().length - 1, need = needOf(step);
    h.classList.toggle('need', !!need);
    h.classList.toggle('shake', !!(need && warn));
    if (last) h.innerHTML = '';
    else if (need) h.textContent = 'Para seguir: ' + need + '.';
    else h.innerHTML = '<kbd>Enter</kbd> para seguir';
    if (warn) setTimeout(function () { h.classList.remove('shake'); }, 400);
  }

  /* Al avanzar con el teclado, el foco va a lo que pide el paso nuevo: el
     primer campo, el boton (y otro Enter lo pulsa), o la primera celda vacia
     de la rejilla. Asi el estudio se puede llevar entero sin raton. */
  function focusStep(step) {
    var sel = pick(step.target), el = null;
    if (sel) el = document.querySelector(sel);
    else if (step.area) {
      var box = document.querySelector(pick(step.area));
      if (box) {
        var fields = [].slice.call(box.querySelectorAll('input, select'));
        el = fields.filter(function (f) { return f.value.trim() === ''; })[0] || fields[0] || null;
      }
    }
    if (el && visible(el) && !el.disabled) el.focus({ preventScroll: true });
  }

  function onKey(e) {
    if (!on || e.key !== 'Enter' || e.isComposing || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (e.defaultPrevented) return;
    var t = e.target;
    /* Enter en un boton, un enlace o un texto largo hace lo suyo: pulsar,
       seguir, saltar de linea. Solo se toma en campos de una linea y fuera de
       ellos. */
    if (t && t.closest && (t.closest('button, a, textarea, [contenteditable], .guide-card'))) return;
    var list = steps();
    if (index >= list.length - 1) return;
    e.preventDefault();
    if (needOf(list[index])) { updateHint(true); return; }
    index++;
    render(true);
    focusStep(list[index]);
  }

  function evaluate() {
    var list = steps(), moved = false;
    for (var i = 0; i < list.length; i++) {
      var s = list[i];
      if (!s.milestone) continue;
      var now = !!s.milestone(), before = !!marks[s.id];
      marks[s.id] = now;
      if (now && !before && index <= i) { index = Math.min(i + 1, list.length - 1); moved = true; }
      if (!now && before && index > i) { index = i; moved = true; }
    }
    return moved;
  }
  function snapshot() {
    marks = {};
    steps().forEach(function (s) { if (s.milestone) marks[s.id] = !!s.milestone(); });
  }

  function onState(e) {
    var reason = e && e.detail && e.detail.reason;
    /* Cambiar de metodo vacia la tabla y dispara avisos intermedios antes del
       de 'method'. Se ignoran: la guia empieza de cero con el metodo nuevo, y
       sin desplazar nada, porque app.js ya devolvio la vista al inicio. */
    if (reason === 'method') { seenMethod = method(); index = 0; snapshot(); render(false); return; }
    if (method() !== seenMethod) return;
    if (!on) { snapshot(); return; }
    if (reason === 'demo') { snapshot(); goTo('calcular'); return; }
    var moved = evaluate();
    render(moved);
  }

  function enable() { on = true; snapshot(); syncButton(); render(true); }
  function disable() { on = false; syncButton(); render(false); }
  function toggle() { if (on) disable(); else enable(); }
  function restart() { index = 0; enable(); }

  function syncButton() {
    var b = $('guideBtn');
    if (b) { b.setAttribute('aria-pressed', on ? 'true' : 'false'); b.classList.toggle('on', on); }
  }

  function init() {
    card = $('guideCard');
    if (!card) return;
    card.addEventListener('click', function (e) {
      var b = e.target.closest('[data-guide]');
      if (!b) return;
      var what = b.getAttribute('data-guide');
      if (what === 'close') disable();
      else if (what === 'next') { index++; render(true); }
      else if (what === 'prev') { index--; render(true); }
    });
    document.addEventListener('msa:state', onState);
    document.addEventListener('keydown', onKey);
    // Escribir puede completar un paso que no emite msa:state (nombres,
    // especificacion, categorias): el pie de la tarjeta se actualiza solo.
    document.addEventListener('input', function () { updateHint(false); });
    document.addEventListener('change', function () { updateHint(false); });
    on = true;                      // en cada carga, sin recordar si se apago
    seenMethod = method();
    index = 0;
    snapshot();
    // Si el estudio ya avanzo antes de que la guia mirara, empieza donde va.
    var list = steps();
    for (var i = 0; i < list.length; i++) if (list[i].milestone && marks[list[i].id]) index = Math.min(i + 1, list.length - 1);
    syncButton();
    render(false);
  }

  global.MSAGuide = { init: init, enable: enable, disable: disable, toggle: toggle, restart: restart,
                      goTo: goTo, steps: function () { return steps().map(function (s) { return s.id; }); } };
})(typeof window !== 'undefined' ? window : this);
