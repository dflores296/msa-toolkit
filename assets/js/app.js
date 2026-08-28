/* ============================================================================
 * app.js - Interfaz: configuracion -> captura -> validacion -> resultados.
 * Replica el flujo del libro de Excel, sin sus errores.
 * ==========================================================================*/
(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var state = { operators: [], parts: [], replicates: 2, result: null };

  /* ------------------------------------------------------------------ *
   * Paso 1 - configuracion
   * ------------------------------------------------------------------ */
  function defaultNames(prefix, n, existing) {
    var out = [];
    for (var i = 0; i < n; i++) out.push((existing && existing[i]) || (prefix + ' ' + (i + 1)));
    return out;
  }

  function renderNameInputs() {
    var nOp = clamp(parseInt($('numOperators').value, 10), 2, 20, 3);
    var nPart = clamp(parseInt($('numParts').value, 10), 2, 50, 10);
    state.operators = defaultNames('Operador', nOp, state.operators);
    state.parts = defaultNames('Pieza', nPart, state.parts);

    fill($('operatorNames'), state.operators, function (i, v) { state.operators[i] = v; });
    fill($('partNames'), state.parts, function (i, v) { state.parts[i] = v; });
  }

  function fill(host, arr, onChange) {
    host.innerHTML = '';
    arr.forEach(function (name, i) {
      var inp = document.createElement('input');
      inp.type = 'text'; inp.value = name; inp.setAttribute('aria-label', 'Nombre ' + (i + 1));
      inp.addEventListener('input', function () { onChange(i, inp.value); });
      host.appendChild(inp);
    });
  }

  function clamp(v, lo, hi, dflt) {
    if (!isFinite(v)) return dflt;
    return Math.min(hi, Math.max(lo, v));
  }

  /* ------------------------------------------------------------------ *
   * Paso 2 - tabla de captura
   * ------------------------------------------------------------------ */
  function buildDataTable(preserve) {
    var previous = preserve ? readValues() : {};
    state.replicates = clamp(parseInt($('numReplicates').value, 10), 2, 25, 2);

    var ops = state.operators.map(trimOrDefault('Operador'));
    var parts = state.parts.map(trimOrDefault('Pieza'));
    var dup = firstDuplicate(ops) || firstDuplicate(parts);
    if (dup) {
      showMessages($('configMsg'), ['Hay nombres repetidos ("' + dup + '"). Cada operador y cada pieza debe tener un nombre unico.'], []);
      return false;
    }
    clearMessages($('configMsg'));
    state.operators = ops; state.parts = parts;

    var thead = '<thead><tr><th>Operador</th><th>Pieza</th>';
    for (var k = 1; k <= state.replicates; k++) thead += '<th class="num">Replica ' + k + '</th>';
    thead += '</tr></thead>';

    var body = '<tbody>';
    ops.forEach(function (op) {
      parts.forEach(function (pt, pi) {
        body += '<tr>';
        body += pi === 0
          ? '<th class="op" rowspan="' + parts.length + '" scope="rowgroup">' + esc(op) + '</th>'
          : '';
        body += '<td>' + esc(pt) + '</td>';
        for (var k = 0; k < state.replicates; k++) {
          var key = op + '\u0000' + pt + '\u0000' + k;
          var v = previous[key] === undefined ? '' : previous[key];
          body += '<td><input type="text" inputmode="decimal" data-op="' + esc(op) +
                  '" data-part="' + esc(pt) + '" data-rep="' + k + '" value="' + esc(v) + '"></td>';
        }
        body += '</tr>';
      });
    });
    body += '</tbody>';

    $('dataTable').innerHTML = thead + body;
    $('captureSection').hidden = false;
    $('captureCount').textContent = ops.length + ' operadores x ' + parts.length + ' piezas x ' +
      state.replicates + ' replicas = ' + (ops.length * parts.length * state.replicates) + ' mediciones';
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
      return { operator: i.dataset.op, part: i.dataset.part, value: i.value.trim().replace(',', '.') };
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
                      historicalSigma: 'Sigma historica del proceso' };

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
    if (!hasTol && !hasBoth && (values.lsl !== '' || values.usl !== '')) {
      errors.push('Diste solo uno de los dos limites de especificacion. Para calcular ' +
        '% Tolerance hacen falta LSL y USL, o bien la tolerancia directa.');
    }
    if (hasBoth && !hasTol && Number(values.usl) <= Number(values.lsl)) {
      errors.push('USL (' + values.usl + ') debe ser mayor que LSL (' + values.lsl + ').');
    }
    if (hasTol && Number(values.tolerance) <= 0) {
      errors.push('La tolerancia debe ser mayor que cero.');
    }
    return { values: values, errors: errors };
  }

  function calculate() {
    clearMessages($('resultMsg'));
    var rows = collectRows();
    var specs = readSpecs();
    if (specs.errors.length) {
      $('resultsSection').hidden = false;
      showMessages($('resultMsg'), specs.errors, []);
      $('resultBody').hidden = true;
      MSACharts.destroyAll();
      state.result = null;
      $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var opts = {
      alpha: Number($('alpha').value),
      interaction: $('interactionMode').value,
      studyVarMultiplier: Number($('svMultiplier').value),
      lsl: specs.values.lsl, usl: specs.values.usl,
      tolerance: specs.values.tolerance,
      historicalSigma: specs.values.historicalSigma,
      fDenominator: $('fDenominator').value
    };
    var result;
    try {
      result = MSAAnova.compute(rows, opts);
    } catch (e) {
      $('resultsSection').hidden = false;
      showMessages($('resultMsg'), e.details || [e.message], []);
      MSACharts.destroyAll();
      $('resultBody').hidden = true;
      state.result = null;
      return;
    }
    state.result = result;
    $('resultsSection').hidden = false;
    $('resultBody').hidden = false;
    showMessages($('resultMsg'), [], result.warnings);
    renderVerdict(result);
    renderTables(result);
    MSACharts.render(result);
    $('resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderVerdict(r) {
    var a = r.assessment;
    var cards = [
      card('% Study Variation (GRR)', r.metrics.pctStudyVar.toFixed(2) + ' %', a.studyVar),
      card('% Contribucion (GRR)', r.metrics.pctContribution.toFixed(2) + ' %', a.contribution),
      r.metrics.pctTolerance === null
        ? card('% Tolerance (P/T)', 'sin LSL/USL', null)
        : card('% Tolerance (P/T)', r.metrics.pctTolerance.toFixed(2) + ' %', a.tolerance),
      card('Categorias distintas', r.ndc === null ? 'inf' : String(r.ndc), a.ndc),
      card('ICC (EMP, Wheeler)', r.icc.toFixed(3), a.emp)
    ];
    $('verdicts').innerHTML = cards.join('');
  }

  function card(k, v, t) {
    return '<div class="verdict"><div class="k">' + esc(k) + '</div><div class="v">' + esc(v) + '</div>' +
      (t ? '<span class="t ' + t.level + '">' + esc(t.label) + '</span>' : '') + '</div>';
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
    var h = '<caption>Tabla 1. ANOVA de dos factores (' +
      (r.model === 'with-interaction' ? 'con interaccion' : 'sin interaccion') + ')</caption>' +
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
      (showTol ? '<th class="num">% Tolerance</th>' : '') +
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
    if (showTol) notes.push('Tolerancia usada: ' + num(r.tolerance, 6) + '.');
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
    $('decompNote').textContent = 'Comprobacion de la identidad SC_Total = SC_Parte + SC_Operador + ' +
      'SC_Interaccion + SC_Repetibilidad: error relativo = ' + r.anovaFull.decompositionError.toExponential(2) +
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
  function exportJSON() {
    var payload = {
      format: 'msa-toolkit/gage-rr-anova', version: 1,
      savedAt: new Date().toISOString(),
      config: {
        operators: state.operators, parts: state.parts, replicates: state.replicates,
        lsl: $('lsl').value, usl: $('usl').value, tolerance: $('tolerance').value,
        historicalSigma: $('historicalSigma').value,
        alpha: Number($('alpha').value), interaction: $('interactionMode').value,
        studyVarMultiplier: Number($('svMultiplier').value), fDenominator: $('fDenominator').value
      },
      data: collectRows()
    };
    download('estudio-gage-rr.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  function exportCSV() {
    var lines = ['operador,pieza,replica,medicion'];
    inputs().forEach(function (i) {
      lines.push([csvCell(i.dataset.op), csvCell(i.dataset.part),
                  Number(i.dataset.rep) + 1, i.value.trim()].join(','));
    });
    download('estudio-gage-rr.csv', lines.join('\n'), 'text/csv');
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
      try {
        if (/^\s*\{/.test(text)) loadPayload(JSON.parse(text));
        else loadCSV(text);
        clearMessages($('configMsg'));
      } catch (e) {
        showMessages($('configMsg'), ['No se pudo leer el archivo: ' + e.message], []);
      }
    };
    reader.readAsText(file);
  }

  function loadCSV(text) {
    var lines = text.replace(/\r\n?/g, '\n').split('\n').filter(function (l) { return l.trim(); });
    if (!lines.length) throw new Error('archivo vacio');
    var sep = (lines[0].match(/;/g) || []).length > (lines[0].match(/,/g) || []).length ? ';' : ',';
    var head = splitCSV(lines[0], sep).map(function (s) { return s.trim().toLowerCase(); });
    var iOp = idxOf(head, ['operador', 'operator']);
    var iPt = idxOf(head, ['pieza', 'parte', 'part']);
    var iVal = idxOf(head, ['medicion', 'medición', 'valor', 'value', 'measurement']);
    if (iOp < 0 || iPt < 0 || iVal < 0) {
      throw new Error('se esperan columnas operador, pieza y medicion (encabezado: ' + head.join(', ') + ')');
    }
    var rows = lines.slice(1).map(function (l) {
      var c = splitCSV(l, sep);
      return { operator: (c[iOp] || '').trim(), part: (c[iPt] || '').trim(), value: (c[iVal] || '').trim() };
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

  function loadPayload(p) {
    var rows = p.data || [];
    if (!rows.length) throw new Error('no hay filas de datos');
    var ops = [], parts = [], counts = {};
    rows.forEach(function (r) {
      var o = String(r.operator).trim(), t = String(r.part).trim();
      if (ops.indexOf(o) < 0) ops.push(o);
      if (parts.indexOf(t) < 0) parts.push(t);
      counts[o + '\u0000' + t] = (counts[o + '\u0000' + t] || 0) + 1;
    });
    var maxRep = Math.max.apply(null, Object.keys(counts).map(function (k) { return counts[k]; }));

    if (p.config) {
      if (p.config.lsl !== undefined) $('lsl').value = p.config.lsl;
      if (p.config.usl !== undefined) $('usl').value = p.config.usl;
      if (p.config.tolerance !== undefined) $('tolerance').value = p.config.tolerance;
      if (p.config.historicalSigma !== undefined) $('historicalSigma').value = p.config.historicalSigma;
      if (p.config.alpha !== undefined) $('alpha').value = String(p.config.alpha);
      if (p.config.interaction) $('interactionMode').value = p.config.interaction;
      if (p.config.studyVarMultiplier) $('svMultiplier').value = String(p.config.studyVarMultiplier);
      if (p.config.fDenominator) $('fDenominator').value = p.config.fDenominator;
    }

    state.operators = ops; state.parts = parts;
    $('numOperators').value = ops.length;
    $('numParts').value = parts.length;
    $('numReplicates').value = maxRep;
    renderNameInputs();
    if (!buildDataTable(false)) return;

    var seen = {};
    rows.forEach(function (r) {
      var o = String(r.operator).trim(), t = String(r.part).trim();
      var key = o + '\u0000' + t;
      var rep = seen[key] === undefined ? 0 : seen[key];
      seen[key] = rep + 1;
      var inp = $('dataTable').querySelector(
        'input[data-op="' + cssEsc(o) + '"][data-part="' + cssEsc(t) + '"][data-rep="' + rep + '"]');
      if (inp) inp.value = String(r.value).trim();
    });
    validateLive();
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
  function loadDemo() {
    var rows = [], ops = ['Operador A', 'Operador B', 'Operador C'];
    AIAG.forEach(function (vals, i) {
      ops.forEach(function (op, oi) {
        for (var k = 0; k < 3; k++) rows.push({ operator: op, part: 'Pieza ' + (i + 1), value: vals[oi * 3 + k] });
      });
    });
    $('lsl').value = '-5'; $('usl').value = '5';
    $('tolerance').value = ''; $('historicalSigma').value = '';
    loadPayload({ data: rows });
  }

  function clearData() {
    if (!confirm('Se borraran todas las mediciones capturadas. Continuar?')) return;
    inputs().forEach(function (i) { i.value = ''; });
    validateLive();
    $('resultsSection').hidden = true;
    MSACharts.destroyAll();
    state.result = null;
  }

  function resetAll() {
    if (!confirm('Se reiniciara el estudio completo (configuracion y datos). Continuar?')) return;
    state = { operators: [], parts: [], replicates: 2, result: null };
    $('numOperators').value = 3; $('numParts').value = 10; $('numReplicates').value = 3;
    $('lsl').value = ''; $('usl').value = '';
    $('tolerance').value = ''; $('historicalSigma').value = '';
    $('alpha').value = '0.25'; $('interactionMode').value = 'auto';
    $('svMultiplier').value = '6'; $('fDenominator').value = 'interaction';
    renderNameInputs();
    $('captureSection').hidden = true;
    $('resultsSection').hidden = true;
    MSACharts.destroyAll();
    clearMessages($('configMsg'));
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ------------------------------------------------------------------ *
   * Arranque
   * ------------------------------------------------------------------ */
  document.addEventListener('DOMContentLoaded', function () {
    renderNameInputs();
    ['numOperators', 'numParts'].forEach(function (id) {
      $(id).addEventListener('change', renderNameInputs);
    });
    $('generateBtn').addEventListener('click', function () { buildDataTable(true); });
    $('calcBtn').addEventListener('click', calculate);
    $('recalcBtn').addEventListener('click', calculate);
    $('demoBtn').addEventListener('click', loadDemo);
    $('clearDataBtn').addEventListener('click', clearData);
    $('resetBtn').addEventListener('click', resetAll);
    $('exportJsonBtn').addEventListener('click', exportJSON);
    $('exportCsvBtn').addEventListener('click', exportCSV);
    $('printBtn').addEventListener('click', function () { window.print(); });
    $('importBtn').addEventListener('click', function () { $('importFile').click(); });
    $('importFile').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importFile(e.target.files[0]);
      e.target.value = '';
    });
    ['alpha', 'interactionMode', 'svMultiplier', 'fDenominator', 'lsl', 'usl', 'tolerance', 'historicalSigma']
      .forEach(function (id) {
        $(id).addEventListener('change', function () { if (state.result) calculate(); });
      });
  });
})();
