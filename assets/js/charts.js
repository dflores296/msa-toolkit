/* ============================================================================
 * charts.js - Las graficas del estudio, sobre Chart.js: ocho en el metodo
 * cruzado, cinco en el anidado (ver render).
 * Sin redondeo de los datos antes de graficar (el VBA redondeaba a 4 dp).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var PALETTE = ['#0b5cad', '#b3261e', '#1c7a4a', '#9a6206', '#6b3fa0', '#0f7c8a', '#a34a7f'];
  var registry = {};

  /* Lee los tokens de color del tema activo (claro/oscuro), para que las
     graficas de Chart.js (que no entienden variables CSS) sigan legibles
     al cambiar de tema. */
  function themeVar(name, fallback) {
    var v = getComputedStyle(document.documentElement).getPropertyValue(name);
    v = v && v.trim();
    return v || fallback;
  }
  function GRID() { return themeVar('--chart-grid', '#e6e9ed'); }
  function TICK() { return themeVar('--chart-tick', '#5a6673'); }
  /* Colores del semaforo AIAG: los mismos tokens que usan las barras HTML de
     "Evaluacion de la variacion", fijos entre tema claro y oscuro porque el
     color codifica el nivel de alerta, no la estetica del tema. */
  function SEM_OK() { return themeVar('--sem-ok', '#2e9e63'); }
  function SEM_WARN() { return themeVar('--sem-warn', '#e0a63a'); }

  /* Plugin: lineas de umbral horizontales al estilo Minitab. Cruzan TODA el
     area de trazado (no solo de la primera a la ultima categoria, como haria
     un dataset de tipo linea) y llevan su rotulo fuera del grafico, a la
     derecha. Se dibujan ANTES de las barras para que la barra sobresalga por
     encima donde se traslapan; el rotulo se dibuja despues, ya fuera del area,
     asi que nunca queda tapado. No son series: no aparecen en la leyenda. */
  var thresholdLines = {
    id: 'thresholdLines',
    beforeDatasetsDraw: function (chart, args, opts) {
      var lines = (opts && opts.lines) || [];
      var area = chart.chartArea, y = chart.scales.y;
      if (!lines.length || !area || !y) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.lineWidth = 1.4;
      lines.forEach(function (ln) {
        var py = y.getPixelForValue(ln.value);
        if (py < area.top || py > area.bottom) return;
        ctx.strokeStyle = ln.color;
        ctx.beginPath();
        ctx.moveTo(area.left, py);
        ctx.lineTo(area.right, py);
        ctx.stroke();
      });
      ctx.restore();
    },
    afterDatasetsDraw: function (chart, args, opts) {
      var lines = (opts && opts.lines) || [];
      var area = chart.chartArea, y = chart.scales.y;
      if (!lines.length || !area || !y) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '10px ' + (themeVar('--sans', '') || 'sans-serif');
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      lines.forEach(function (ln) {
        var py = y.getPixelForValue(ln.value);
        if (py < area.top || py > area.bottom) return;
        ctx.fillStyle = ln.color;
        ctx.fillText(ln.label, area.right + 5, py);
      });
      ctx.restore();
    }
  };
  if (global.Chart) global.Chart.register(thresholdLines);

  /* Plugin: diagrama de caja. Chart.js no trae boxplot y no vamos a cargar un
     paquete extra (la app corre sin conexion), asi que la caja Q1-Q3 se dibuja
     como barra flotante -el propio Chart.js soporta datos [min, max]- y este
     plugin le agrega encima los bigotes, la mediana, la media y los atipicos.
     El resumen viene en dataset.boxes, en el mismo orden que los datos. */
  var boxWhiskers = {
    id: 'boxWhiskers',
    afterDatasetsDraw: function (chart) {
      var y = chart.scales.y;
      if (!y) return;
      var ctx = chart.ctx;
      chart.data.datasets.forEach(function (ds, di) {
        if (!ds.boxes) return;
        var meta = chart.getDatasetMeta(di);
        if (meta.hidden) return;
        ctx.save();
        ctx.strokeStyle = ds.whiskerColor || ds.borderColor || '#000';
        ctx.fillStyle = ctx.strokeStyle;
        ctx.lineWidth = 1.4;
        meta.data.forEach(function (bar, i) {
          var b = ds.boxes[i];
          if (!b) return;
          var x = bar.x, half = (bar.width || 24) / 2;
          function line(x1, y1, x2, y2) {
            ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
          }
          // bigotes (linea vertical + tope horizontal a media caja)
          line(x, y.getPixelForValue(b.q3), x, y.getPixelForValue(b.whiskerHigh));
          line(x, y.getPixelForValue(b.q1), x, y.getPixelForValue(b.whiskerLow));
          line(x - half / 2, y.getPixelForValue(b.whiskerHigh), x + half / 2, y.getPixelForValue(b.whiskerHigh));
          line(x - half / 2, y.getPixelForValue(b.whiskerLow), x + half / 2, y.getPixelForValue(b.whiskerLow));
          // mediana: linea gruesa de lado a lado de la caja
          ctx.lineWidth = 2;
          line(x - half, y.getPixelForValue(b.median), x + half, y.getPixelForValue(b.median));
          ctx.lineWidth = 1.4;
          // media: circulo relleno, como el marcador de Minitab
          ctx.beginPath();
          ctx.arc(x, y.getPixelForValue(b.mean), 3, 0, 2 * Math.PI);
          ctx.fill();
          // atipicos: circulos huecos
          b.outliers.forEach(function (v) {
            ctx.beginPath();
            ctx.arc(x, y.getPixelForValue(v), 2.6, 0, 2 * Math.PI);
            ctx.stroke();
          });
        });
        ctx.restore();
      });
    }
  };
  if (global.Chart) global.Chart.register(boxWhiskers);

  /* Plugin: bloques por operador en las cartas R y X-barra. El eje x solo lleva
     la pieza; el operador se marca con una linea punteada entre bloques y su
     nombre arriba, como en Minitab. En el libro de Excel esto no se podia y por
     eso cada punto se rotulaba "Operador A - Pieza 1": el rotulo era tan largo
     que aplastaba la grafica. */
  var operatorBands = {
    id: 'operatorBands',
    beforeDatasetsDraw: function (chart, args, opts) {
      var groups = (opts && opts.groups) || [];
      var area = chart.chartArea, x = chart.scales.x;
      if (groups.length < 2 || !area || !x) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = opts.color || '#9aa4b0';
      for (var i = 1; i < groups.length; i++) {
        var px = (x.getPixelForValue(groups[i - 1].to) + x.getPixelForValue(groups[i].from)) / 2;
        ctx.beginPath();
        ctx.moveTo(px, area.top);
        ctx.lineTo(px, area.bottom);
        ctx.stroke();
      }
      ctx.restore();
    },
    afterDatasetsDraw: function (chart, args, opts) {
      var groups = (opts && opts.groups) || [];
      var area = chart.chartArea, x = chart.scales.x;
      if (!groups.length || !area || !x) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.font = '600 10px ' + (themeVar('--sans', '') || 'sans-serif');
      ctx.fillStyle = opts.color || TICK();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      groups.forEach(function (g) {
        var px = (x.getPixelForValue(g.from) + x.getPixelForValue(g.to)) / 2;
        ctx.fillText(g.label, px, area.top - 3);
      });
      ctx.restore();
    }
  };
  if (global.Chart) global.Chart.register(operatorBands);

  /* Plugin: barra de intervalo de confianza sobre cada punto o barra. En un
     estudio por atributos el porcentaje solo no alcanza: con 30 piezas, un
     95 % puede significar cualquier cosa entre 80 y 99, y esa diferencia
     cambia la decision. El intervalo se dibuja como un bigote vertical con
     sus dos topes, encima de la barra. */
  var ciWhiskers = {
    id: 'ciWhiskers',
    afterDatasetsDraw: function (chart, args, opts) {
      var ranges = (opts && opts.ranges) || [];
      if (!ranges.length) return;
      var meta = chart.getDatasetMeta(opts.datasetIndex || 0);
      var y = chart.scales.y, area = chart.chartArea;
      if (!meta || !y || !area) return;
      var ctx = chart.ctx;
      ctx.save();
      ctx.strokeStyle = opts.color || TICK();
      ctx.lineWidth = 1.4;
      ranges.forEach(function (r, i) {
        var el = meta.data[i];
        if (!el || r == null || !isFinite(r.lo) || !isFinite(r.hi)) return;
        var x = el.x;
        var top = Math.max(area.top, y.getPixelForValue(r.hi));
        var bot = Math.min(area.bottom, y.getPixelForValue(r.lo));
        var cap = Math.max(4, Math.min(9, (el.width || 20) / 4));
        ctx.beginPath();
        ctx.moveTo(x, top); ctx.lineTo(x, bot);
        ctx.moveTo(x - cap, top); ctx.lineTo(x + cap, top);
        ctx.moveTo(x - cap, bot); ctx.lineTo(x + cap, bot);
        ctx.stroke();
      });
      ctx.restore();
    }
  };
  if (global.Chart) global.Chart.register(ciWhiskers);

  function destroyAll() {
    Object.keys(registry).forEach(function (k) {
      if (registry[k]) { registry[k].destroy(); registry[k] = null; }
    });
  }

  function resizeAll() {
    Object.keys(registry).forEach(function (k) {
      if (registry[k]) registry[k].resize();
    });
  }

  function baseOptions(extra) {
    var o = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          position: 'bottom',
          // usePointStyle:false para que las lineas de limite se dibujen en la
          // leyenda con su patron de guiones y no como puntos.
          labels: { boxWidth: 22, boxHeight: 2, font: { size: 11 }, padding: 10, usePointStyle: false, color: TICK() }
        },
        tooltip: { titleFont: { size: 11 }, bodyFont: { size: 11 } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: TICK(), maxRotation: 60, minRotation: 0 } },
        y: { grid: { color: GRID() }, ticks: { font: { size: 10 }, color: TICK() } }
      }
    };
    return merge(o, extra || {});
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function merge(a, b) {
    Object.keys(b).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') {
        merge(a[k], b[k]);
      } else { a[k] = b[k]; }
    });
    return a;
  }

  /* --- Una grafica sin datos NO deja su caja puesta ----------------------
   *
   * El estandar de diseno lo dice para las graficas que un metodo no tiene:
   * "no se dibuja un lienzo vacio ni una grafica con una nota de 'no aplica':
   * la grafica NO APARECE. El hueco lo cierra la rejilla sola."
   *
   * `data-methods` en el HTML resuelve ese caso -este METODO no tiene esta
   * grafica- pero no el otro: este ESTUDIO no produjo los datos. Pasaba en
   * "Fuga y falsa alarma", que solo existe con estandar, escala binaria y
   * categoria de rechazo elegida: sin eso quedaba el titulo, el pie y un
   * lienzo en blanco de 300x150, que se lee como una grafica que fallo.
   *
   * Se marca con una clase propia y no con `hidden` a proposito: `hidden` es
   * de `applyMethod`, y dos duenos para la misma propiedad acaban pisandose.
   * --------------------------------------------------------------------- */
  function boxOf(id) {
    var el = document.getElementById(id);
    return el && el.closest ? el.closest('.chart-box') : null;
  }

  /** Esta grafica no se dibuja en este estudio: su caja desaparece. */
  function skip(id) {
    var b = boxOf(id);
    if (b) b.classList.add('chart-empty');
  }

  function make(id, config) {
    var el = document.getElementById(id);
    if (!el) return;
    if (registry[id]) registry[id].destroy();
    registry[id] = new Chart(el.getContext('2d'), config);
    var b = boxOf(id);
    if (b) b.classList.remove('chart-empty');
  }

  /* Quita el prefijo comun de los nombres de pieza ("Pieza 1", "Pieza 2" ->
     "1", "2"). Con 30 puntos en el eje, el nombre completo obliga a girar los
     rotulos y se come la mitad de la grafica; el numero cabe derecho. Si los
     nombres no comparten prefijo, se dejan tal cual. */
  function shortPartLabels(seq, parts) {
    if (parts.length < 2) return seq.slice();
    var first = parts[0], n = first.length;
    parts.forEach(function (p) {
      var i = 0;
      while (i < n && i < p.length && p.charAt(i) === first.charAt(i)) i++;
      n = i;
    });
    var prefix = first.slice(0, n).replace(/[0-9]+$/, '');
    if (!prefix) return seq.slice();
    var ok = parts.every(function (p) { return p.slice(prefix.length).trim() !== ''; });
    if (!ok) return seq.slice();
    return seq.map(function (p) { return p.slice(prefix.length).trim(); });
  }

  /** Titulo del eje x, con el mismo estilo en todas las graficas. */
  function axisTitle(text) {
    return { display: true, text: text, font: { size: 10 }, color: TICK() };
  }

  /** Linea horizontal constante (limite de control). */
  function limitSeries(label, value, n, color, dashed) {
    return {
      label: label, data: new Array(n).fill(value),
      borderColor: color, borderWidth: 1.4, borderDash: dashed ? [6, 4] : [],
      pointRadius: 0, fill: false, tension: 0
    };
  }

  function pointSeries(label, values, color) {
    return {
      label: label, data: values, borderColor: color, backgroundColor: color,
      borderWidth: 1.6, pointRadius: 3, pointHoverRadius: 5, fill: false, tension: 0
    };
  }

  /* Decide cuantos decimales necesita el eje para no repetir etiquetas.
     El VBA fijaba "0.0" y mostraba 0.2, 0.2, 0.3, 0.3 en datos de 3-4 dp. */
  function tickFormatter(values) {
    var finite = values.filter(function (v) { return isFinite(v); });
    if (!finite.length) return function (v) { return v; };
    var span = Math.max.apply(null, finite) - Math.min.apply(null, finite);
    var mag = Math.max(Math.abs(Math.max.apply(null, finite)), Math.abs(Math.min.apply(null, finite)));
    var digits = span > 0 ? Math.max(0, Math.ceil(-Math.log10(span / 6)) + 1) : (mag > 0 ? 3 : 0);
    digits = Math.min(8, digits);
    return function (v) { return Number(v).toFixed(digits); };
  }

  /* ---------------------------------------------------------------------- *
   * render(result) - dibuja las graficas a partir del objeto de compute()
   *
   * Ocho en el metodo cruzado. En el anidado son cinco: se van la de
   * interaccion, el promedio por pieza y los rangos por pieza, porque las tres
   * cruzan operadores sobre una misma pieza y ahi ninguna pieza la miden dos
   * operadores. El motor anidado simplemente no publica esas series, asi que
   * la condicion es "si el dato existe", no "si el metodo es tal".
   *
   * La barra "Evaluacion de la variacion" no vive aqui: es un widget HTML/CSS
   * (ver renderEvalBars en app.js), no una grafica de Chart.js.
   * ---------------------------------------------------------------------- */
  function render(result) {
    var ch = result.charts;
    // Las graficas que este metodo no dibuja no pueden quedarse en pantalla
    // con los datos del metodo anterior.
    destroyAll();
    /* Atributos publica otras series -concordancias con su intervalo, no
       componentes de varianza-, asi que tiene su propio juego de graficas. */
    if (result.model === 'attribute') return renderAttribute(result);
    var comps = {};
    result.components.forEach(function (c) { comps[c.key] = c; });

    /* 1. Componentes de variacion (barras agrupadas) */
    var order = ['grr', 'rep', 'repro', 'part'];
    var names = { grr: 'Total Gage R&R', rep: 'Repetibilidad', repro: 'Reproducibilidad', part: 'Pieza a pieza' };
    var labels1 = order.map(function (k) { return names[k]; });
    var ds1 = [
      { label: '% Contribucion', data: order.map(function (k) { return 100 * comps[k].pctContribution; }),
        backgroundColor: PALETTE[0] },
      { label: '% Study Variation', data: order.map(function (k) { return 100 * comps[k].pctStudyVar; }),
        backgroundColor: PALETTE[1] }
    ];
    if (result.tolerance) {
      // Ambar del semaforo, no el cafe de la paleta general: el color de esta
      // barra es el mismo en tema claro y oscuro.
      ds1.push({ label: '% Tolerance', data: order.map(function (k) { return 100 * comps[k].pctTolerance; }),
                 backgroundColor: SEM_WARN() });
    }
    make('chartComponents', {
      type: 'bar',
      data: { labels: labels1, datasets: ds1 },
      options: baseOptions({
        // Espacio a la derecha para los rotulos "10 %" y "30 %" de los umbrales.
        layout: { padding: { right: 38 } },
        scales: {
          y: { beginAtZero: true, ticks: { callback: function (v) { return v + ' %'; } } }
        },
        plugins: {
          tooltip: { callbacks: { label: function (c) {
            return c.dataset.label + ': ' + c.parsed.y.toFixed(2) + ' %'; } } },
          // Criterio AIAG: 10 % (verde) y 30 % (ambar), como rotulos
          // indicadores; no son series, por eso no van en la leyenda.
          thresholdLines: { lines: [
            { value: 10, label: '10 %', color: SEM_OK() },
            { value: 30, label: '30 %', color: SEM_WARN() }
          ] }
        }
      })
    });

    /* 2. Carta R por operador */
    // El eje se recorta contra la lista completa de nombres de pieza: la
    // comparte el cruzado (10 piezas) y la trae aparte el anidado (una por
    // celda, sin repetir entre operadores).
    var allPartNames = ch.partMeans ? ch.partMeans.labels : ch.allParts;
    var partAxis = shortPartLabels(ch.partSequence, allPartNames);
    var bandOptions = {
      layout: { padding: { top: 14 } },
      plugins: { operatorBands: { groups: ch.operatorGroups } },
      scales: { x: {
        title: axisTitle('Pieza'),
        // Sin autoSkip: con el numero de pieza a secas caben las 10 de cada
        // bloque, y saltarse la mitad haria dudar de que punto es cual.
        ticks: { maxRotation: 0, autoSkip: false }
      } }
    };
    if (ch.rChart.available) {
      var n = ch.labels.length;
      make('chartR', {
        type: 'line',
        data: {
          labels: partAxis,
          datasets: [
            pointSeries('Rango', ch.rChart.values, PALETTE[0]),
            limitSeries('LCS = ' + fmt(ch.rChart.ucl), ch.rChart.ucl, n, PALETTE[1], true),
            limitSeries('R promedio = ' + fmt(ch.rChart.center), ch.rChart.center, n, PALETTE[2], false),
            limitSeries('LCI = ' + fmt(ch.rChart.lcl), ch.rChart.lcl, n, PALETTE[1], true)
          ]
        },
        options: baseOptions(merge({
          // El tooltip si nombra al operador: el eje ya no lo repite.
          plugins: { tooltip: { callbacks: { title: function (items) {
            return ch.labels[items[0].dataIndex]; } } } },
          scales: { y: { ticks: { callback: tickFormatter(
            ch.rChart.values.concat([ch.rChart.ucl, ch.rChart.lcl])) } } }
        }, clone(bandOptions)))
      });
    }

    /* 3. Carta X-barra por operador */
    if (ch.xbarChart.available) {
      var m = ch.labels.length;
      make('chartXbar', {
        type: 'line',
        data: {
          labels: partAxis,
          datasets: [
            pointSeries('Media', ch.xbarChart.values, PALETTE[0]),
            limitSeries('LCS = ' + fmt(ch.xbarChart.ucl), ch.xbarChart.ucl, m, PALETTE[1], true),
            limitSeries('X doble barra = ' + fmt(ch.xbarChart.center), ch.xbarChart.center, m, PALETTE[2], false),
            limitSeries('LCI = ' + fmt(ch.xbarChart.lcl), ch.xbarChart.lcl, m, PALETTE[1], true)
          ]
        },
        options: baseOptions(merge({
          plugins: { tooltip: { callbacks: { title: function (items) {
            return ch.labels[items[0].dataIndex]; } } } },
          scales: { y: { ticks: { callback: tickFormatter(
            ch.xbarChart.values.concat([ch.xbarChart.ucl, ch.xbarChart.lcl])) } } }
        }, clone(bandOptions)))
      });
    }

    /* 4. Mediciones por operador (diagrama de caja, como el panel de efectos
          principales del reporte de Minitab) */
    var opLabels = ch.byOperator.map(function (o) { return o.operator; });
    var boxes = ch.byOperator.map(function (o) { return o.box; });
    var allByOp = [];
    ch.byOperator.forEach(function (o) { allByOp = allByOp.concat(o.values); });
    make('chartByOperator', {
      type: 'bar',
      data: {
        labels: opLabels,
        datasets: [{
          label: 'Mediciones', boxes: boxes,
          data: boxes.map(function (b) { return b ? [b.q1, b.q3] : [0, 0]; }),
          backgroundColor: 'rgba(11,92,173,.30)', borderColor: PALETTE[0], borderWidth: 1.2,
          whiskerColor: PALETTE[0], barPercentage: 0.5, categoryPercentage: 0.7
        }]
      },
      options: baseOptions({
        plugins: {
          legend: { display: false },
          // Un tooltip por caja: los cinco numeros del resumen, no el par [q1, q3]
          // que Chart.js mostraria de la barra flotante.
          tooltip: { callbacks: { label: function (c) {
            var b = boxes[c.dataIndex], f = tickFormatter(allByOp);
            if (!b) return '';
            return ['Mediana: ' + f(b.median), 'Media: ' + f(b.mean),
                    'Q1: ' + f(b.q1) + '  Q3: ' + f(b.q3),
                    'Bigotes: ' + f(b.whiskerLow) + ' a ' + f(b.whiskerHigh),
                    'Atipicos: ' + b.outliers.length, 'n = ' + b.n];
          } } }
        },
        // La barra solo abarca Q1-Q3, asi que el eje debe estirarse a mano hasta
        // los bigotes y los atipicos; si no, se salen del area de trazado.
        scales: {
          x: { title: axisTitle('Operador') },
          y: {
          suggestedMin: Math.min.apply(null, allByOp),
          suggestedMax: Math.max.apply(null, allByOp),
          ticks: { callback: tickFormatter(allByOp) }
        } }
      })
    });

    /* 4b. Rangos por operador y por pieza (Test-Retest Ranges de Minitab):
          los mismos rangos de la carta R, agrupados para ver quien repite peor
          y que pieza cuesta mas medir. */
    rangeChart('chartRangesByOperator', ch.rangesByOperator, 'Operador', false);
    rangeChart('chartRangesByPart', ch.rangesByPart, 'Pieza', true);

    /* 5. Promedio de medicion por pieza. Solo cruzado: en el anidado cada punto
          seria una pieza de un solo operador, que es lo que ya muestra la carta
          X-barra con sus bloques. */
    if (ch.partMeans) make('chartPartMeans', {
      type: 'line',
      data: {
        labels: shortPartLabels(ch.partMeans.labels, ch.partMeans.labels),
        datasets: [pointSeries('Promedio por pieza', ch.partMeans.values, PALETTE[0])]
      },
      options: baseOptions({
        plugins: { legend: { display: false },
                   tooltip: { callbacks: { title: function (items) {
                     return ch.partMeans.labels[items[0].dataIndex]; } } } },
        scales: {
          x: { title: axisTitle('Pieza'), ticks: { maxRotation: 0, autoSkip: false } },
          y: { ticks: { callback: tickFormatter(ch.partMeans.values) } }
        }
      })
    });

    /* 6. Interaccion operador x pieza. Solo cruzado: el diseno anidado no la
          puede estimar porque ninguna pieza la miden dos operadores. */
    if (!ch.interaction) return;
    var allInter = [];
    ch.interaction.series.forEach(function (s) { allInter = allInter.concat(s.values); });
    make('chartInteraction', {
      type: 'line',
      data: {
        labels: shortPartLabels(ch.interaction.parts, ch.interaction.parts),
        datasets: ch.interaction.series.map(function (s, i) {
          return pointSeries(s.operator, s.values, PALETTE[i % PALETTE.length]);
        })
      },
      options: baseOptions({
        plugins: { tooltip: { callbacks: { title: function (items) {
          return ch.interaction.parts[items[0].dataIndex]; } } } },
        scales: {
          x: { title: axisTitle('Pieza'), ticks: { maxRotation: 0, autoSkip: false } },
          y: { ticks: { callback: tickFormatter(allInter) } }
        }
      })
    });
  }

  /* Un grupo por categoria: un punto por cada rango y una linea con el rango
     promedio del grupo. */
  /* Las tres graficas del metodo de atributos. Dos de concordancia -consigo
     mismo y contra el estandar-, con el intervalo de confianza encima y las
     lineas de 80 y 90 %; y una de los dos errores, que no comparten umbral. */
  function renderAttribute(result) {
    var ch = result.charts;

    var agreeChart = function (id, series, label) {
      if (!series.length) { skip(id); return; }
      make(id, {
        type: 'bar',
        data: {
          labels: series.map(function (d) { return d.label; }),
          datasets: [{
            label: label, data: series.map(function (d) { return d.pct; }),
            backgroundColor: PALETTE[0] + 'cc', borderColor: PALETTE[0], borderWidth: 1,
            maxBarThickness: 64
          }]
        },
        options: baseOptions({
          scales: {
            y: { min: 0, max: 100, title: axisTitle('% de piezas concordantes') },
            x: { title: axisTitle('Evaluador') }
          },
          plugins: {
            legend: { display: false },
            thresholdLines: { lines: [
              { value: 90, color: SEM_OK(), label: '90 %' },
              { value: 80, color: SEM_WARN(), label: '80 %' }
            ] },
            ciWhiskers: { datasetIndex: 0, ranges: series.map(function (d) {
              return { lo: d.lo, hi: d.hi };
            }) },
            tooltip: { callbacks: { label: function (item) {
              var d = series[item.dataIndex];
              return [label + ': ' + d.pct.toFixed(2) + ' %',
                      'IC 95 %: ' + d.lo.toFixed(1) + ' a ' + d.hi.toFixed(1) + ' %'];
            } } }
          }
        })
      });
    };

    agreeChart('chartWithin', ch.withinAppraiser, 'Consigo mismo');
    agreeChart('chartVsStandard', ch.vsStandard, 'Contra el estandar');

    /* Fuga y falsa alarma solo existen con estandar, escala binaria y una
       categoria de rechazo elegida (F-04: no se elige por el usuario). Sin
       ellas no hay grafica, y la caja se va con ella: el porque ya lo dice el
       aviso del motor y la nota de la Tabla 4, no hace falta un lienzo vacio
       repitiendolo en blanco. */
    if (!ch.errorRates.length || ch.errorRates[0].missRate === null) {
      skip('chartErrorRates');
    } else {
      make('chartErrorRates', {
        type: 'bar',
        data: {
          labels: ch.errorRates.map(function (d) { return d.label; }),
          datasets: [
            { label: 'Error de fuga', data: ch.errorRates.map(function (d) { return d.missRate; }),
              backgroundColor: PALETTE[1] + 'cc', borderColor: PALETTE[1], borderWidth: 1 },
            { label: 'Falsa alarma', data: ch.errorRates.map(function (d) { return d.falseAlarmRate; }),
              backgroundColor: PALETTE[3] + 'cc', borderColor: PALETTE[3], borderWidth: 1 }
          ]
        },
        options: baseOptions({
          scales: {
            y: { min: 0, title: axisTitle('% de decisiones') },
            x: { title: axisTitle('Evaluador') }
          },
          plugins: {
            thresholdLines: { lines: [
              { value: 2, color: SEM_OK(), label: 'fuga 2 %' },
              { value: 5, color: SEM_WARN(), label: 'falsa alarma 5 %' }
            ] },
            tooltip: { callbacks: { afterBody: function (items) {
              return items.length && items[0].datasetIndex === 0
                ? 'La fuga se juzga contra 2 %; la falsa alarma contra 5 %.'
                : '';
            } } }
          }
        })
      });
    }
  }

  function rangeChart(id, groups, title, shorten) {
    if (!groups || !groups.length) return;   // el anidado no publica rangesByPart
    var labels = groups.map(function (g) { return g.label; });
    if (shorten) labels = shortPartLabels(labels, labels);
    var points = [], all = [];
    groups.forEach(function (g, i) {
      g.values.forEach(function (v) { points.push({ x: i, y: v }); all.push(v); });
    });
    make(id, {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Rango', data: points, backgroundColor: 'rgba(11,92,173,.45)', pointRadius: 3 },
          { label: 'Rango promedio', type: 'line',
            data: groups.map(function (g, i) { return { x: i, y: g.mean }; }),
            borderColor: PALETTE[1], backgroundColor: PALETTE[1], borderWidth: 1.6,
            pointRadius: 4, pointStyle: 'rectRot', fill: false }
        ]
      },
      options: baseOptions({
        scales: {
          // Eje lineal para poder apilar varios puntos sobre la misma categoria.
          // Las marcas se fijan a mano en 0, 1, 2...: con stepSize sobre un eje
          // que empieza en -0.5, Chart.js las pone en -0.5, 0.5, 1.5... y ningun
          // rotulo caia sobre su grupo.
          x: { type: 'linear', min: -0.5, max: labels.length - 0.5,
               title: axisTitle(title),
               afterBuildTicks: function (axis) {
                 axis.ticks = labels.map(function (_, i) { return { value: i }; });
               },
               ticks: { callback: function (v) { return labels[v] || ''; },
                        autoSkip: false, maxRotation: 0, font: { size: 10 }, color: TICK() } },
          y: { beginAtZero: true, ticks: { callback: tickFormatter(all) } }
        }
      })
    });
  }

  function fmt(v) {
    if (!isFinite(v)) return '-';
    var a = Math.abs(v);
    if (a === 0) return '0';
    if (a < 1e-4 || a >= 1e6) return v.toExponential(2);
    return String(Number(v.toPrecision(4)));
  }

  global.MSACharts = { render: render, destroyAll: destroyAll, resizeAll: resizeAll, PALETTE: PALETTE };
})(typeof window !== 'undefined' ? window : globalThis);
