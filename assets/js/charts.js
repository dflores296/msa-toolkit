/* ============================================================================
 * charts.js - Las seis graficas del estudio, sobre Chart.js.
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

  function merge(a, b) {
    Object.keys(b).forEach(function (k) {
      if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k]) && a[k] && typeof a[k] === 'object') {
        merge(a[k], b[k]);
      } else { a[k] = b[k]; }
    });
    return a;
  }

  function make(id, config) {
    var el = document.getElementById(id);
    if (!el) return;
    if (registry[id]) registry[id].destroy();
    registry[id] = new Chart(el.getContext('2d'), config);
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
   * render(result) - dibuja las 6 graficas a partir del objeto de compute()
   * La barra "Evaluacion de la variacion" ya no vive aqui: es un widget
   * HTML/CSS (ver renderEvalBars en app.js), no una grafica de Chart.js.
   * ---------------------------------------------------------------------- */
  function render(result) {
    var ch = result.charts;
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
    if (ch.rChart.available) {
      var n = ch.labels.length;
      make('chartR', {
        type: 'line',
        data: {
          labels: ch.labels,
          datasets: [
            pointSeries('Rango', ch.rChart.values, PALETTE[0]),
            limitSeries('LCS = ' + fmt(ch.rChart.ucl), ch.rChart.ucl, n, PALETTE[1], true),
            limitSeries('R promedio = ' + fmt(ch.rChart.center), ch.rChart.center, n, PALETTE[2], false),
            limitSeries('LCI = ' + fmt(ch.rChart.lcl), ch.rChart.lcl, n, PALETTE[1], true)
          ]
        },
        options: baseOptions({
          scales: { y: { ticks: { callback: tickFormatter(
            ch.rChart.values.concat([ch.rChart.ucl, ch.rChart.lcl])) } } }
        })
      });
    }

    /* 3. Carta X-barra por operador */
    if (ch.xbarChart.available) {
      var m = ch.labels.length;
      make('chartXbar', {
        type: 'line',
        data: {
          labels: ch.labels,
          datasets: [
            pointSeries('Media', ch.xbarChart.values, PALETTE[0]),
            limitSeries('LCS = ' + fmt(ch.xbarChart.ucl), ch.xbarChart.ucl, m, PALETTE[1], true),
            limitSeries('X doble barra = ' + fmt(ch.xbarChart.center), ch.xbarChart.center, m, PALETTE[2], false),
            limitSeries('LCI = ' + fmt(ch.xbarChart.lcl), ch.xbarChart.lcl, m, PALETTE[1], true)
          ]
        },
        options: baseOptions({
          scales: { y: { ticks: { callback: tickFormatter(
            ch.xbarChart.values.concat([ch.xbarChart.ucl, ch.xbarChart.lcl])) } } }
        })
      });
    }

    /* 4. Mediciones por operador (dispersion + media) */
    var opLabels = ch.byOperator.map(function (o) { return o.operator; });
    var scatter = [];
    ch.byOperator.forEach(function (o, i) {
      o.values.forEach(function (v) { scatter.push({ x: i, y: v }); });
    });
    make('chartByOperator', {
      type: 'scatter',
      data: {
        datasets: [
          { label: 'Mediciones', data: scatter, backgroundColor: 'rgba(11,92,173,.45)',
            pointRadius: 3 },
          { label: 'Media del operador', type: 'line',
            data: ch.byOperator.map(function (o, i) { return { x: i, y: o.mean }; }),
            borderColor: PALETTE[1], backgroundColor: PALETTE[1], borderWidth: 1.6,
            pointRadius: 5, pointStyle: 'rectRot', fill: false }
        ]
      },
      options: baseOptions({
        scales: {
          x: { type: 'linear', min: -0.5, max: opLabels.length - 0.5,
               ticks: { stepSize: 1, callback: function (v) { return opLabels[v] || ''; },
                        font: { size: 10 }, color: TICK() } },
          y: { ticks: { callback: tickFormatter(scatter.map(function (p) { return p.y; })) } }
        }
      })
    });

    /* 5. Promedio de medicion por pieza */
    make('chartPartMeans', {
      type: 'line',
      data: {
        labels: ch.partMeans.labels,
        datasets: [pointSeries('Promedio por pieza', ch.partMeans.values, PALETTE[0])]
      },
      options: baseOptions({
        plugins: { legend: { display: false } },
        scales: { y: { ticks: { callback: tickFormatter(ch.partMeans.values) } } }
      })
    });

    /* 6. Interaccion operador x pieza */
    var allInter = [];
    ch.interaction.series.forEach(function (s) { allInter = allInter.concat(s.values); });
    make('chartInteraction', {
      type: 'line',
      data: {
        labels: ch.interaction.parts,
        datasets: ch.interaction.series.map(function (s, i) {
          return pointSeries(s.operator, s.values, PALETTE[i % PALETTE.length]);
        })
      },
      options: baseOptions({
        scales: { y: { ticks: { callback: tickFormatter(allInter) } } }
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
