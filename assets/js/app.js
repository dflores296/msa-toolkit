/* ============================================================================
 * app.js - Interfaz: configuracion -> captura -> validacion -> resultados.
 * Replica el flujo del libro de Excel, sin sus errores.
 * ==========================================================================*/
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  /* parts        - metodo cruzado: la lista de piezas que miden todos.
     partsByOperator - metodo anidado: las piezas propias de cada operador.
     Los dos viven a la vez para no perder la captura al cambiar de metodo. */
  var state = { method: 'cruzado', operators: [], parts: [], partsByOperator: [],
                replicates: 2, result: null };

  /* ------------------------------------------------------------------ *
   * Tema claro / oscuro - manual, se recuerda en localStorage.
   * ------------------------------------------------------------------ */
  function currentTheme() {
    return document.documentElement.getAttribute('data-theme') || 'light';
  }

  function applyTheme(theme, remember) {
    document.documentElement.setAttribute('data-theme', theme);
    if (remember !== false) { try { localStorage.setItem('msa-theme', theme); } catch (e) {} }
    [].slice.call(document.querySelectorAll('.theme-opt')).forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.themeChoice === theme);
    });
    if (state.result) MSACharts.render(state.result);
  }

  function initTheme() {
    applyTheme(currentTheme());
    [].slice.call(document.querySelectorAll('.theme-opt')).forEach(function (btn) {
      btn.addEventListener('click', function () { applyTheme(btn.dataset.themeChoice); });
    });
  }

  /* ------------------------------------------------------------------ *
   * Metodo del estudio
   * Existen el Gage R&R cruzado y el anidado (pruebas destructivas); el de
   * atributos aparece en la barra deshabilitado, para que se vea que viene.
   * Cada metodo lleva su propia direccion (#cruzado), asi el enlace abre el
   * metodo correcto y recargar no lo pierde.
   *
   * Los dos metodos comparten la pantalla entera: mismos pasos, mismas
   * tarjetas, mismas pestanas. Lo que cambia se marca en el HTML con
   * data-methods="..." y se muestra u oculta aqui. Un metodo nuevo no inventa
   * lenguaje visual (docs/estandar-de-diseno.md).
   * ------------------------------------------------------------------ */
  var METHODS = [
    { id: 'cruzado', badge: 'Gage R&R \u00b7 ANOVA cruzado', available: true,
      engine: function () { return MSAAnova; },
      partsLabel: 'Piezas', partNamesLabel: 'Nombres de las piezas',
      countLabel: 'piezas',
      help: 'Gage R&R por ANOVA cruzado: cada operador mide las mismas piezas varias veces.' },
    { id: 'anidado', badge: 'Gage R&R \u00b7 ANOVA anidado', available: true,
      engine: function () { return MSANested; },
      partsLabel: 'Piezas por operador', partNamesLabel: 'Nombres de las piezas, por operador',
      countLabel: 'piezas por operador',
      help: 'Gage R&R anidado, para pruebas destructivas: cada operador mide sus propias piezas, ' +
            'tomadas de un lote homogeneo. El diseno no separa la interaccion operador x pieza.' },
    { id: 'atributos', badge: 'Attribute Agreement', available: false,
      help: 'En camino. Acuerdo entre evaluadores para datos de pasa / no pasa (Kappa, Kendall).' }
  ];

  function methodById(id) {
    for (var i = 0; i < METHODS.length; i++) if (METHODS[i].id === id) return METHODS[i];
    return METHODS[0];
  }
  function activeMethod() { return methodById(state.method); }
  function isNested() { return state.method === 'anidado'; }

  /* Muestra u oculta lo que es propio de un metodo. El atributo lleva la lista
     de metodos donde el elemento aplica; sin atributo, aplica a todos. */
  function applyMethodVisibility(id) {
    [].slice.call(document.querySelectorAll('[data-methods]')).forEach(function (el) {
      var list = el.getAttribute('data-methods').split(/[\s,]+/);
      el.hidden = list.indexOf(id) < 0;
    });
  }

  /* Cambiar de metodo conserva las mediciones: la rejilla es la misma
     (operadores x piezas x replicas) y cada valor se queda en su lugar. Lo que
     cambia es el significado y los nombres de las piezas -- en el anidado no
     pueden repetirse entre operadores -- y eso se dice, no se hace callado. */
  function applyMethod(id, isUserAction) {
    var m = methodById(id);
    if (!m.available) m = METHODS[0];
    var changed = state.method !== m.id;
    var captured = changed && isUserAction ? readValuesByPosition() : null;

    state.method = m.id;
    document.documentElement.setAttribute('data-method', m.id);
    $('methodBadge').textContent = m.badge;
    applyMethodVisibility(m.id);
    $('numPartsLabel').textContent = m.partsLabel;
    $('partNamesLabel').textContent = m.partNamesLabel;
    [].slice.call(document.querySelectorAll('.method-opt')).forEach(function (btn) {
      var mm = methodById(btn.dataset.method);
      btn.classList.toggle('active', btn.dataset.method === m.id);
      btn.setAttribute('aria-pressed', btn.dataset.method === m.id ? 'true' : 'false');
      btn.title = mm.help;
    });
    if (location.hash !== '#' + m.id) {
      try { history.replaceState(null, '', '#' + m.id); } catch (e) { location.hash = m.id; }
    }
    renderStudyName();

    if (changed && isUserAction) {
      // Al pasar al anidado, unos nombres de pieza que venian repetidos entre
      // operadores (lo normal en el cruzado) no sirven: se renumeran de cero.
      if (m.id === 'anidado' && firstDuplicate(allPartNames())) state.partsByOperator = [];
      renderNameInputs();
      if (!$('captureSection').hidden) {
        buildDataTable(false);
        var kept = writeValuesByPosition(captured);
        validateLive();
        if (kept) {
          showMessages($('configMsg'), [], [methodSwitchNote(m, kept)]);
        }
        if (state.result) calculate(); else resetResultViz();
      }
    }
    return m.id;
  }

  function methodSwitchNote(m, kept) {
    if (m.id === 'anidado') {
      return 'Metodo cambiado a anidado: se conservaron las ' + kept + ' medicion(es) en su lugar de la ' +
        'rejilla y las piezas se renombraron para que ninguna se repita entre operadores, como exige el ' +
        'diseno. Revisa que los nombres correspondan a las piezas que midio cada quien.';
    }
    return 'Metodo cambiado a cruzado: se conservaron las ' + kept + ' medicion(es) en su lugar de la ' +
      'rejilla y las piezas volvieron a la lista compartida. El cruzado supone que los operadores ' +
      'midieron LA MISMA pieza; si eran piezas distintas, el estudio es anidado.';
  }

  function initMethods() {
    applyMethod((location.hash || '').replace('#', '') || 'cruzado', false);
    [].slice.call(document.querySelectorAll('.method-opt')).forEach(function (btn) {
      btn.addEventListener('click', function () { applyMethod(btn.dataset.method, true); });
    });
    window.addEventListener('hashchange', function () {
      applyMethod((location.hash || '').replace('#', ''), true);
    });
  }

  /* ------------------------------------------------------------------ *
   * Pestañas del panel de resultados (Componentes / ANOVA / Graficas / Notas)
   * ------------------------------------------------------------------ */
  function initTabs() {
    var buttons = [].slice.call(document.querySelectorAll('.tab-btn'));
    var panels = [].slice.call(document.querySelectorAll('.tab-panel'));
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        var name = btn.dataset.tab;
        buttons.forEach(function (b) {
          var active = b === btn;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        panels.forEach(function (p) { p.hidden = p.dataset.panel !== name; });
        // Chart.js dibuja mal si el lienzo estaba oculto (0x0) al crearlo.
        if (name === 'graficas') MSACharts.resizeAll();
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Paso 1 - configuracion
   * ------------------------------------------------------------------ */
  function defaultNames(prefix, n, existing) {
    var out = [];
    for (var i = 0; i < n; i++) out.push((existing && existing[i]) || (prefix + ' ' + (i + 1)));
    return out;
  }

  /* El nombre del estudio no entra en ningun calculo: identifica el archivo que
     exportas y encabezara el reporte impreso. Se refleja en la barra superior y
     en el titulo de la pestana para saber que estudio esta abierto. */
  function studyName() { return $('studyName').value.trim(); }

  function renderStudyName() {
    var name = studyName();
    $('studyLabel').textContent = name;
    document.title = (name ? name + ' - ' : '') + 'MSA Toolkit - Gage R&R (ANOVA ' +
      (isNested() ? 'anidado' : 'cruzado') + ')';
  }

  /* Nombre de archivo a partir del nombre del estudio: sin acentos ni signos,
     para que no dependa del sistema de archivos de quien lo abra. */
  function studyFileName(ext) {
    var slug = studyName().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 60);
    return (slug || 'estudio-gage-rr') + '.' + ext;
  }

  /* Piezas del operador oi. Es el unico punto donde los dos metodos difieren
     en la estructura de la captura: en el cruzado todos comparten la lista, en
     el anidado cada uno trae la suya. */
  function partsOfOperator(oi) {
    return isNested() ? (state.partsByOperator[oi] || []) : state.parts;
  }
  function partsPerOperator() {
    return isNested() ? (state.partsByOperator[0] || []).length : state.parts.length;
  }
  /** Todos los nombres de pieza, en el orden de la tabla de captura. */
  function allPartNames() {
    if (!isNested()) return state.parts.slice();
    var out = [];
    state.partsByOperator.forEach(function (g) { out = out.concat(g); });
    return out;
  }

  function renderNameInputs() {
    var nOp = clamp(parseInt($('numOperators').value, 10), 2, 20, 3);
    var nPart = clamp(parseInt($('numParts').value, 10), 2, 50, 10);
    state.operators = defaultNames('Operador', nOp, state.operators);
    state.parts = defaultNames('Pieza', nPart, state.parts);
    /* En el anidado el nombre de la pieza no se puede repetir entre operadores:
       la numeracion corre de largo (1..30), que es como se etiqueta un lote del
       que se van sacando piezas. */
    state.partsByOperator = [];
    for (var o = 0; o < nOp; o++) {
      var prev = (state.partsByOperator[o] || []);
      var group = [];
      for (var p = 0; p < nPart; p++) group.push(prev[p] || ('Pieza ' + (o * nPart + p + 1)));
      state.partsByOperator.push(group);
    }

    fill($('operatorNames'), state.operators, function (i, v) { state.operators[i] = v; });
    if (isNested()) {
      fillGrouped($('partNames'), state.partsByOperator, state.operators, function (o, i, v) {
        state.partsByOperator[o][i] = v;
      });
    } else {
      fill($('partNames'), state.parts, function (i, v) { state.parts[i] = v; });
    }
  }

  function nameInput(value, label, onChange) {
    var inp = document.createElement('input');
    inp.type = 'text'; inp.value = value; inp.setAttribute('aria-label', label);
    inp.addEventListener('input', function () { onChange(inp.value); });
    return inp;
  }

  function fill(host, arr, onChange) {
    host.innerHTML = '';
    arr.forEach(function (name, i) {
      host.appendChild(nameInput(name, 'Nombre ' + (i + 1), function (v) { onChange(i, v); }));
    });
  }

  /* Anidado: las piezas se listan bajo el operador que las midio. Sin el
     encabezado, una lista de 30 nombres corridos no dice de quien es cada uno. */
  function fillGrouped(host, groups, opNames, onChange) {
    host.innerHTML = '';
    groups.forEach(function (group, o) {
      var head = document.createElement('div');
      head.className = 'namelist-group';
      head.textContent = opNames[o] || ('Operador ' + (o + 1));
      host.appendChild(head);
      group.forEach(function (name, i) {
        host.appendChild(nameInput(name, (opNames[o] || '') + ', pieza ' + (i + 1),
          function (v) { onChange(o, i, v); }));
      });
    });
  }

  function clamp(v, lo, hi, dflt) {
    if (!isFinite(v)) return dflt;
    return Math.min(hi, Math.max(lo, v));
  }

  /* Validacion de los tres tamanos del estudio. Antes solo se recortaban en
     silencio (clamp): escribir 1 operador dejaba el campo en 1 pero el estudio
     se armaba con 2, sin marca ni aviso. Ahora el campo se marca en rojo, el
     motivo aparece en el mensaje de la tarjeta y "Regenerar tabla" se bloquea
     hasta corregirlo. Los limites salen de los atributos min/max del propio
     input, para no repetirlos aqui. */
  var CONFIG_FIELDS = [
    { id: 'numOperators', label: 'Operadores' },
    { id: 'numParts', label: 'Piezas' },
    { id: 'numReplicates', label: 'Replicas' }
  ];

  function configErrors() {
    var errs = [];
    CONFIG_FIELDS.forEach(function (f) {
      var el = $(f.id);
      var lo = parseInt(el.min, 10), hi = parseInt(el.max, 10);
      var v = parseInt(el.value, 10);
      var bad = !isFinite(v) || String(el.value).trim() === '' || v < lo || v > hi;
      el.classList.toggle('invalid', bad);
      el.setAttribute('aria-invalid', bad ? 'true' : 'false');
      if (bad) errs.push(f.label + ': un numero entero entre ' + lo + ' y ' + hi + '.');
    });
    return errs;
  }

  function validateConfig() {
    var errs = configErrors();
    if (errs.length) showMessages($('configMsg'), errs, []);
    else clearMessages($('configMsg'));
    $('generateBtn').disabled = errs.length > 0;
    return errs.length === 0;
  }

  /* ------------------------------------------------------------------ *
   * Paso 2 - tabla de captura
   * ------------------------------------------------------------------ */
  function buildDataTable(preserve) {
    if (!validateConfig()) return false;
    var previous = preserve ? readValues() : {};
    state.replicates = clamp(parseInt($('numReplicates').value, 10), 2, 25, 2);

    var ops = state.operators.map(trimOrDefault('Operador'));
    state.operators = ops;
    if (isNested()) {
      state.partsByOperator = state.partsByOperator.map(function (g, o) {
        return g.map(function (v, i) {
          var t = String(v || '').trim();
          return t || ('Pieza ' + (o * g.length + i + 1));
        });
      });
    } else {
      state.parts = state.parts.map(trimOrDefault('Pieza'));
    }
    var dup = firstDuplicate(ops) || firstDuplicate(allPartNames());
    if (dup) {
      showMessages($('configMsg'), [isNested()
        ? 'Hay nombres repetidos ("' + dup + '"). En un estudio anidado cada operador mide piezas ' +
          'distintas, asi que ningun nombre de pieza puede repetirse, ni siquiera entre operadores.'
        : 'Hay nombres repetidos ("' + dup + '"). Cada operador y cada pieza debe tener un nombre unico.'], []);
      return false;
    }
    clearMessages($('configMsg'));

    // Clases explicitas por columna. No dependemos de :first-child, que alineaba
    // distinto la primera fila de cada operador: ahi la celda de pieza es el
    // segundo hijo, porque el th del operador ocupa el primero.
    var thead = '<thead><tr><th class="col-op">Operador</th><th class="col-part">Pieza</th>';
    for (var k = 1; k <= state.replicates; k++) {
      thead += '<th class="col-meas">Replica ' + k + '</th>';
    }
    thead += '</tr></thead>';

    var body = '<tbody>';
    ops.forEach(function (op, oi) {
      var parts = partsOfOperator(oi);
      parts.forEach(function (pt, pi) {
        body += '<tr' + (pi === 0 && oi > 0 ? ' class="group-start"' : '') + '>';
        if (pi === 0) {
          body += '<th class="col-op" rowspan="' + parts.length + '" scope="rowgroup">' +
                  esc(op) + '</th>';
        }
        body += '<td class="col-part">' + esc(pt) + '</td>';
        for (var k = 0; k < state.replicates; k++) {
          var key = op + '\u0000' + pt + '\u0000' + k;
          var v = previous[key] === undefined ? '' : previous[key];
          body += '<td class="col-meas"><input type="text" inputmode="decimal" data-op="' + esc(op) +
                  '" data-part="' + esc(pt) + '" data-rep="' + k + '" data-oi="' + oi +
                  '" data-pi="' + pi + '" value="' + esc(v) +
                  '" aria-label="' + esc(op + ', ' + pt + ', replica ' + (k + 1)) + '"></td>';
        }
        body += '</tr>';
      });
    });
    body += '</tbody>';

    $('dataTable').innerHTML = thead + body;
    $('captureSection').hidden = false;
    $('captureCount').textContent = ops.length + ' operadores x ' + partsPerOperator() + ' ' +
      activeMethod().countLabel + ' x ' + state.replicates + ' replicas = ' +
      (ops.length * partsPerOperator() * state.replicates) + ' mediciones';
    wirePaste();
    return true;
  }

  function trimOrDefault(prefix) {
    return function (v, i) { var t = String(v || '').trim(); return t || (prefix + ' ' + (i + 1)); };
  }
  function firstDuplicate(arr) {
    var seen = {};
    for (var i = 0; i < arr.length; i++) {
      if (seen[arr[i]]) return arr[i];
      seen[arr[i]] = true;
    }
    return null;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function inputs() { return [].slice.call($('dataTable').querySelectorAll('input')); }

  function readValues() {
    var map = {};
    inputs().forEach(function (i) {
      map[i.dataset.op + '\u0000' + i.dataset.part + '\u0000' + i.dataset.rep] = i.value;
    });
    return map;
  }

  /* Las mismas mediciones, pero indexadas por su LUGAR en la rejilla y no por
     los nombres. Es lo que permite cambiar de metodo sin perder la captura: en
     el anidado las piezas se renombran, pero la celda "operador 2, tercera
     pieza, replica 1" sigue siendo la misma celda. */
  function readValuesByPosition() {
    var map = {};
    inputs().forEach(function (i) {
      if (i.value.trim() === '') return;
      map[i.dataset.oi + '|' + i.dataset.pi + '|' + i.dataset.rep] = i.value;
    });
    return map;
  }

  /** Devuelve cuantas mediciones se pudieron reubicar. */
  function writeValuesByPosition(map) {
    if (!map) return 0;
    var n = 0;
    inputs().forEach(function (i) {
      var v = map[i.dataset.oi + '|' + i.dataset.pi + '|' + i.dataset.rep];
      if (v !== undefined) { i.value = v; n++; }
    });
    return n;
  }

  /** Pegar un bloque desde Excel: rellena hacia abajo y a la derecha. */
  function wirePaste() {
    inputs().forEach(function (inp) {
      inp.addEventListener('paste', function (ev) {
        var text = (ev.clipboardData || window.clipboardData).getData('text');
        if (!text || !/[\t\n\r]/.test(text)) return;   // valor simple: comportamiento normal
        ev.preventDefault();
        var all = inputs(), start = all.indexOf(inp);
        var cols = state.replicates;
        var startRow = Math.floor(start / cols), startCol = start % cols;
        text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').forEach(function (line, r) {
          line.split('\t').forEach(function (cellValue, c) {
            var idx = (startRow + r) * cols + (startCol + c);
            if (startCol + c < cols && all[idx]) all[idx].value = cellValue.trim();
          });
        });
        validateLive();
      });
    });
    inputs().forEach(function (i) { i.addEventListener('input', validateLive); });
  }

  function collectRows() {
    return inputs().map(function (i) {
      return { operator: i.dataset.op, part: i.dataset.part,
               replicate: Number(i.dataset.rep) + 1, value: i.value.trim().replace(',', '.') };
    });
  }

  function validateLive() {
    var bad = 0;
    inputs().forEach(function (i) {
      var v = i.value.trim().replace(',', '.');
      var ok = v === '' || isFinite(Number(v));
      i.classList.toggle('invalid', !ok);
      if (!ok) bad++;
    });
    var empty = inputs().filter(function (i) { return i.value.trim() === ''; }).length;
    $('calcBtn').disabled = bad > 0 || empty > 0;
    $('captureStatus').textContent = bad > 0
      ? bad + ' valor(es) no numerico(s)'
      : empty > 0 ? empty + ' celda(s) por capturar' : 'Datos completos';
    $('captureStatus').style.color = (bad || empty) ? 'var(--warn)' : 'var(--ok)';
  }

  /* ------------------------------------------------------------------ *
   * Paso 3 - calculo y resultados
   * ------------------------------------------------------------------ */
  /* Lee un campo numerico admitiendo coma decimal (5,0) ademas de punto.
     Devuelve '' si esta vacio, o null si tiene algo que no es un numero. */
  var SPEC_LABELS = { lsl: 'LSL', usl: 'USL', tolerance: 'Tolerancia',
                      historicalSigma: 'Sigma historica del proceso',
                      processMean: 'Media historica del proceso' };

  function readSpecs() {
    var values = {}, errors = [];
    Object.keys(SPEC_LABELS).forEach(function (id) {
      var el = $(id), raw = el.value.trim().replace(',', '.');
      if (raw === '') { values[id] = ''; el.classList.remove('invalid'); return; }
      if (!isFinite(Number(raw))) {
        errors.push(SPEC_LABELS[id] + ': "' + el.value.trim() + '" no es un numero valido.');
        el.classList.add('invalid');
        values[id] = '';
        return;
      }
      el.classList.remove('invalid');
      values[id] = raw;
    });

    // Avisos sobre la tolerancia, para que nunca desaparezca en silencio.
    var hasTol = values.tolerance !== '';
    var hasBoth = values.lsl !== '' && values.usl !== '';
    if (hasBoth && !hasTol && Number(values.usl) <= Number(values.lsl)) {
      errors.push('USL (' + values.usl + ') debe ser mayor que LSL (' + values.lsl + ').');
    }
    if (hasTol && Number(values.tolerance) <= 0) {
      errors.push('La tolerancia debe ser mayor que cero.');
    }
    return { values: values, errors: errors };
  }

  function resetResultViz() {
    MSACharts.destroyAll();
    $('evalBars').innerHTML = '';
  }

  function calculate() {
    clearMessages($('resultMsg'));
    var rows = collectRows();
    var specs = readSpecs();
    if (specs.errors.length) {
      $('resultsSection').hidden = false;
      showMessages($('resultMsg'), specs.errors, []);
      $('resultBody').hidden = true;
      resetResultViz();
      state.result = null;
      return;
    }
    var opts = {
      studyVarMultiplier: Number($('svMultiplier').value),
      lsl: specs.values.lsl, usl: specs.values.usl,
      tolerance: specs.values.tolerance,
      processMean: specs.values.processMean,
      historicalSigma: specs.values.historicalSigma
    };
    // Alfa, interaccion y denominador de F solo existen en el cruzado: sin
    // interaccion estimable no hay nada que probar, agrupar ni elegir.
    if (!isNested()) {
      opts.alpha = Number($('alpha').value);
      opts.interaction = $('interactionMode').value;
      opts.fDenominator = $('fDenominator').value;
    }
    var result;
    try {
      result = activeMethod().engine().compute(rows, opts);
    } catch (e) {
      $('resultsSection').hidden = false;
      showMessages($('resultMsg'), e.details || [e.message], []);
      resetResultViz();
      $('resultBody').hidden = true;
      state.result = null;
      return;
    }
    state.result = result;
    $('resultsSection').hidden = false;
    $('resultBody').hidden = false;
    showMessages($('resultMsg'), [], result.warnings);
    renderVerdict(result);
    renderEvalBars(result);
    renderTables(result);
    MSACharts.render(result);
  }

  /* Que significa cada tarjeta. Se muestra al pasar el cursor: el numero solo
     no dice contra que se compara ni de donde sale. */
  var VERDICT_HELP = {
    sv: 'Cuanta de la variacion del estudio se debe al sistema de medicion, en desviacion estandar ' +
        '(6 sigma del Gage R&R / 6 sigma total). Criterio AIAG: menos de 10 % aceptable, 10 a 30 % ' +
        'marginal, mas de 30 % inaceptable.',
    contrib: 'Que fraccion de la varianza total aporta el sistema de medicion. Es aditivo: todas las ' +
        'fuentes suman 100 %, por eso sirve para comparar fuentes entre si. Minitab considera menos ' +
        'de 1 % excelente y mas de 9 % pobre.',
    tol: 'Que parte de la tolerancia se come el sistema de medicion: (multiplicador x sigma del Gage R&R) ' +
        '/ (USL - LSL). No depende de las piezas que elegiste, pero si de la tolerancia. Solo se calcula ' +
        'si diste LSL y USL o la tolerancia directa.',
    ndc: 'Cuantos grupos distintos de piezas alcanza a separar el sistema de medicion. AIAG pide 5 o mas. ' +
        'Si sale bajo con piezas representativas, el problema es el instrumento; si las piezas eran casi ' +
        'identicas, el problema es la muestra.',
    icc: 'Fraccion de la varianza total que aporta el producto y no la medicion. Wheeler: 0.80 o mas es ' +
        'un monitor de primera clase, 0.50 a 0.80 de segunda, 0.20 a 0.50 de tercera. Lectura ' +
        'complementaria al criterio AIAG, no sustituto.'
  };

  function renderVerdict(r) {
    var a = r.assessment;
    var cards = [
      card('% Study Variation (GRR)', r.metrics.pctStudyVar.toFixed(2) + ' %', a.studyVar, VERDICT_HELP.sv),
      card('% Contribucion (GRR)', r.metrics.pctContribution.toFixed(2) + ' %', a.contribution, VERDICT_HELP.contrib),
      r.metrics.pctTolerance === null
        ? card('% Tolerance (P/T)', 'sin LSL/USL', null, VERDICT_HELP.tol)
        : card('% Tolerance (P/T)', r.metrics.pctTolerance.toFixed(2) + ' %', a.tolerance, VERDICT_HELP.tol),
      card('Categorias distintas', r.ndc === null ? 'inf' : String(r.ndc), a.ndc, VERDICT_HELP.ndc),
      card('ICC (EMP, Wheeler)', r.icc.toFixed(3), a.emp, VERDICT_HELP.icc)
    ];
    $('verdicts').innerHTML = cards.join('');
  }

  function card(k, v, t, help) {
    return '<div class="verdict"' + (help ? ' title="' + esc(k + ': ' + help) + '"' : '') + '>' +
      '<div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div>' +
      (t ? '<span class="t ' + t.level + '">' + esc(t.label) + '</span>' : '') + '</div>';
  }

  /* Barras de "Evaluacion de la variacion": mismos dos datos que mostraba
     el chart de Chart.js que reemplaza (Total Gage -- Study Variation y,
     si hay tolerancia, Total Gage -- Tolerance), solo que en HTML/CSS con
     marcas de 10 % y 30 % del criterio AIAG en vez del canvas heredado
     del Excel. Es un cambio de presentacion, no de datos. */
  function renderEvalBars(r) {
    var rows = [];
    if (r.metrics.pctTolerance !== null) {
      rows.push({
        label: 'Total Gage – Tolerance' +
          (r.toleranceInfo && r.toleranceInfo.oneSided ? ' (unilateral)' : ''),
        value: r.metrics.pctTolerance,
        help: 'Variacion total del sistema de medicion (6 sigma GRR) como porcentaje de la tolerancia LSL–USL.'
      });
    }
    rows.push({
      label: 'Total Gage – Study Variation',
      value: r.metrics.pctStudyVar,
      help: 'Variacion total del sistema de medicion como porcentaje de la variacion total del estudio.'
    });

    var LEVELS = {
      ok: 'bueno (< 10 %)', warn: 'marginal (10–30 %)', bad: 'malo (> 30 %)'
    };

    $('evalBars').innerHTML = rows.map(function (row) {
      var v = row.value;
      var level = v <= 10 ? 'ok' : v <= 30 ? 'warn' : 'bad';
      // Mismo rol que el tooltip de Chart.js en las otras graficas: al pasar
      // el cursor se lee el valor exacto, el criterio y que significa la barra.
      var tip = row.label + ': ' + v.toFixed(2) + ' % — ' + LEVELS[level] + '. ' + row.help;
      return '<div class="eval-row" title="' + esc(tip) + '">' +
        '<div class="eval-label">' + esc(row.label) + '</div>' +
        '<div class="eval-track">' +
          '<div class="eval-fill ' + level + '" style="width:' + Math.min(100, v).toFixed(2) + '%"></div>' +
          evalTick(10, 'ok') + evalTick(30, 'warn') +
        '</div>' +
        '<div class="eval-val">' + v.toFixed(2) + ' %</div>' +
      '</div>';
    }).join('');
  }

  /* Marca de umbral del criterio AIAG: linea punteada con el color de su
     nivel (verde el 10 %, ambar el 30 %) y su rotulo arriba, como en Minitab. */
  function evalTick(pctAt, level) {
    return '<div class="eval-tick ' + level + '" style="left:' + pctAt + '%">' +
      '<span class="eval-tick-label ' + level + '">' + pctAt + ' %</span></div>';
  }

  function num(v, sig) {
    if (v === null || v === undefined || !isFinite(v)) return '-';
    if (v === 0) return '0';
    var a = Math.abs(v);
    if (a < 1e-4 || a >= 1e7) return v.toExponential(3);
    return v.toFixed(Math.max(0, (sig || 6)));
  }
  function pct(v) { return v === null || v === undefined ? '-' : (100 * v).toFixed(2) + ' %'; }
  function pval(v) {
    if (v === null || v === undefined) return '';
    return v < 0.0001 ? '&lt; 0.0001' : v.toFixed(4);
  }

  function renderTables(r) {
    /* ANOVA */
    var h = '<caption>Tabla 1. ' + (r.model === 'nested'
        ? 'ANOVA anidado (piezas dentro de operador)'
        : 'ANOVA de dos factores (' +
          (r.model === 'with-interaction' ? 'con interaccion' : 'sin interaccion') + ')') + '</caption>' +
      '<thead><tr><th>Fuente</th><th class="num">GL</th><th class="num">SC</th>' +
      '<th class="num">CM</th><th class="num">F</th><th class="num">p</th></tr></thead><tbody>';
    r.anova.forEach(function (row) {
      h += '<tr' + (row.source === 'Total' ? ' class="total"' : '') + '><td>' + esc(row.source) + '</td>' +
        '<td class="num">' + row.df + '</td>' +
        '<td class="num">' + num(row.ss, 6) + '</td>' +
        '<td class="num">' + (row.ms === null ? '' : num(row.ms, 6)) + '</td>' +
        '<td class="num">' + (row.f === null ? '' : row.f.toFixed(3)) + '</td>' +
        '<td class="num">' + pval(row.p) + '</td></tr>';
    });
    h += '</tbody>';
    $('anovaTable').innerHTML = h;
    $('modelNote').textContent = r.modelReason;

    /* Componentes de varianza */
    var t1 = '<caption>Tabla 2. Componentes de varianza</caption><thead><tr><th>Fuente</th>' +
      '<th class="num">Varianza</th><th class="num">% Contribucion</th></tr></thead><tbody>';
    r.components.forEach(function (c) {
      t1 += '<tr' + (c.key === 'total' ? ' class="total"' : '') + '>' +
        '<td class="indent-' + c.indent + '">' + esc(c.source) + '</td>' +
        '<td class="num">' + num(c.variance, 8) + '</td>' +
        '<td class="num">' + pct(c.pctContribution) + '</td></tr>';
    });
    t1 += '</tbody>';
    $('varianceTable').innerHTML = t1;

    /* Evaluacion del sistema de medicion */
    var k = r.studyVarMultiplier;
    var showTol = r.tolerance !== null, showProc = r.historicalSigma !== null;
    var t2 = '<caption>Tabla 3. Evaluacion del sistema de medicion</caption><thead><tr><th>Fuente</th>' +
      '<th class="num">Desv. estandar</th><th class="num">Variacion del estudio (' + k + ' s)</th>' +
      '<th class="num">% Study Variation</th>' +
      (showTol ? '<th class="num">% Tolerance' +
         (r.toleranceInfo.oneSided ? '<br><span style="font-weight:400;font-size:11px">(unilateral)</span>' : '') +
         '</th>' : '') +
      (showProc ? '<th class="num">% Proceso</th>' : '') +
      '</tr></thead><tbody>';
    r.components.forEach(function (c) {
      t2 += '<tr' + (c.key === 'total' ? ' class="total"' : '') + '>' +
        '<td class="indent-' + c.indent + '">' + esc(c.key === 'total' ? 'Variacion del estudio' : c.source) + '</td>' +
        '<td class="num">' + num(c.stdDev, 8) + '</td>' +
        '<td class="num">' + num(c.studyVar, 8) + '</td>' +
        '<td class="num">' + pct(c.pctStudyVar) + '</td>' +
        (showTol ? '<td class="num">' + pct(c.pctTolerance) + '</td>' : '') +
        (showProc ? '<td class="num">' + pct(c.pctProcess) + '</td>' : '') +
        '</tr>';
    });
    t2 += '</tbody>';
    $('assessTable').innerHTML = t2;

    var notes = [
      'El % Contribucion se calcula sobre la varianza y suma 100 %.',
      'El % Study Variation se calcula sobre la desviacion estandar y NO suma 100 %.',
      'La variacion del estudio es la desviacion estandar multiplicada por ' + k + '.',
      'NDC = parte entera de 1.41 x (sigma_pieza / sigma_GageR&R) = ' +
        (isFinite(r.ndcRaw) ? r.ndcRaw.toFixed(3) : 'infinito') +
        ' -> ' + (r.ndc === null ? 'infinito' : r.ndc) + '.'
    ];
    if (showTol) {
      var ti = r.toleranceInfo;
      if (ti.oneSided) {
        notes.push('Especificacion UNILATERAL (' + ti.mode.replace('unilateral-', '') + '). ' +
          'El % Tolerance compara media dispersion (' + (k / 2) + ' sigma) contra el margen ' +
          ti.label + ' = ' + num(ti.width, 6) + ', con centro del proceso = ' + num(ti.center, 6) +
          (ti.centerFromStudy ? ' (media global del estudio).' : ' (media historica indicada).'));
      } else {
        notes.push('Tolerancia usada: ' + num(r.tolerance, 6) + ' (' + ti.label + ').');
      }
    }
    $('resultNotes').innerHTML = notes.map(function (n) { return '<p class="note">Nota. ' + esc(n) + '</p>'; }).join('');

    /* ANOVA completo (siempre con interaccion) para auditoria */
    var t3 = '<thead><tr><th>Fuente</th><th class="num">GL</th><th class="num">SC</th><th class="num">CM</th></tr></thead><tbody>';
    r.anovaFull.rows.forEach(function (row) {
      t3 += '<tr' + (row.source === 'Total' ? ' class="total"' : '') + '><td>' + esc(row.source) + '</td>' +
        '<td class="num">' + row.df + '</td><td class="num">' + num(row.ss, 8) + '</td>' +
        '<td class="num">' + (row.ms === null ? '' : num(row.ms, 8)) + '</td></tr>';
    });
    t3 += '</tbody>';
    $('anovaFullTable').innerHTML = t3;
    $('anovaFullNote').textContent = r.model === 'nested'
      ? 'La misma tabla sin las F, para auditar el calculo:'
      : 'ANOVA completo (siempre con interaccion, para auditar el calculo):';
    var identity = r.anovaFull.identity ||
      'SC_Total = SC_Parte + SC_Operador + SC_Interaccion + SC_Repetibilidad';
    $('decompNote').textContent = 'Comprobacion de la identidad ' + identity +
      ': error relativo = ' + r.anovaFull.decompositionError.toExponential(2) +
      (r.anovaFull.decompositionError < 1e-9 ? ' (correcto).' : ' (REVISAR).');
  }

  /* ------------------------------------------------------------------ *
   * Mensajes
   * ------------------------------------------------------------------ */
  function clearMessages(host) { host.innerHTML = ''; }
  function showMessages(host, errors, warnings) {
    var h = '';
    if (errors && errors.length) {
      h += '<div class="msg err"><strong>No se puede calcular:</strong><ul>' +
        errors.map(function (e) { return '<li>' + esc(e) + '</li>'; }).join('') + '</ul></div>';
    }
    if (warnings && warnings.length) {
      h += '<div class="msg warn"><strong>Avisos (' + warnings.length + '):</strong><ul>' +
        warnings.map(function (w) { return '<li>' + esc(w) + '</li>'; }).join('') + '</ul></div>';
    }
    host.innerHTML = h;
  }

  /* ------------------------------------------------------------------ *
   * Importar / exportar
   * ------------------------------------------------------------------ */
  /* Exportar CSV: la tabla de mediciones del estudio, nada mas. Una fila por
     medicion, en el mismo orden en que se captura. Sin lineas de comentario ni
     parametros: el archivo se abre en Excel como una tabla limpia y esta misma
     pagina lo vuelve a importar. */
  function exportCSV() {
    var vals = readValues();
    var lines = ['operador,pieza,replica,medicion'];
    state.operators.forEach(function (op, oi) {
      partsOfOperator(oi).forEach(function (pt) {
        for (var k = 0; k < state.replicates; k++) {
          lines.push([csvCell(op), csvCell(pt), k + 1,
                      (vals[op + '\u0000' + pt + '\u0000' + k] || '').trim()].join(','));
        }
      });
    });
    download(studyFileName('csv'), lines.join('\n'), 'text/csv');
  }

  function csvCell(s) {
    s = String(s);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function download(name, text, mime) {
    var blob = new Blob([text], { type: mime + ';charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function importFile(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result);
      // Se limpia ANTES de cargar: loadPayload deja sus propios avisos (el
      // diseno que trae el archivo, por ejemplo) y borrarlos despues los
      // hacia invisibles.
      clearMessages($('configMsg'));
      try {
        if (/^\s*\{/.test(text)) loadPayload(JSON.parse(text));
        else loadCSV(text);
      } catch (e) {
        showMessages($('configMsg'), ['No se pudo leer el archivo: ' + e.message], []);
      }
    };
    reader.readAsText(file);
  }

  function loadCSV(text) {
    var all = text.replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim(); });
    // Se ignoran las lineas que empiezan con # : no las escribe esta pagina,
    // pero varias herramientas las usan como encabezado de comentario.
    var lines = all.filter(function (l) { return l.charAt(0) !== '#'; });
    if (!lines.length) throw new Error('el archivo no tiene filas de datos');
    var sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    var head = splitCSV(lines[0], sep).map(function (s) { return s.trim().toLowerCase(); });
    var iOp = idxOf(head, ['operador', 'operator']);
    var iPt = idxOf(head, ['pieza', 'parte', 'part']);
    var iVal = idxOf(head, ['medicion', 'medición', 'valor', 'value', 'measurement']);
    var iRep = idxOf(head, ['replica', 'réplica', 'replicate', 'repeticion', 'repetición']);
    if (iOp < 0 || iPt < 0 || iVal < 0) {
      throw new Error('se esperan columnas operador, pieza y medicion (encabezado leido: ' + head.join(', ') + ')');
    }
    var rows = lines.slice(1).map(function (l) {
      var c = splitCSV(l, sep);
      var row = { operator: (c[iOp] || '').trim(), part: (c[iPt] || '').trim(), value: (c[iVal] || '').trim() };
      // La columna replica ya no se ignora: si viene, manda sobre el orden de
      // las filas, asi que un archivo desordenado se recompone igual.
      if (iRep >= 0) {
        var rep = parseInt((c[iRep] || '').trim(), 10);
        if (isFinite(rep) && rep > 0) row.replicate = rep;
      }
      return row;
    }).filter(function (r) { return r.operator && r.part; });
    loadPayload({ data: rows });
  }

  function idxOf(head, names) {
    for (var i = 0; i < names.length; i++) {
      var k = head.indexOf(names[i]);
      if (k >= 0) return k;
    }
    return -1;
  }

  function splitCSV(line, sep) {
    var out = [], cur = '', q = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (q) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') q = false;
        else cur += c;
      } else if (c === '"') q = true;
      else if (c === sep) { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  /* Que diseno trae el archivo, leido de los datos y no del metodo activo:
     si todos los operadores midieron las mismas piezas es cruzado; si ninguna
     pieza se repite entre operadores es anidado. Cualquier otra cosa (unas
     compartidas y otras no) no es ninguno de los dos y se deja como esta para
     que el motor lo diga con su propio mensaje. */
  function detectDesign(partsByOp) {
    if (partsByOp.length < 2) return null;
    var owner = {}, shared = 0, own = 0;
    partsByOp.forEach(function (g, oi) {
      g.forEach(function (pt) {
        if (owner[pt] === undefined) { owner[pt] = oi; own++; }
        else if (owner[pt] !== oi) shared++;
      });
    });
    if (shared === 0) return 'anidado';
    var first = partsByOp[0];
    var same = partsByOp.every(function (g) {
      return g.length === first.length && g.every(function (pt) { return first.indexOf(pt) >= 0; });
    });
    return same ? 'cruzado' : null;
  }

  function loadPayload(p) {
    var rows = p.data || [];
    if (!rows.length) throw new Error('no hay filas de datos');
    var ops = [], parts = [], counts = {}, partsByOp = [], seenPart = [];
    rows.forEach(function (r) {
      var o = String(r.operator).trim(), t = String(r.part).trim();
      var oi = ops.indexOf(o);
      if (oi < 0) { oi = ops.length; ops.push(o); partsByOp.push([]); seenPart.push({}); }
      if (parts.indexOf(t) < 0) parts.push(t);
      if (!seenPart[oi][t]) { seenPart[oi][t] = true; partsByOp[oi].push(t); }
      var key = o + '\u0000' + t;
      // Con columna replica el numero de replicas lo fija el mayor indice, no
      // el conteo de filas: asi un archivo con huecos no encoge el estudio.
      counts[key] = Math.max(counts[key] || 0, r.replicate > 0 ? r.replicate : (counts[key] || 0) + 1);
    });
    var maxRep = Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; }));

    /* El archivo manda sobre el metodo activo. Importar un estudio anidado
       estando en cruzado daria un error de piezas incompletas que no dice nada
       del problema real, asi que se cambia el metodo y se avisa. */
    var notes = [];
    var design = detectDesign(partsByOp);
    if (design && design !== state.method && methodById(design).available) {
      applyMethod(design, false);
      notes.push('El archivo trae un diseno ' + design + ' (' + (design === 'anidado'
        ? 'ninguna pieza la miden dos operadores'
        : 'todos los operadores midieron las mismas piezas') +
        '), asi que se cambio a ese metodo.');
    }
    var perOp = partsByOp.map(function (g) { return g.length; });
    if (isNested() && Math.min.apply(null, perOp) !== Math.max.apply(null, perOp)) {
      notes.push('Los operadores no traen el mismo numero de piezas (entre ' +
        Math.min.apply(null, perOp) + ' y ' + Math.max.apply(null, perOp) +
        '): la tabla se arma con ' + perOp[0] + ' y las celdas que sobren quedan vacias.');
    }

    if (p.config) {
      if (p.config.studyName !== undefined) { $('studyName').value = p.config.studyName; renderStudyName(); }
      if (p.config.lsl !== undefined) $('lsl').value = p.config.lsl;
      if (p.config.usl !== undefined) $('usl').value = p.config.usl;
      if (p.config.tolerance !== undefined) $('tolerance').value = p.config.tolerance;
      if (p.config.processMean !== undefined) $('processMean').value = p.config.processMean;
      if (p.config.historicalSigma !== undefined) $('historicalSigma').value = p.config.historicalSigma;
      if (p.config.alpha !== undefined) $('alpha').value = String(p.config.alpha);
      if (p.config.interaction) $('interactionMode').value = p.config.interaction;
      if (p.config.studyVarMultiplier) $('svMultiplier').value = String(p.config.studyVarMultiplier);
      if (p.config.fDenominator) $('fDenominator').value = p.config.fDenominator;
    }

    state.operators = ops;
    // Cada metodo se queda con la estructura que le toca. La del otro no se
    // pisa con nombres que ahi serian invalidos (en un archivo cruzado las
    // piezas se repiten entre operadores, y el anidado no lo admite).
    if (isNested()) state.partsByOperator = partsByOp.map(function (g) { return g.slice(); });
    else state.parts = parts;
    $('numOperators').value = ops.length;
    $('numParts').value = isNested() ? perOp[0] : parts.length;
    $('numReplicates').value = maxRep;
    renderNameInputs();
    if (!buildDataTable(false)) return;

    var seen = {};
    rows.forEach(function (r) {
      var o = String(r.operator).trim(), t = String(r.part).trim();
      var key = o + '\u0000' + t;
      var rep = r.replicate > 0 ? r.replicate - 1 : (seen[key] === undefined ? 0 : seen[key]);
      seen[key] = rep + 1;
      var inp = $('dataTable').querySelector(
        'input[data-op="' + cssEsc(o) + '"][data-part="' + cssEsc(t) + '"][data-rep="' + rep + '"]');
      if (inp) inp.value = String(r.value).trim();
    });
    validateLive();
    if (notes.length) showMessages($('configMsg'), [], notes);
    $('captureSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  /* Dataset de demostracion: apendice del manual AIAG MSA 4a ed. */
  var AIAG = [
    [0.29, 0.41, 0.64, 0.08, 0.25, 0.07, 0.04, -0.11, -0.15],
    [-0.56, -0.68, -0.58, -0.47, -1.22, -0.68, -1.38, -1.13, -0.96],
    [1.34, 1.17, 1.27, 1.19, 0.94, 1.34, 0.88, 1.09, 0.67],
    [0.47, 0.50, 0.64, 0.01, 1.03, 0.20, 0.14, 0.20, 0.11],
    [-0.80, -0.92, -0.84, -0.56, -1.20, -1.28, -1.46, -1.07, -1.45],
    [0.02, -0.11, -0.21, -0.20, 0.22, 0.06, -0.29, -0.67, -0.49],
    [0.59, 0.75, 0.66, 0.47, 0.55, 0.83, 0.02, 0.01, 0.21],
    [-0.31, -0.20, -0.17, -0.63, 0.08, -0.34, -0.46, -0.56, -0.49],
    [2.26, 1.99, 2.01, 1.80, 2.12, 2.19, 1.77, 1.45, 1.87],
    [-1.36, -1.25, -1.31, -1.68, -1.62, -1.50, -1.49, -1.77, -2.16]
  ];
  /* El boton de ejemplo carga el dataset que le toca al metodo activo.
     En el anidado son las MISMAS mediciones con las piezas renumeradas 1 a 30,
     para que ninguna la midan dos operadores: es el caso con el que se valida
     el motor anidado (ver tests/tests-nested.js). No es un estudio destructivo
     real, y por eso se dice en el aviso. */
  function loadDemo() {
    var rows = [], ops = ['Operador A', 'Operador B', 'Operador C'], nested = isNested();
    AIAG.forEach(function (vals, i) {
      ops.forEach(function (op, oi) {
        var part = nested ? ('Pieza ' + (oi * 10 + i + 1)) : ('Pieza ' + (i + 1));
        for (var k = 0; k < 3; k++) rows.push({ operator: op, part: part, value: vals[oi * 3 + k] });
      });
    });
    $('lsl').value = '-5'; $('usl').value = '5';
    $('tolerance').value = ''; $('processMean').value = ''; $('historicalSigma').value = '';
    loadPayload({ data: rows });
    if (nested) {
      showMessages($('configMsg'), [], ['Ejemplo cargado: son las mediciones del apendice del manual ' +
        'AIAG MSA 4a ed. con las piezas renumeradas 1 a 30, para que ninguna la midan dos operadores. ' +
        'Sirve para ver el metodo funcionando y para validar el motor; no es un estudio destructivo real.']);
    }
  }

  function clearData() {
    if (!confirm('Se borraran todas las mediciones capturadas. Continuar?')) return;
    inputs().forEach(function (i) { i.value = ''; });
    validateLive();
    $('resultsSection').hidden = true;
    resetResultViz();
    state.result = null;
  }

  function resetAll() {
    if (!confirm('Se reiniciara el estudio completo (configuracion y datos). Continuar?')) return;
    state = { method: state.method, operators: [], parts: [], partsByOperator: [],
              replicates: 2, result: null };
    $('numOperators').value = 3; $('numParts').value = 10; $('numReplicates').value = 3;
    $('studyName').value = ''; renderStudyName();
    $('lsl').value = ''; $('usl').value = '';
    $('tolerance').value = ''; $('processMean').value = ''; $('historicalSigma').value = '';
    $('alpha').value = '0.25'; $('interactionMode').value = 'auto';
    $('svMultiplier').value = '6'; $('fDenominator').value = 'interaction';
    renderNameInputs();
    validateConfig();
    $('captureSection').hidden = true;
    $('resultsSection').hidden = true;
    resetResultViz();
    clearMessages($('configMsg'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------------------------------------------ *
   * Reporte impreso
   * Imprimir la pagina tal cual sacaba solo la pestana abierta (cero
   * graficas), la tabla de captura con sus recuadros vacios y la barra de
   * herramientas. Aqui se arma el reporte: encabezado con el nombre del
   * estudio y sus parametros, y anexo con las mediciones como texto. El resto
   * (veredictos, tablas, graficas) es el mismo DOM de pantalla, repaginado por
   * la hoja de estilos de impresion.
   * ------------------------------------------------------------------ */
  var printRestore = null;

  function preparePrint() {
    if (printRestore) return;                       // ya preparado (Ctrl+P sobre el boton)
    var theme = currentTheme();
    // Los paneles ocultos hay que revelarlos ANTES de imprimir: un lienzo que
    // nunca estuvo visible se dibujo en 0x0 y saldria en blanco.
    var hiddenPanels = [].slice.call(document.querySelectorAll('.tab-panel[hidden]'));
    hiddenPanels.forEach(function (el) { el.hidden = false; });
    // El tema oscuro se imprimiria con fondos negros; los lienzos son mapas de
    // bits, asi que no basta con CSS: hay que redibujar en claro.
    if (theme === 'dark') applyTheme('light', false);
    buildPrintHeader();
    buildPrintAnnex();
    void document.body.offsetHeight;                // fuerza el reflujo antes de medir
    MSACharts.resizeAll();
    printRestore = function () {
      hiddenPanels.forEach(function (el) { el.hidden = true; });
      if (theme === 'dark') applyTheme('dark', false);
      MSACharts.resizeAll();
      printRestore = null;
    };
  }

  function restoreAfterPrint() { if (printRestore) printRestore(); }

  function buildPrintHeader() {
    var r = state.result;
    var name = studyName() || 'Estudio Gage R&R';
    var meta = [
      ['Fecha', new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })],
      ['Estudio', state.operators.length + ' operadores x ' + partsPerOperator() + ' ' +
        activeMethod().countLabel + ' x ' + state.replicates + ' replicas = ' +
        (state.operators.length * partsPerOperator() * state.replicates) + ' mediciones'],
      ['Especificacion', specLabel()],
      ['Multiplicador', $('svMultiplier').value + ' sigma'],
      ['Alfa', isNested() ? 'no aplica' : $('alpha').value],
      ['Modelo', r ? (r.model === 'nested' ? 'Anidado (sin interaccion estimable)'
                    : r.model === 'with-interaction' ? 'Con interaccion' : 'Sin interaccion (agrupada)') : '-'],
      ['% Study Variation (GRR)', r ? r.metrics.pctStudyVar.toFixed(2) + ' %' : '-'],
      ['Categorias distintas', r ? (r.ndc === null ? 'inf' : String(r.ndc)) : '-']
    ];
    $('printHeader').innerHTML =
      '<h1 class="rep-title">' + esc(name) + '</h1>' +
      '<p class="rep-sub">' + esc(methodById(document.documentElement.getAttribute('data-method')).badge) +
        ' &middot; MSA Toolkit</p>' +
      '<div class="rep-meta">' + meta.map(function (m) {
        return '<div><span>' + esc(m[0]) + '</span><strong>' + esc(m[1]) + '</strong></div>';
      }).join('') + '</div>';
  }

  function specLabel() {
    var tol = $('tolerance').value.trim();
    if (tol) return 'Tolerancia directa = ' + tol;
    var lsl = $('lsl').value.trim(), usl = $('usl').value.trim();
    if (lsl && usl) return 'LSL = ' + lsl + ' , USL = ' + usl;
    if (lsl) return 'LSL = ' + lsl + ' (unilateral)';
    if (usl) return 'USL = ' + usl + ' (unilateral)';
    return 'Sin especificacion';
  }

  function buildPrintAnnex() {
    var vals = readValues(), k = state.replicates;
    var h = '<h2>Anexo. Mediciones capturadas</h2><table><thead><tr>' +
      '<th class="txt">Operador</th><th class="txt">Pieza</th>';
    for (var i = 1; i <= k; i++) h += '<th>Replica ' + i + '</th>';
    h += '</tr></thead><tbody>';
    var n = 0;
    state.operators.forEach(function (op, oi) {
      partsOfOperator(oi).forEach(function (pt) {
        h += '<tr><td class="txt">' + esc(op) + '</td><td class="txt">' + esc(pt) + '</td>';
        for (var j = 0; j < k; j++) {
          var v = (vals[op + '\u0000' + pt + '\u0000' + j] || '').trim();
          if (v !== '') n++;
          h += '<td>' + esc(v || '-') + '</td>';
        }
        h += '</tr>';
      });
    });
    h += '</tbody></table><p class="annex-note">' + n + ' mediciones capturadas. ' +
      'Los calculos de este reporte salen exactamente de estos datos.</p>';
    $('printAnnex').innerHTML = h;
  }

  /* ------------------------------------------------------------------ *
   * Arranque
   * ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', function () {
    initTheme();
    initMethods();
    initTabs();
    renderNameInputs();
    renderStudyName();
    $('studyName').addEventListener('input', renderStudyName);
    CONFIG_FIELDS.forEach(function (f) {
      $(f.id).addEventListener('input', validateConfig);
    });
    ['numOperators', 'numParts'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        if (validateConfig()) renderNameInputs();
      });
    });
    $('generateBtn').addEventListener('click', function () { buildDataTable(true); });
    $('calcBtn').addEventListener('click', calculate);
    $('recalcBtn').addEventListener('click', calculate);
    $('demoBtn').addEventListener('click', loadDemo);
    $('clearDataBtn').addEventListener('click', clearData);
    $('resetBtn').addEventListener('click', resetAll);
    $('exportCsvBtn').addEventListener('click', exportCSV);
    $('printBtn').addEventListener('click', function () { preparePrint(); window.print(); });
    // Ctrl+P tambien debe salir como reporte, no como pantallazo de la app.
    window.addEventListener('beforeprint', preparePrint);
    window.addEventListener('afterprint', restoreAfterPrint);
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importFile(e.target.files[0]);
      e.target.value = '';
    });
    ['alpha', 'interactionMode', 'svMultiplier', 'fDenominator', 'lsl', 'usl', 'tolerance', 'processMean', 'historicalSigma']
      .forEach(function (id) {
        $(id).addEventListener('change', function () { if (state.result) calculate(); });
      });
  });
})();
