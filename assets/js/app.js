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
  /* `stamp` es la huella de TODO lo que entro en `result`: las celdas, el
     estandar, el metodo y los campos de opciones. Se compara con la huella de
     lo que hay ahora en pantalla para saber si el resultado sigue siendo de
     estos datos (F-05). null = no hay resultado del que dudar. */
  var state = { method: 'cruzado', operators: [], parts: [], partsByOperator: [],
                replicates: 2, result: null, stamp: null, standard: {} };

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
  /* IDIOMA. La interfaz esta en espanol; los NOMBRES DE ESTUDIO no, porque en
     una planta se conocen por su nombre en ingles: nadie pide un "ANOVA
     anidado", pide un Gage R&R nested. Lo mismo que ya se hacia con las
     metricas (% Study Variation, % Tolerance, NDC, ICC), que se dejan como las
     imprime Minitab para que un reporte se pueda contrastar renglon por
     renglon. El selector si va en espanol: ahi se esta eligiendo, no citando.

       Selector (espanol)   Badge del estudio (ingles)
       Cruzado              Gage R&R . Crossed ANOVA
       Anidado              Gage R&R . Nested ANOVA
       Atributos            Attribute Agreement Analysis           */
  var METHODS = [
    { id: 'cruzado', badge: 'Gage R&R \u00b7 Crossed ANOVA', available: true,
      engine: function () { return MSAAnova; },
      partsLabel: 'Piezas', partNamesLabel: 'Nombres de las piezas',
      countLabel: 'piezas',
      help: 'Gage R&R por ANOVA cruzado: cada operador mide las mismas piezas varias veces.' },
    { id: 'anidado', badge: 'Gage R&R \u00b7 Nested ANOVA', available: true,
      engine: function () { return MSANested; },
      partsLabel: 'Piezas por operador', partNamesLabel: 'Nombres de las piezas, por operador',
      countLabel: 'piezas por operador',
      help: 'Gage R&R anidado, para pruebas destructivas: cada operador mide sus propias piezas, ' +
            'tomadas de un lote homogeneo. La pieza se identifica por el par operador + pieza, asi ' +
            'que los numeros se pueden repetir entre operadores. El diseno no separa la interaccion ' +
            'operador x pieza.' },
    { id: 'atributos', badge: 'Attribute Agreement Analysis', available: true,
      engine: function () { return MSAAttribute; },
      partsLabel: 'Piezas', partNamesLabel: 'Nombres de las piezas',
      countLabel: 'piezas',
      help: 'Acuerdo entre evaluadores para datos de pasa / no pasa. Aqui no hay varianza que ' +
            'descomponer: se mide concordancia (porcentajes y kappa), no dispersion.' }
  ];

  function methodById(id) {
    for (var i = 0; i < METHODS.length; i++) if (METHODS[i].id === id) return METHODS[i];
    return METHODS[0];
  }
  function activeMethod() { return methodById(state.method); }
  function isNested() { return state.method === 'anidado'; }
  function isAttribute() { return state.method === 'atributos'; }

  /* Un elemento aplica al metodo si su lista lo incluye; sin lista, aplica a
     todos. Lo usan la visibilidad por metodo y el reporte impreso. */
  function appliesToMethod(el, id) {
    var list = el.getAttribute('data-methods');
    return !list || list.split(/[\s,]+/).indexOf(id) >= 0;
  }

  /* Muestra u oculta lo que es propio de un metodo.
     EXCEPCION: los paneles de resultados. Sobre su `hidden` mandan las
     pestanas -solo el panel activo se ve- y si aqui tambien se tocara, los dos
     sistemas se pelearian: al entrar a cruzado esto abriria Componentes y
     ANOVA a la vez, uno debajo del otro, porque los dos "aplican" al metodo.
     El panel de un metodo ajeno no necesita ocultarse aqui: su boton si esta
     oculto, y sin boton no hay manera de abrirlo. */
  function applyMethodVisibility(id) {
    [].slice.call(document.querySelectorAll('[data-methods]')).forEach(function (el) {
      if (el.classList.contains('tab-panel')) return;
      el.hidden = !appliesToMethod(el, id);
    });
  }

  /* Cambiar de metodo NO conserva la captura, y da igual entre cuales dos.
     La rejilla se ve igual (operadores x piezas x replicas), y esa es
     justamente la trampa: el mismo numero en la misma celda significa otra
     cosa en cada metodo. En el cruzado la fila 2 del operador B es LA MISMA
     pieza que midio el operador A; en el anidado es una pieza distinta que
     solo el midio; en atributos ni siquiera es un numero. Conservar el dato
     conserva el valor y cambia lo que dice, que es la peor de las dos
     opciones: el estudio sigue viendose valido y ya no lo es.

     Asi que se borra. Pero nunca en silencio: se pregunta antes, se dice
     cuantos datos se van, y cancelar deja todo exactamente como estaba. */
  function applyMethod(id, isUserAction) {
    var m = methodById(id);
    if (!m.available) m = METHODS[0];
    var changed = state.method !== m.id;

    /* Se pregunta ANTES de tocar nada. Si se cambia primero y se revierte
       despues, la pantalla parpadea entre los dos metodos y el usuario ve un
       cambio que dijo que no queria. */
    if (changed && isUserAction) {
      var n = capturedCount();
      if (n) {
        var BR = String.fromCharCode(10);
        if (!confirm('El estudio tiene ' + n + ' dato(s) capturado(s).' + BR + BR +
              'Cambiar de metodo los borra. La rejilla se ve igual en los tres, pero el mismo ' +
              'dato en la misma celda significa otra cosa en cada uno, asi que conservarlo daria ' +
              'un estudio que parece valido y no lo es.' + BR + BR + 'Continuar?')) {
          /* Si se llego por la direccion (#anidado), la barra ya cambio: hay
             que regresarla, o quedaria diciendo un metodo que no es el activo. */
          if (location.hash !== '#' + state.method) {
            try { history.replaceState(null, '', '#' + state.method); }
            catch (e) { location.hash = state.method; }
          }
          return state.method;
        }
      }
    }

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
    selectFirstVisibleTab();

    if (changed && isUserAction) {
      /* Antes, al pasar al anidado se tiraban los nombres de pieza si alguno
         se repetia entre operadores. Ya no hace falta (F-02): en el anidado
         la identidad es el par operador|pieza, asi que repetir "1" es legal.
         Tirarlos era ademas la unica parte del cambio de metodo que ocurria
         en silencio, sin decir que se perdia. */
      state.standard = {};
      renderNameInputs();
      if (!$('captureSection').hidden) {
        buildDataTable(false);          // sin preservar: la tabla nace vacia
        validateLive();
        showMessages($('configMsg'), [], [methodSwitchNote(m)]);
        state.result = null; state.stamp = null;
        $('resultsSection').hidden = true;
        resetResultViz();
        refreshStale();
      }
    }
    return m.id;
  }

  /** Cuantas celdas de captura traen algo escrito. */
  function capturedCount() {
    return inputs().filter(function (i) { return i.value.trim() !== ''; }).length;
  }

  /* Las pestanas de resultados no son las mismas en todos los metodos
     (Componentes/ANOVA contra Concordancia/Kappa). Si la activa se oculto al
     cambiar de metodo, el panel quedaria en blanco sin explicacion. */
  function selectFirstVisibleTab() {
    var buttons = [].slice.call(document.querySelectorAll('.tab-btn'));
    var visible = buttons.filter(function (b) { return !b.hidden; });
    if (!visible.length) return;
    var active = visible.filter(function (b) { return b.classList.contains('active'); });
    if (active.length) return;
    visible[0].click();
  }

  /* Al cambiar de metodo la tabla queda vacia. El aviso no dice "se borro" y
     ya: dice que supone el metodo nuevo, que es lo que hay que tener en la
     cabeza al recapturar. */
  function methodSwitchNote(m) {
    if (m.id === 'anidado') {
      return 'Metodo cambiado a anidado y tabla vaciada. El anidado supone que cada operador midio ' +
        'SUS PROPIAS piezas, tomadas de un lote homogeneo, porque medirlas las destruye. La pieza se ' +
        'identifica por el par operador + pieza, asi que puedes numerar las de cada operador 1..n: ' +
        'la "1" de uno y la "1" de otro se analizan como piezas distintas.';
    }
    if (m.id === 'atributos') {
      return 'Metodo cambiado a atributos y tabla vaciada. Aqui la celda no es un numero sino una ' +
        'categoria, y si conoces la clasificacion correcta de cada pieza puedes capturarla como ' +
        'estandar: sin el solo se sabe si los evaluadores coinciden, no si aciertan.';
    }
    return 'Metodo cambiado a cruzado y tabla vaciada. El cruzado supone que todos los operadores ' +
      'midieron LA MISMA pieza varias veces; si cada quien midio piezas distintas, el estudio es ' +
      'anidado.';
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
    /* El titulo sale del badge del metodo activo. Antes se armaba con un if
       de dos ramas, asi que en atributos la pestana decia "ANOVA cruzado". */
    document.title = (name ? name + ' - ' : '') + 'MSA Toolkit - ' + activeMethod().badge;
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

  function renderNameInputs() {
    var nOp = clamp(parseInt($('numOperators').value, 10), 2, 20, 3);
    var nPart = clamp(parseInt($('numParts').value, 10), 2, 50, 10);
    state.operators = defaultNames('Operador', nOp, state.operators);
    state.parts = defaultNames('Pieza', nPart, state.parts);
    /* La numeracion por omision corre de largo (1..30), que es como se etiqueta
       un lote del que se van sacando piezas. Es una SUGERENCIA, no un
       requisito: numerar 1..n dentro de cada operador tambien es valido, y es
       la convencion mas comun en destructivas. Ver F-02 y assets/js/design.js. */
    var prevByOperator = state.partsByOperator || [];
    state.partsByOperator = [];
    for (var o = 0; o < nOp; o++) {
      var prev = prevByOperator[o] || [];
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
  /* Las categorias del estudio, leidas del campo de configuracion. Se limpian
     y se quitan repetidas: escribir "Pasa, Pasa, No pasa" no crea tres. */
  function parseCategories() {
    var raw = ($('categories') ? $('categories').value : '') || '';
    var out = [];
    raw.split(',').forEach(function (c) {
      var t = c.trim();
      if (t && out.indexOf(t) < 0) out.push(t);
    });
    return out;
  }

  /* El desplegable de "categoria de rechazo" se rearma cuando cambian las
     categorias, conservando la eleccion si sigue existiendo. Solo tiene
     sentido con dos: con tres o mas no hay una decision binaria que juzgar.

     La primera opcion va VACIA y es la que queda mientras nadie elija. Antes
     se preseleccionaba cats[1] -la segunda categoria de la lista-, asi que un
     archivo importado, cuyas categorias salen en orden de aparicion en los
     datos, podia dejar elegido el lado equivocado sin decir nada: la fuga y
     la falsa alarma salian intercambiadas. No se adivina. */
  function renderRejectOptions() {
    var sel = $('rejectCategory');
    if (!sel) return;
    var cats = parseCategories(), prev = sel.value;
    sel.innerHTML = '<option value="">(elige cual es no conforme)</option>' +
      cats.map(function (c) {
        return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
      }).join('');
    sel.value = cats.indexOf(prev) >= 0 ? prev : '';
    sel.disabled = cats.length !== 2;
    sel.title = cats.length === 2
      ? 'Cual de las dos categorias significa pieza no conforme. Define que error es una fuga ' +
        '(dejarla pasar) y cual una falsa alarma (rechazar una buena). Sin esta eleccion no se ' +
        'calculan efectividad, fuga ni falsa alarma.'
      : 'Solo aplica con dos categorias: con mas no hay decision binaria que juzgar.';
    markRejectNeeded();
  }

  /* Marca el desplegable solo cuando la eleccion de verdad hace falta: metodo
     de atributos, dos categorias y estandar capturado. Sin estandar no hay
     efectividad ni errores que calcular, asi que pedirla seria ruido. */
  function markRejectNeeded() {
    var sel = $('rejectCategory');
    if (!sel) return;
    var need = isAttribute() && parseCategories().length === 2 && !sel.value &&
               Object.keys(readStandard()).length > 0;
    sel.classList.toggle('invalid', need);
    sel.setAttribute('aria-invalid', need ? 'true' : 'false');
  }

  /* El estandar es una propiedad de la pieza, asi que se captura una vez por
     pieza y no una vez por medicion. Vacio significa "no lo tengo", que es un
     estudio valido: se mide acuerdo entre evaluadores y nada mas. */
  function buildStandardTable() {
    var cats = parseCategories();
    var h = '<thead><tr><th class="col-part">Pieza</th>' +
            '<th class="col-meas">Clasificacion correcta</th></tr></thead><tbody>';
    state.parts.forEach(function (pt) {
      var cur = state.standard[pt] || '';
      h += '<tr><td class="col-part">' + esc(pt) + '</td><td class="col-meas">' +
           '<select data-std-part="' + esc(pt) + '" aria-label="Estandar de ' + esc(pt) + '">' +
           '<option value="">(sin estandar)</option>' +
           cats.map(function (c) {
             return '<option value="' + esc(c) + '"' + (c === cur ? ' selected' : '') + '>' +
                    esc(c) + '</option>';
           }).join('') +
           '</select></td></tr>';
    });
    $('standardTable').innerHTML = h + '</tbody>';
    [].slice.call($('standardTable').querySelectorAll('select')).forEach(function (sel) {
      sel.addEventListener('change', function () {
        state.standard[sel.dataset.stdPart] = sel.value;
        validateLive();
      });
    });
  }

  function readStandard() {
    var map = {};
    if (!isAttribute()) return map;
    [].slice.call($('standardTable').querySelectorAll('select')).forEach(function (sel) {
      if (sel.value) map[sel.dataset.stdPart] = sel.value;
    });
    return map;
  }

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
    /* Nombres repetidos. Que cuenta como repetido depende del metodo, y ahi
       estaba F-02: en el anidado la identidad de una pieza es el par
       operador|pieza, asi que "1" bajo Ana y "1" bajo Beto son dos piezas
       distintas y la captura es legal. Solo repetir un nombre DENTRO del
       mismo operador es un error, porque ahi si serian la misma celda.
       En el cruzado, en cambio, la lista de piezas es una sola y compartida:
       cualquier repeticion es un error. */
    var dup = firstDuplicate(ops) ||
              (isNested() ? firstDuplicateWithin(state.partsByOperator)
                          : firstDuplicate(state.parts));
    if (dup) {
      showMessages($('configMsg'), [isNested()
        ? 'Hay nombres repetidos ("' + dup + '") dentro de un mismo operador. Cada operador tiene ' +
          'que poder distinguir sus propias piezas; entre operadores si se pueden repetir.'
        : 'Hay nombres repetidos ("' + dup + '"). Cada operador y cada pieza debe tener un nombre unico.'], []);
      return false;
    }
    clearMessages($('configMsg'));
    /* Repetidos ENTRE operadores: legal, y se dice lo que significa antes de
       capturar, no despues de calcular. Los dos textos salen de design.js. */
    if (isNested()) {
      var notes = MSADesign.repeatedLabelNotes(MSADesign.observe(state.partsByOperator));
      if (notes.length) showMessages($('configMsg'), [], notes);
    }

    // Clases explicitas por columna. No dependemos de :first-child, que alineaba
    // distinto la primera fila de cada operador: ahi la celda de pieza es el
    // segundo hijo, porque el th del operador ocupa el primero.
    var thead = '<thead><tr><th class="col-op">Operador</th><th class="col-part">Pieza</th>';
    for (var k = 1; k <= state.replicates; k++) {
      thead += '<th class="col-meas">Replica ' + k + '</th>';
    }
    thead += '</tr></thead>';

    var cats = parseCategories();
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
          var attrs = ' data-op="' + esc(op) + '" data-part="' + esc(pt) + '" data-rep="' + k +
                      '" data-oi="' + oi + '" data-pi="' + pi + '" aria-label="' +
                      esc(op + ', ' + pt + ', replica ' + (k + 1)) + '"';
          body += '<td class="col-meas">' + (isAttribute()
            ? '<select' + attrs + '><option value=""></option>' +
              cats.map(function (c) {
                return '<option value="' + esc(c) + '"' + (c === v ? ' selected' : '') + '>' +
                       esc(c) + '</option>';
              }).join('') + '</select>'
            : '<input type="text" inputmode="decimal"' + attrs + ' value="' + esc(v) + '">') +
            '</td>';
        }
        body += '</tr>';
      });
    });
    body += '</tbody>';

    $('dataTable').innerHTML = thead + body;
    if (isAttribute()) buildStandardTable();
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
  /** El primer nombre repetido DENTRO de algun grupo. Entre grupos no mira. */
  function firstDuplicateWithin(groups) {
    for (var i = 0; i < groups.length; i++) {
      var d = firstDuplicate(groups[i] || []);
      if (d) return d;
    }
    return null;
  }
  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* Las celdas de captura. En atributos son desplegables y no cajas de texto,
     pero comparten lo que el resto del codigo usa de ellas: value, dataset y
     classList, asi que leer, reubicar por posicion y validar siguen
     funcionando sin saber cual de los dos es. */
  function inputs() { return [].slice.call($('dataTable').querySelectorAll('input, select')); }

  function readValues() {
    var map = {};
    inputs().forEach(function (i) {
      map[i.dataset.op + '\u0000' + i.dataset.part + '\u0000' + i.dataset.rep] = i.value;
    });
    return map;
  }

  /** Pegar un bloque desde Excel: rellena hacia abajo y a la derecha. */
  function wirePaste() {
    inputs().forEach(function (inp) {
      /* Pegar un bloque solo aplica a las cajas de texto. En atributos la
         celda es un desplegable: no hay donde pegar, y el navegador ya
         resuelve escribir la inicial para elegir. */
      if (inp.tagName !== 'INPUT') return;
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
    inputs().forEach(function (i) {
      i.addEventListener('input', validateLive);
      if (i.tagName === 'SELECT') i.addEventListener('change', validateLive);
    });
  }

  function collectRows() {
    /* En atributos el valor es una categoria: no se toca. En los metodos de
       variables se admite coma decimal y se normaliza a punto. */
    var attr = isAttribute(), std = attr ? readStandard() : null;
    return inputs().map(function (i) {
      var row = { operator: i.dataset.op, part: i.dataset.part,
                  replicate: Number(i.dataset.rep) + 1,
                  value: attr ? i.value.trim() : i.value.trim().replace(',', '.') };
      if (attr && std[row.part]) row.standard = std[row.part];
      return row;
    });
  }

  /* ------------------------------------------------------------------ *
   * F-05 - Un resultado deja de valer en cuanto cambian sus datos
   *
   * Editar una celda disparaba validateLive(), que solo movia el contador y
   * el boton. `state.result` seguia ahi, el panel seguia visible y el rotulo
   * decia "actualizado al escribir". Al imprimir, el encabezado y las tablas
   * salian del resultado VIEJO mientras el anexo se armaba leyendo el DOM
   * ACTUAL, y el anexo cerraba afirmando que "los calculos de este reporte
   * salen exactamente de estos datos". En ese escenario la frase es falsa, en
   * un documento que sirve para liberar un instrumento.
   *
   * Los campos de opciones (alfa, LSL/USL, multiplicador...) si recalculaban
   * al cambiar; las celdas de medicion no. La huella cubre los dos, para que
   * no haya una tercera cosa que se olvide manana.
   * ------------------------------------------------------------------ */
  var STAMP_FIELDS = ['alpha', 'interactionMode', 'svMultiplier', 'fDenominator',
                      'lsl', 'usl', 'tolerance', 'processMean', 'historicalSigma',
                      'categories', 'rejectCategory'];

  /** Huella de lo que hay AHORA en pantalla. Barata: solo lee valores. */
  function captureStamp() {
    var parts = [state.method];
    inputs().forEach(function (i) {
      parts.push(i.dataset.op + '\u0001' + i.dataset.part + '\u0001' + i.dataset.rep +
                 '\u0001' + i.value.trim());
    });
    if (isAttribute()) {
      var std = readStandard();
      Object.keys(std).sort().forEach(function (k) { parts.push('std:' + k + '\u0001' + std[k]); });
    }
    STAMP_FIELDS.forEach(function (id) {
      var el = $(id);
      if (el) parts.push(id + '\u0001' + el.value);
    });
    return parts.join('\u0002');
  }

  /** true si hay un resultado publicado y ya no corresponde a lo capturado. */
  function resultIsStale() {
    return !!(state.result && state.stamp !== null && captureStamp() !== state.stamp);
  }

  /* Se dice, se atenua y se bloquea la impresion. No se borra el resultado:
     esconder unos numeros que alguien acaba de mirar confunde mas que
     atenuarlos, y recalcular esta a un clic dentro del propio aviso. */
  function refreshStale() {
    var stale = resultIsStale();
    var banner = $('resultStale'), body = $('resultBody'), live = $('resultsLive');
    if (banner) banner.hidden = !stale;
    if (body) body.classList.toggle('stale', stale);
    if (live) {
      live.classList.toggle('stale', stale);
      live.textContent = stale ? 'resultados desactualizados - pulsa Recalcular'
                               : 'se recalcula al pulsar Calcular';
    }
    var print = $('printBtn');
    if (print) {
      print.disabled = stale;
      print.title = stale
        ? 'Los datos cambiaron despues de calcular. Recalcula antes de imprimir: el reporte ' +
          'mezclaria el resultado viejo con las mediciones nuevas.'
        : '';
    }
    return stale;
  }

  function validateLive() {
    /* En atributos no hay nada que validar como numero: la celda solo puede
       tener una de las categorias, porque es un desplegable. Lo unico que se
       comprueba es que este contestada. */
    var attr = isAttribute();
    var bad = 0;
    inputs().forEach(function (i) {
      if (attr) { i.classList.remove('invalid'); return; }
      var v = i.value.trim().replace(',', '.');
      var ok = v === '' || isFinite(Number(v));
      i.classList.toggle('invalid', !ok);
      if (!ok) bad++;
    });
    var empty = inputs().filter(function (i) { return i.value.trim() === ''; }).length;
    $('calcBtn').disabled = bad > 0 || empty > 0;

    var msg;
    if (bad > 0) msg = bad + ' valor(es) no numerico(s)';
    else if (empty > 0) msg = empty + (attr ? ' clasificacion(es) por capturar' : ' celda(s) por capturar');
    else msg = 'Datos completos';
    /* El estandar es opcional, asi que no bloquea el calculo; pero a medias no
       sirve, y conviene decirlo mientras se captura y no al final. */
    if (attr && !empty && !bad) {
      var std = readStandard(), n = Object.keys(std).length;
      if (n > 0 && n < state.parts.length) {
        msg = 'Datos completos, estandar a medias (' + n + ' de ' + state.parts.length + ')';
      } else if (n > 0 && parseCategories().length === 2 && !$('rejectCategory').value) {
        msg = 'Datos completos, falta elegir la categoria de rechazo';
      }
    }
    if (attr) markRejectNeeded();
    refreshStale();                 // F-05: el resultado publicado puede haber caducado
    $('captureStatus').textContent = msg;
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
      state.result = null; state.stamp = null; refreshStale();
      return;
    }
    var opts;
    if (isAttribute()) {
      /* Atributos no usa nada de la caja de especificaciones: no hay
         tolerancia contra la cual comparar una dispersion que no existe. */
      opts = { categories: parseCategories(), rejectCategory: $('rejectCategory').value };
    } else {
      opts = {
        studyVarMultiplier: Number($('svMultiplier').value),
        lsl: specs.values.lsl, usl: specs.values.usl,
        tolerance: specs.values.tolerance,
        processMean: specs.values.processMean,
        historicalSigma: specs.values.historicalSigma
      };
    }
    // Alfa, interaccion y denominador de F solo existen en el cruzado: sin
    // interaccion estimable no hay nada que probar, agrupar ni elegir.
    if (!isNested() && !isAttribute()) {
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
      state.result = null; state.stamp = null; refreshStale();
      return;
    }
    /* F-06 tambien por la via manual: escribir 0/1 en la rejilla no pasa por
       la importacion, y el ANOVA de una variable binaria es igual de vacio.
       Aqui ya no se puede preguntar -- el calculo se pidio -- asi que se
       avisa junto al resultado, que es donde alguien lo va a leer. */
    if (!isAttribute()) {
      var coded = MSADesign.looksCoded(rows);
      if (coded) {
        result.warnings = result.warnings.concat([
          'Los datos traen solo ' + coded.levels + ' valores distintos, todos enteros (' +
          coded.values.join(', ') + '). Si son un pasa / no pasa codificado, este %GRR no ' +
          'significa nada: la varianza de una variable binaria no mide dispersion de medicion. ' +
          'Para ese caso el metodo es Atributos (concordancia). Si de verdad son mediciones de ' +
          'escala corta, revisa ademas la resolucion del instrumento.']);
      }
    }

    state.result = result;
    /* El sello se toma DESPUES de calcular y de las mismas fuentes que
       alimentaron el calculo: a partir de aqui, cualquier edicion lo rompe. */
    state.stamp = captureStamp();
    $('resultsSection').hidden = false;
    $('resultBody').hidden = false;
    showMessages($('resultMsg'), [], result.warnings);
    /* Cada familia de metodos trae su propia vista de resultados, porque no
       publican la misma forma de respuesta: variables dan componentes de
       varianza, atributos da concordancias. El resto de la pantalla -pasos,
       tarjetas, pestanas, impresion- es el mismo para los dos. */
    if (result.model === 'attribute') {
      renderAttributeVerdict(result);
      renderAttributeBars(result);
      renderAttributeTables(result);
    } else {
      renderVerdict(result);
      renderEvalBars(result);
      renderTables(result);
    }
    MSACharts.render(result);
    refreshStale();                 // deja el panel y el boton de imprimir en su sitio
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
        'identicas, el problema es la muestra. "No evaluable" significa que la varianza del sistema de ' +
        'medicion salio cero o indistinguible de cero: el cociente no se puede calcular, y eso NO quiere ' +
        'decir que separe infinitas categorias.',
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
      card('Categorias distintas', r.ndcLabel, a.ndc, VERDICT_HELP.ndc),
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
    /* Sobre datos degenerados no se pintan barras. Un 0.00 % en verde con la
       leyenda "bueno" es la lectura mas enganosa que puede dar la pantalla
       cuando lo que hay detras es un estudio sin informacion. */
    if (r.inconclusive) {
      $('evalBars').innerHTML = '<div class="msg warn" style="margin:0">' +
        '<strong>Estudio no concluyente.</strong> Los datos no contienen informacion suficiente ' +
        'para estimar la repetibilidad: las ' + r.design.n + ' mediciones son el mismo valor. ' +
        'No se emite veredicto porque no hay nada que juzgar; revisa las notas.</div>';
      return;
    }
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
      r.ndc === null
        ? 'NDC = parte entera de 1.41 x (sigma_pieza / sigma_GageR&R). No evaluable: la varianza ' +
          'del sistema de medicion salio cero o indistinguible de cero, y ese cociente no significa ' +
          'nada. No es que el sistema separe infinitas categorias.'
        : 'NDC = parte entera de 1.41 x (sigma_pieza / sigma_GageR&R) = ' +
          r.ndcRaw.toFixed(3) + ' -> ' + r.ndcLabel + '.'
    ];
    /* Escalon observado en los datos. Es un dato del estudio, no un aviso: se
       publica siempre que se pueda medir, y el aviso solo aparece si pasa del
       criterio. Se le llama "observado" y no "resolucion del instrumento" a
       proposito: los datos demuestran con que finura se ANOTARON las lecturas,
       no cuanto resuelve el equipo. */
    var d = r.discrimination;
    if (d) {
      var lim = (100 * d.limit).toFixed(0);
      if (d.step !== null) {
        notes.push('Escalon observado en los datos (resolucion aparente) = ' + num(d.step, 8) +
          ', tomado como la ' + d.stepSource + '. Equivale a ' +
          (d.overStudyVar === null ? '-' : (100 * d.overStudyVar).toFixed(2) + ' % de la variacion del estudio') +
          (d.overTolerance === null
            ? ' (sin tolerancia capturada, ese segundo criterio no se evalua)'
            : ' y a ' + (100 * d.overTolerance).toFixed(2) + ' % de la tolerancia') +
          '. La regla de discriminacion AIAG pide que no pase del ' + lim + ' % de ninguno de los ' +
          'dos, y basta con rebasar uno para marcarlo. No es la resolucion nominal del instrumento: ' +
          'es la finura con que se anotaron estas lecturas. Valores distintos en el estudio: ' +
          d.distinctValues + ' de ' + d.measurements + '.');
      } else {
        notes.push('Escalon observado en los datos: ' + d.stepSource + '. En ' + d.zeroRangeCells +
          ' de las ' + d.cells + ' celdas operador-pieza todas las replicas dieron la misma lectura, ' +
          'asi que ningun escalon se puede deducir de estos datos. Valores distintos en el estudio: ' +
          d.distinctValues + ' de ' + d.measurements + '.');
      }
    }
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
   * Resultados del metodo de atributos
   *
   * Es la mitad de la pantalla que NO se comparte con los otros dos metodos,
   * y es asi porque no publican la misma forma de respuesta: alla componentes
   * de varianza, aqui concordancias. El marco -pasos, tarjetas, pestanas,
   * reporte impreso- si es el mismo.
   * ------------------------------------------------------------------ */
  function pc(v) { return v === null || v === undefined || !isFinite(v) ? '-' : v.toFixed(2) + ' %'; }
  function kfmt(v) { return v === null || v === undefined || !isFinite(v) ? '-' : v.toFixed(4); }
  function ci(a) { return '[' + a.ciLow.toFixed(1) + ', ' + a.ciHigh.toFixed(1) + ']'; }

  var ATTR_HELP = {
    within: 'Que porcentaje de las piezas clasifico igual el evaluador en TODAS sus replicas. Es la ' +
        'repetibilidad del atributo: mide si se contradice a si mismo, no si acierta. Se reporta el ' +
        'peor evaluador, no el promedio.',
    between: 'Que porcentaje de las piezas recibio la MISMA clasificacion de todos los evaluadores en ' +
        'todas sus replicas. Es la reproducibilidad. Sin estandar, es lo maximo que el estudio alcanza ' +
        'a decir.',
    vsStd: 'Que porcentaje de las piezas clasificaron todos los evaluadores, en todas sus replicas, ' +
        'igual que el estandar. Coincidir no es acertar: este numero es el que de verdad importa.',
    kappa: 'Acuerdo descontando el que se explica por azar. Delata el lote desbalanceado: contestar ' +
        'siempre "pasa" en un lote 90 % bueno acierta el 90 % sin mirar, y kappa lo baja a cero. ' +
        'Referencia: mas de 0.75 buen acuerdo, menos de 0.40 pobre.',
    effective: 'Porcentaje de piezas que el evaluador clasifico correctamente en todas sus replicas. ' +
        'AIAG: 90 % o mas aceptable, menos de 80 % inaceptable. Se reporta el peor evaluador.',
    miss: 'De todas las decisiones tomadas sobre piezas NO conformes, que porcentaje las dejo pasar. ' +
        'Es el error que llega al cliente, por eso su umbral es el mas estricto: 2 %. Se reporta el ' +
        'peor evaluador. Cual categoria es el rechazo lo eliges tu en la configuracion: de esa ' +
        'eleccion depende cual de los dos errores es cual.',
    falseAlarm: 'De todas las decisiones tomadas sobre piezas conformes, que porcentaje las rechazo. ' +
        'Cuesta scrap y retrabajo, pero no sale de la planta: umbral 5 %. Se reporta el peor ' +
        'evaluador. Cual categoria es el rechazo lo eliges tu en la configuracion: de esa eleccion ' +
        'depende cual de los dos errores es cual.'
  };

  function renderAttributeVerdict(r) {
    var m = r.metrics, a = r.assessment, cards = [];

    if (m.worstWithin !== null) {
      cards.push(card('Dentro del evaluador (peor)', pc(m.worstWithin), a.within, ATTR_HELP.within));
    }
    if (m.allVsStandard !== null) {
      cards.push(card('Todos vs estandar', pc(m.allVsStandard), a.allVsStandard, ATTR_HELP.vsStd));
    }
    cards.push(card('Entre evaluadores', pc(m.between), a.between, ATTR_HELP.between));
    cards.push(card('Kappa (' + m.kappaSource + ')', kfmt(m.kappa), a.kappa, ATTR_HELP.kappa));

    if (m.worstEffectiveness !== null) {
      cards.push(card('Efectividad (peor)', pc(m.worstEffectiveness), a.effectiveness, ATTR_HELP.effective));
    }
    /* Las dos tarjetas de error llevan en el titulo LA CATEGORIA, no solo el
       nombre del error. Un "Error de fuga: 6.7 %" a secas obliga a bajar hasta
       la nota de la Tabla 4 para saber que lado del proceso es cual, y esas
       dos tarjetas son justamente las que se leen para decidir. */
    if (m.worstMiss !== null) {
      cards.push(card('Fuga: dejar pasar "' + r.meta.rejectCategory + '"',
                      pc(m.worstMiss), a.missRate, ATTR_HELP.miss));
      cards.push(card('Falsa alarma: rechazar "' + r.meta.acceptCategory + '"',
                      pc(m.worstFalseAlarm), a.falseAlarmRate, ATTR_HELP.falseAlarm));
    }
    $('verdicts').innerHTML = cards.join('');
  }

  /* Barras por evaluador. Cada una lleva su intervalo de confianza dibujado
     encima, porque con 20 o 30 piezas el porcentaje solo enganaria: un 95 %
     que va de 75 a 99 no es un 95 % firme. */
  function renderAttributeBars(r) {
    var rows = [];
    r.withinAppraiser.forEach(function (a) {
      rows.push({ label: a.operator + ' - consigo mismo', a: a, help: ATTR_HELP.within });
    });
    r.vsStandard.forEach(function (a) {
      rows.push({ label: a.operator + ' - contra el estandar', a: a, help: ATTR_HELP.vsStd });
    });
    if (!rows.length) { $('attrBars').innerHTML = ''; return; }

    $('attrBars').innerHTML = rows.map(function (row) {
      var v = row.a.pct;
      var lvl = v >= 90 ? 'ok' : v >= 80 ? 'warn' : 'bad';
      var tip = row.label + ': ' + v.toFixed(2) + ' % (' + row.a.matched + ' de ' + row.a.inspected +
                ' piezas), intervalo de confianza al 95 % ' + ci(row.a) + '. ' + row.help;
      return '<div class="eval-row" title="' + esc(tip) + '">' +
        '<div class="eval-label">' + esc(row.label) + '</div>' +
        '<div class="eval-track">' +
          '<div class="eval-fill ' + lvl + '" style="width:' + Math.min(100, v).toFixed(2) + '%"></div>' +
          evalTick(80, 'warn') + evalTick(90, 'ok') +
        '</div>' +
        '<div class="eval-val">' + v.toFixed(1) + ' %</div>' +
      '</div>';
    }).join('');
  }

  function renderAttributeTables(r) {
    var rowHtml = function (a, name) {
      return '<tr><td>' + esc(name) + '</td>' +
        '<td class="num">' + a.inspected + '</td>' +
        '<td class="num">' + a.matched + '</td>' +
        '<td class="num">' + pc(a.pct) + '</td>' +
        '<td class="num">' + ci(a) + '</td>' +
        '<td>' + (a.assessment ? '<span class="t ' + a.assessment.level + '">' +
                  esc(a.assessment.label) + '</span>' : '') + '</td></tr>';
    };
    var head = function (cap, first) {
      return '<caption>' + cap + '</caption><thead><tr><th>' + first + '</th>' +
        '<th class="num">Piezas</th><th class="num">Concordantes</th><th class="num">%</th>' +
        '<th class="num">IC 95 %</th><th>Criterio</th></tr></thead><tbody>';
    };

    /* Tabla 1. Dentro del evaluador */
    if (r.withinAppraiser.length) {
      var t1 = head('Tabla 1. Concordancia dentro del evaluador (se repite a si mismo)', 'Evaluador');
      r.withinAppraiser.forEach(function (a) { t1 += rowHtml(a, a.operator); });
      $('agreeWithinTable').innerHTML = t1 + '</tbody>';
    } else {
      $('agreeWithinTable').innerHTML = '<caption>Tabla 1. Concordancia dentro del evaluador</caption>' +
        '<tbody><tr><td>Con una sola replica no se puede medir.</td></tr></tbody>';
    }

    /* Tabla 2. Contra el estandar */
    if (r.vsStandard.length) {
      var t2 = head('Tabla 2. Cada evaluador contra el estandar (se repite y ademas acierta)', 'Evaluador');
      r.vsStandard.forEach(function (a) { t2 += rowHtml(a, a.operator); });
      $('agreeStdTable').innerHTML = t2 + '</tbody>';
    } else {
      $('agreeStdTable').innerHTML = '<caption>Tabla 2. Contra el estandar</caption><tbody><tr><td>' +
        'El estudio no trae estandar: no se puede saber si aciertan, solo si coinciden.' +
        '</td></tr></tbody>';
    }

    /* Tabla 3. Global */
    var t3 = head('Tabla 3. Concordancia global', 'Concordancia');
    t3 += rowHtml(r.betweenAppraisers, 'Entre evaluadores');
    if (r.allVsStandard) t3 += rowHtml(r.allVsStandard, 'Todos contra el estandar');
    $('agreeAllTable').innerHTML = t3 + '</tbody>';

    /* Tabla 4. Los dos errores */
    if (r.effectiveness.length) {
      var t4 = '<caption>Tabla 4. Efectividad y los dos errores de inspeccion</caption><thead><tr>' +
        '<th>Evaluador</th><th class="num">Efectividad</th><th class="num">Error de fuga</th>' +
        '<th class="num">Falsa alarma</th></tr></thead><tbody>';
      r.effectiveness.forEach(function (e) {
        var cellOf = function (v, t, extra) {
          return '<td class="num">' + pc(v) +
            (t ? ' <span class="t ' + t.level + '">' + esc(t.level === 'ok' ? 'ok' :
                 t.level === 'warn' ? 'marginal' : 'malo') + '</span>' : '') +
            (extra ? '<br><span style="font-size:11px;font-weight:400">' + esc(extra) + '</span>' : '') +
            '</td>';
        };
        t4 += '<tr><td>' + esc(e.operator) + '</td>' +
          cellOf(e.effectiveness, e.assessment.effectiveness, e.correct + ' de ' + e.inspected + ' piezas') +
          cellOf(e.missRate, e.assessment.missRate, e.missed + ' de ' + e.rejectDecisions + ' decisiones') +
          cellOf(e.falseAlarmRate, e.assessment.falseAlarmRate,
                 e.falseAlarms + ' de ' + e.acceptDecisions + ' decisiones') +
          '</tr>';
      });
      $('errorRateTable').innerHTML = t4 + '</tbody>';
      $('agreeNote').innerHTML = 'Nota. Una pieza cuenta como concordante solo si TODAS las ' +
        'clasificaciones coinciden: dos aciertos y un fallo valen cero, no dos tercios. ' +
        'Rechazo = "' + esc(r.meta.rejectCategory) + '", conforme = "' + esc(r.meta.acceptCategory) +
        '". Los umbrales de fuga (2 %) y falsa alarma (5 %) son distintos a proposito: dejar pasar ' +
        'una pieza mala le llega al cliente, rechazar una buena se queda en la planta.';
    } else {
      $('errorRateTable').innerHTML = '';
      $('agreeNote').innerHTML = 'Nota. Una pieza cuenta como concordante solo si TODAS las ' +
        'clasificaciones coinciden. La efectividad, el error de fuga y la falsa alarma necesitan ' +
        'estandar y escala binaria; por eso no aparecen aqui.';
    }

    renderKappaTables(r);
  }

  function kappaRow(name, e) {
    if (!e || e.kappa === null || e.kappa === undefined) {
      return '<tr><td>' + esc(name) + '</td><td class="num">-</td><td class="num">-</td>' +
             '<td class="num">-</td><td class="num">-</td><td></td></tr>';
    }
    return '<tr><td>' + esc(name) + '</td>' +
      '<td class="num">' + kfmt(e.kappa) + '</td>' +
      '<td class="num">' + kfmt(e.se) + '</td>' +
      '<td class="num">' + (e.z === null ? '-' : e.z.toFixed(3)) + '</td>' +
      '<td class="num">' + pval(e.p) + '</td>' +
      '<td>' + (e.level ? '<span class="t ' + e.level + '">' +
        esc(e.level === 'ok' ? 'buen acuerdo' : e.level === 'warn' ? 'marginal' : 'pobre') +
        '</span>' : '') + '</td></tr>';
  }

  function renderKappaTables(r) {
    var head = function (cap, first) {
      return '<caption>' + cap + '</caption><thead><tr><th>' + first + '</th>' +
        '<th class="num">Kappa</th><th class="num">Error estandar</th><th class="num">z</th>' +
        '<th class="num">p</th><th>Criterio</th></tr></thead><tbody>';
    };

    if (r.kappaVsStandard.length) {
      var t1 = head('Tabla 5. Kappa de Cohen contra el estandar', 'Evaluador');
      r.kappaVsStandard.forEach(function (k) {
        t1 += kappaRow(k.operator, k.overall);
        k.byCategory.forEach(function (c) {
          t1 += kappaRow('    ' + k.operator + ' - ' + c.category, c);
        });
      });
      if (r.kappaAllVsStandard) t1 += kappaRow('Todos los evaluadores', r.kappaAllVsStandard.overall);
      $('kappaStdTable').innerHTML = t1 + '</tbody>';
    } else {
      $('kappaStdTable').innerHTML = '<caption>Tabla 5. Kappa contra el estandar</caption><tbody>' +
        '<tr><td>El estudio no trae estandar.</td></tr></tbody>';
    }

    if (r.kappaBetween) {
      var t2 = head('Tabla 6. Kappa de Fleiss entre evaluadores', 'Categoria');
      t2 += kappaRow('Global', r.kappaBetween.overall);
      r.kappaBetween.byCategory.forEach(function (c) { t2 += kappaRow(c.category, c); });
      $('kappaBetweenTable').innerHTML = t2 + '</tbody>';
    } else {
      $('kappaBetweenTable').innerHTML = '<caption>Tabla 6. Kappa entre evaluadores</caption><tbody>' +
        '<tr><td>Con un solo evaluador no hay acuerdo entre evaluadores que medir.</td></tr></tbody>';
    }

    $('kappaNote').innerHTML = 'Nota. Kappa mide el acuerdo que queda despues de descontar el que se ' +
      'explica por azar: 1 es acuerdo perfecto, 0 es el que daria contestar al aventon, y negativo es ' +
      'peor que el azar. El error estandar y el valor p son los de la hipotesis nula kappa = 0, es ' +
      'decir "no hay mas acuerdo del que da la casualidad". Contra el estandar se usa kappa de Cohen ' +
      '(dos juicios por decision: el del evaluador y la verdad); entre evaluadores, kappa de Fleiss, ' +
      'que admite varios jueces por pieza.';
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
    /* La columna de estandar solo aparece en atributos, y solo si el estudio
       lo trae: una columna vacia en todos los renglones es una columna que
       alguien va a tener que explicar. El resto del formato no cambia, asi
       que un archivo de variables se sigue leyendo igual que siempre. */
    var std = isAttribute() ? readStandard() : {};
    var withStd = Object.keys(std).length > 0;
    var lines = ['operador,pieza,replica,' + (isAttribute() ? 'clasificacion' : 'medicion') +
                 (withStd ? ',estandar' : '')];
    state.operators.forEach(function (op, oi) {
      partsOfOperator(oi).forEach(function (pt) {
        for (var k = 0; k < state.replicates; k++) {
          var cells = [csvCell(op), csvCell(pt), k + 1,
                       csvCell((vals[op + '\u0000' + pt + '\u0000' + k] || '').trim())];
          if (withStd) cells.push(csvCell(std[pt] || ''));
          lines.push(cells.join(','));
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
    var iVal = idxOf(head, ['medicion', 'medición', 'valor', 'value', 'measurement',
                            'clasificacion', 'clasificación', 'categoria', 'categoría', 'rating']);
    var iStd = idxOf(head, ['estandar', 'estándar', 'standard', 'referencia', 'reference', 'verdad']);
    var iRep = idxOf(head, ['replica', 'réplica', 'replicate', 'repeticion', 'repetición']);
    if (iOp < 0 || iPt < 0 || iVal < 0) {
      throw new Error('se esperan columnas operador, pieza y medicion o clasificacion ' +
                      '(encabezado leido: ' + head.join(', ') + ')');
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
      if (iStd >= 0 && (c[iStd] || '').trim()) row.standard = (c[iStd] || '').trim();
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

  /* Antes de mirar el diseno hay que mirar el TIPO de dato: si las mediciones
     no son numeros, no es un estudio de variables por mucho que las piezas se
     repartan como cruzado. Se pide mayoria clara para no confundir un archivo
     numerico con dos celdas mal escritas. */
  function looksCategorical(rows) {
    var n = 0, text = 0;
    rows.forEach(function (r) {
      var v = String(r.value === undefined || r.value === null ? '' : r.value).trim();
      if (!v) return;
      n++;
      if (!isFinite(Number(v.replace(',', '.')))) text++;
    });
    return n > 0 && text / n > 0.8;
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

    /* A que metodo va este archivo. La decision entera vive en design.js, sin
       DOM, y aqui solo se aplica: era estar pegada al DOM lo que hacia que la
       unica manera de ver F-02 fuera abrir el navegador e importar.

       Lo que cambio con F-02: el metodo que el archivo DECLARA (campo
       `method`, o su `format`) manda sobre lo que sugieran los nombres de las
       piezas, y ningun cambio de metodo se deduce ya en silencio de esos
       nombres. Lo que se deduce, se pregunta. */
    var categorical = looksCategorical(rows);
    var routed = MSADesign.route({
      activeMethod: state.method,
      explicitMethod: MSADesign.methodOfPayload(p),
      observed: MSADesign.observe(partsByOp),
      categorical: categorical,
      /* F-06: numeros con dos o tres niveles enteros tienen la forma de un
         pasa / no pasa codificado. No decide nada: hace que se pregunte. */
      coded: categorical ? null : MSADesign.looksCoded(rows),
      isAvailable: function (id) { return methodById(id).available; }
    });
    var notes = routed.notes.slice();
    if (routed.changed) applyMethod(routed.method, false);
    if (routed.question && confirm(routed.question)) {
      applyMethod(routed.proposal, false);
      notes.push('Metodo cambiado a ' + routed.proposal + ' porque lo confirmaste al importar. ' +
                 'El archivo no declaraba metodo.');
    } else if (routed.question) {
      /* Cancelar es una respuesta, no un silencio: queda dicho con que
         supuesto se sigue y que pasa si el supuesto es el equivocado. */
      notes.push(routed.codedNote ||
                 'Se conservo el metodo ' + state.method + ': el archivo no declara metodo y los ' +
                 'nombres de las piezas no bastan para deducirlo.');
    }

    /* Las categorias y el estandar salen del propio archivo. El estandar es
       una propiedad de la pieza, asi que basta la primera fila que lo traiga. */
    if (isAttribute()) {
      var cats = [], std = {};
      rows.forEach(function (r) {
        var v = String(r.value || '').trim();
        if (v && cats.indexOf(v) < 0) cats.push(v);
        var t = String(r.part).trim(), sv = String(r.standard || '').trim();
        if (sv) {
          if (cats.indexOf(sv) < 0) cats.push(sv);
          if (std[t] === undefined) std[t] = sv;
        }
      });
      if (cats.length) $('categories').value = cats.join(', ');
      state.standard = std;
      renderRejectOptions();
      /* Las categorias del archivo salen en orden de aparicion, que no dice
         nada de cual es el no conforme. Antes se preseleccionaba la segunda y
         se calculaba con ella; ahora se pide, porque de esa eleccion depende
         cual error es la fuga y cual la falsa alarma. */
      if (cats.length === 2 && Object.keys(std).length && !$('rejectCategory').value) {
        notes.push('El archivo trae estandar y dos categorias ("' + cats.join('" y "') + '"). ' +
          'Elige arriba cual significa pieza NO CONFORME: de esa eleccion dependen la efectividad, ' +
          'el error de fuga y la falsa alarma, y el orden de las filas del archivo no lo dice.');
      }
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
    /* Cada metodo se queda con la estructura que le toca, y no se pisa la del
       otro: en el cruzado la lista de piezas es una sola y compartida; en el
       anidado cada operador trae la suya, y ahi los nombres si pueden
       coincidir entre operadores porque la identidad es el par. */
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
      /* En atributos la celda es un <select>, no un <input>: el selector va
         por los atributos de datos y no por el nombre de la etiqueta. */
      var inp = $('dataTable').querySelector(
        '[data-op="' + cssEsc(o) + '"][data-part="' + cssEsc(t) + '"][data-rep="' + rep + '"]');
      if (inp) inp.value = String(r.value).trim();
    });
    validateLive();
    if (notes.length) showMessages($('configMsg'), [], notes);
    $('captureSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function cssEsc(s) { return String(s).replace(/["\\]/g, '\\$&'); }

  /* Ejemplo del metodo de atributos. NO es un dataset publicado: es un caso
     construido a mano para que se vea el metodo funcionando, con 30 piezas,
     3 evaluadores y 3 replicas. El estandar alterna buena/mala (15 y 15), que
     es la mezcla que pide AIAG, y los errores se concentran en seis piezas de
     la zona limite. Cada evaluador falla de una manera distinta a proposito:
     Ana rechaza de mas una pieza buena, Beto deja pasar dos malas sin
     contradecirse nunca, y Cruz se contradice en tres. Asi se ve que las
     cifras separan tres problemas que no se arreglan igual.
     P = Pasa, N = No pasa; cada evaluador trae 30 piezas x 3 replicas. */
  var ATTR_DEMO = {
    standard: 'PNPNPNPNPNPNPNPNPNPNPNPNPNPNPN',
    ratings: {
      'Ana': 'PPPNNNPPPNNNPPPNNNNNNNPNPPPNNNPPPNNNPPPNNNPPP' +
              'NNNPPPNNNPPPNNNPPPNNNPPPNNNPPPNNNPPPNNNPPPNNN',
      'Beto': 'PPPNNNPPPNNNPPPNNNPPPNNNPPPNNNPPPNNNPPPNNNPPP' +
              'NNNPPPNNNPPPNNNPPPPPPPPPPPPPPPNNNPPPNNNPPPNNN',
      'Cruz': 'PPPNNNPPPNNNPPPNNNPPPPPPNPPNNNPPPNNNPPPNNNPPP' +
              'NNNPPPNNNPPPNNNPPPNPNPPNNNNPPPNNNPPPNNNPPPNNN'
    }
  };

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
    if (isAttribute()) return loadAttributeDemo();
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

  function loadAttributeDemo() {
    var CAT = { P: 'Pasa', N: 'No pasa' }, rows = [];
    $('categories').value = 'Pasa, No pasa';
    renderRejectOptions();
    $('rejectCategory').value = 'No pasa';

    state.standard = {};
    for (var i = 0; i < ATTR_DEMO.standard.length; i++) {
      state.standard['Pieza ' + (i + 1)] = CAT[ATTR_DEMO.standard.charAt(i)];
    }
    Object.keys(ATTR_DEMO.ratings).forEach(function (op) {
      var sig = ATTR_DEMO.ratings[op];
      for (var k = 0; k < sig.length; k++) {
        var part = 'Pieza ' + (Math.floor(k / 3) + 1);
        rows.push({ operator: op, part: part, replicate: (k % 3) + 1,
                    value: CAT[sig.charAt(k)], standard: state.standard[part] });
      }
    });
    loadPayload({ data: rows });
    showMessages($('configMsg'), [], ['Ejemplo cargado. NO es un dataset publicado: es un caso ' +
      'construido a mano -30 piezas, 3 evaluadores, 3 replicas- para ver el metodo funcionando. ' +
      'Cada evaluador falla distinto a proposito: Ana rechaza de mas una pieza buena, Beto deja ' +
      'pasar dos malas sin contradecirse nunca, y Cruz se contradice en tres. Fijate en que las ' +
      'cifras separan los tres problemas.']);
  }

  function clearData() {
    if (!confirm('Se borraran todas las mediciones capturadas. Continuar?')) return;
    inputs().forEach(function (i) { i.value = ''; });
    validateLive();
    $('resultsSection').hidden = true;
    resetResultViz();
    state.result = null; state.stamp = null;
    refreshStale();
  }

  function resetAll() {
    if (!confirm('Se reiniciara el estudio completo (configuracion y datos). Continuar?')) return;
    state = { method: state.method, operators: [], parts: [], partsByOperator: [],
              replicates: 2, result: null, stamp: null, standard: {} };
    $('numOperators').value = 3; $('numParts').value = 10; $('numReplicates').value = 3;
    $('studyName').value = ''; renderStudyName();
    $('lsl').value = ''; $('usl').value = '';
    $('tolerance').value = ''; $('processMean').value = ''; $('historicalSigma').value = '';
    $('alpha').value = '0.25'; $('interactionMode').value = 'auto';
    $('svMultiplier').value = '6'; $('fDenominator').value = 'interaction';
    $('categories').value = 'Pasa, No pasa'; renderRejectOptions();
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
    var revealed = [];

    /* EL RESTAURADOR SE REGISTRA ANTES DE TOCAR LA PANTALLA.
       Antes se armaba al final, asi que si la preparacion fallaba a mitad --
       y F-03 era exactamente eso: el encabezado lanzaba TypeError en
       atributos -- la pantalla se quedaba rota y sin manera de volver:
       paneles del otro metodo revelados, tema claro forzado sobre un usuario
       que tenia el oscuro, y ningun printRestore que el evento afterprint
       pudiera llamar. Registrar primero cuesta nada y quita ese modo de fallo
       entero: pase lo que pase despues, la pantalla vuelve a su sitio. */
    printRestore = function () {
      revealed.forEach(function (el) { el.hidden = true; });
      if (theme === 'dark') applyTheme('dark', false);
      MSACharts.resizeAll();
      printRestore = null;
    };

    try {
      /* Los paneles ocultos hay que revelarlos ANTES de imprimir: un lienzo
         que nunca estuvo visible se dibujo en 0x0 y saldria en blanco. Solo
         los del metodo ACTIVO: los del otro existen en el mismo HTML y
         saldrian impresos con sus tablas vacias. */
      var method = state.method;
      [].slice.call(document.querySelectorAll('.tab-panel[hidden]'))
        .filter(function (el) { return appliesToMethod(el, method); })
        .forEach(function (el) { el.hidden = false; revealed.push(el); });
      // El tema oscuro se imprimiria con fondos negros; los lienzos son mapas
      // de bits, asi que no basta con CSS: hay que redibujar en claro.
      if (theme === 'dark') applyTheme('light', false);
      buildPrintHeader();
      buildPrintAnnex();
      void document.body.offsetHeight;              // fuerza el reflujo antes de medir
      MSACharts.resizeAll();
    } catch (e) {
      /* Que el reporte salga incompleto es malo; que la aplicacion se quede
         rota despues de imprimir es peor. Se deja constancia visible en el
         propio encabezado -- para que nadie firme un reporte creyendo que
         esta completo -- y se sigue: el restaurador ya esta puesto. */
      try {
        $('printHeader').innerHTML =
          '<h1 class="rep-title">' + esc(studyName() || 'Estudio') + '</h1>' +
          '<p class="rep-sub">No se pudo armar el encabezado de este reporte: ' +
          esc(e.message) + '. Revisa el resultado en pantalla antes de usarlo.</p>';
      } catch (e2) { /* ni eso: mejor un reporte sin encabezado que una app rota */ }
    }
  }

  function restoreAfterPrint() { if (printRestore) printRestore(); }

  /* Capa fina sobre MSAReport.headerRows: aqui solo se lee la pantalla y se
     pinta. Que filas van en cada metodo lo decide el modelo puro, que se
     prueba en Node contra los tres resultados reales (tests/tests-report.js).
     Mientras esa decision vivio aqui dentro, la unica manera de descubrir que
     estaba rota era abrir el navegador e imprimir. */
  function buildPrintHeader() {
    var m = activeMethod();
    var rows = MSAReport.headerRows(state.result, {
      date: new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }),
      method: state.method,
      operators: state.operators.length,
      parts: partsPerOperator(),
      replicates: state.replicates,
      countLabel: m.countLabel,
      spec: specLabel(),
      multiplier: $('svMultiplier').value,
      alpha: $('alpha').value,
      /* F-05. El boton queda deshabilitado cuando el resultado caduco, pero
         Ctrl+P dispara beforeprint igual, asi que la regla vive tambien aqui:
         un resultado que ya no es de estos datos no se imprime como si lo
         fuera. El modelo lo trata como "sin calcular" y lo dice. */
      stale: resultIsStale(),
      /* F-03.1: antes de calcular no hay resultado del que sacar la categoria
         de rechazo, y el encabezado de un estudio de atributos sin calcular la
         necesita. Se lee de la pantalla, como el resto de este contexto. */
      rejectCategory: $('rejectCategory') ? $('rejectCategory').value : ''
    });
    /* El subtitulo sale del metodo activo, no del atributo data-method del
       documento: si ese atributo faltara, methodById cae al primer metodo y el
       reporte de un estudio de atributos se encabezaria "Crossed ANOVA". */
    $('printHeader').innerHTML =
      '<h1 class="rep-title">' + esc(studyName() || 'Estudio MSA') + '</h1>' +
      '<p class="rep-sub">' + esc(m.badge) + ' &middot; MSA Toolkit</p>' +
      '<div class="rep-meta">' + rows.map(function (row) {
        return '<div><span>' + esc(row[0]) + '</span><strong>' + esc(row[1]) + '</strong></div>';
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
    var attr = isAttribute(), std = attr ? readStandard() : {};
    var withStd = Object.keys(std).length > 0;
    var h = '<h2>Anexo. ' + (attr ? 'Clasificaciones capturadas' : 'Mediciones capturadas') +
      '</h2><table><thead><tr>' +
      '<th class="txt">' + (attr ? 'Evaluador' : 'Operador') + '</th><th class="txt">Pieza</th>' +
      (withStd ? '<th class="txt">Estandar</th>' : '');
    for (var i = 1; i <= k; i++) h += '<th>Replica ' + i + '</th>';
    h += '</tr></thead><tbody>';
    var n = 0;
    state.operators.forEach(function (op, oi) {
      partsOfOperator(oi).forEach(function (pt) {
        h += '<tr><td class="txt">' + esc(op) + '</td><td class="txt">' + esc(pt) + '</td>' +
             (withStd ? '<td class="txt">' + esc(std[pt] || '-') + '</td>' : '');
        for (var j = 0; j < k; j++) {
          var v = (vals[op + '\u0000' + pt + '\u0000' + j] || '').trim();
          if (v !== '') n++;
          h += '<td>' + esc(v || '-') + '</td>';
        }
        h += '</tr>';
      });
    });
    h += '</tbody></table><p class="annex-note">' + n +
      (attr ? ' clasificaciones capturadas. ' : ' mediciones capturadas. ') +
      (resultIsStale()
        /* F-05: la frase de siempre seria falsa aqui. Se dice lo contrario,
           en el mismo sitio donde el lector la buscaria. */
        ? 'ATENCION: los datos cambiaron despues del ultimo calculo, asi que los resultados de ' +
          'este reporte NO salen de estas mediciones. Recalcula antes de usarlo.'
        : 'Los calculos de este reporte salen exactamente de estos datos.') + '</p>';
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
    /* Cambiar las categorias rehace el desplegable de rechazo, la tabla de
       estandar y las celdas de captura: las tres muestran la misma lista. */
    if ($('categories')) {
      renderRejectOptions();
      $('categories').addEventListener('input', function () {
        renderRejectOptions();
        if (isAttribute() && !$('captureSection').hidden) {
          buildDataTable(true);
          validateLive();
        }
      });
    }
    ['numOperators', 'numParts'].forEach(function (id) {
      $(id).addEventListener('change', function () {
        if (validateConfig()) renderNameInputs();
      });
    });
    $('generateBtn').addEventListener('click', function () { buildDataTable(true); });
    $('calcBtn').addEventListener('click', calculate);
    $('recalcBtn').addEventListener('click', calculate);
    $('staleRecalcBtn').addEventListener('click', calculate);
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
