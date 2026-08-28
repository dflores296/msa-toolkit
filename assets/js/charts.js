/* ============================================================================
 * charts.js - Las seis graficas del estudio, sobre Chart.js.
 * Sin redondeo de los datos antes de graficar (el VBA redondeaba a 4 dp).
 * ==========================================================================*/
(function (global) {
  'use strict';

  var PALETTE = ['#0b5cad', '#b3261e', '#1c7a4a', '#9a6206', '#6b3fa0', '#0f7c8a', '#a34a7f'];
  var GRID = '#e6e9ed';
  var TICK = '#5a6673';
  var registry = {};

  function destroyAll() {
    Object.keys(registry).forEach(function (k) {
      if (registry[k]) { registry[k].destroy(); registry[k] = null; }
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
          labels: { boxWidth: 22, boxHeight: 2, font: { size: 11 }, padding: 10, usePointStyle: false }
        },
        tooltip: { titleFont: { size: 11 }, bodyFont: { size: 11 } }
      },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 10 }, color: TICK, maxRotation: 60, minRotation: 0 } },
        y: { grid: { color: GRID }, ticks: { font: { size: 10 }, color: TICK } }
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

  function pct(v) { return (100 * v).toFixed(1) + ' %'; }

  /* Colores exactos del libro de Excel para el semaforo AIAG. */
  var SEMAFORO = { ok: '#00B050', warn: '#FFC000', bad: '#FF0000', resto: '#D9D9D9' };
  function colorAIAG(v) {
    if (v <= 0.10) return SEMAFORO.ok;
    if (v <= 0.30) return SEMAFORO.warn;
    return SEMAFORO.bad;
  }

  /* ---------------------------------------------------------------------- *
   * Evaluacion de la variacion del estudio (barras apiladas horizontales).
   * Replica GraficarBarraStudyVariationConTolerance del VBA:
   *  - barra de color segun el criterio AIAG sobre pista gris hasta 100 %
   *  - el valor se RECORTA a 100 % para dibujar, pero la etiqueta muestra
   *    el valor real (asi un 205 % de tolerancia sigue siendo legible)
   *  - etiqueta en caja blanca con borde negro, pegada al inicio de la
   *    barra si el valor es <= 50 %, y al final si es mayor
   * ---------------------------------------------------------------------- */
  function renderEvaluation(result) {
    var el = document.getElementById('chartEvaluation');
    if (!el) return;

    var sv = result.metrics.pctStudyVar / 100;
    var tol = result.metrics.pctTolerance === null ? null : result.metrics.pctTolerance / 100;

    // Orden visual de arriba hacia abajo: Tolerance primero, luego Study Variation.
    var rows = [];
    if (tol !== null) rows.push({ label: 'Total Gage – Tolerance', value: tol });
    rows.push({ label: 'Total Gage – Study Variation', value: sv });

    var real = rows.map(function (r) { return r.value; });
    var clamped = real.map(function (v) { return Math.min(v, 1); });

    var labelPlugin = {
      id: 'msaBarLabels',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx, meta = chart.getDatasetMeta(0);
        ctx.save();
        ctx.font = 'bold 11px ' + getComputedStyle(document.body).fontFamily;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        meta.data.forEach(function (bar, i) {
          var text = (100 * real[i]).toFixed(2) + ' %';
          var w = ctx.measureText(text).width + 12, h = 19;
          var x = real[i] <= 0.5 ? bar.base + 3 : bar.x - w - 3;
          // Nunca dejar la caja fuera del area de dibujo.
          x = Math.max(chart.chartArea.left + 1, Math.min(x, chart.chartArea.right - w - 1));
          var y = bar.y;
          ctx.fillStyle = '#ffffff';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1;
          ctx.fillRect(x, y - h / 2, w, h);
          ctx.strokeRect(x, y - h / 2, w, h);
          ctx.fillStyle = '#000000';
          ctx.fillText(text, x + w / 2, y + 0.5);
        });
        ctx.restore();
      }
    };

    if (registry.chartEvaluation) registry.chartEvaluation.destroy();
    registry.chartEvaluation = new Chart(el.getContext('2d'), {
      type: 'bar',
      data: {
        labels: rows.map(function (r) { return r.label; }),
        datasets: [
          {
            label: 'Valor',
            data: clamped,
            backgroundColor: real.map(colorAIAG),
            borderColor: '#000000',
            borderWidth: 1
          },
          {
            label: 'Resto',
            data: clamped.map(function (v) { return 1 - v; }),
            backgroundColor: SEMAFORO.resto,
            borderColor: '#bfbfbf',
            borderWidth: 1
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            filter: function (c) { return c.datasetIndex === 0; },
            callbacks: {
              label: function (c) { return (100 * real[c.dataIndex]).toFixed(2) + ' %'; }
            }
          }
        },
        scales: {
          x: {
            stacked: true, min: 0, max: 1,
            grid: { display: false },
            ticks: { stepSize: 0.1, callback: function (v) { return Math.round(100 * v) + ' %'; },
                     font: { size: 10 }, color: TICK }
          },
          y: {
            stacked: true,
            grid: { display: false },
            ticks: { font: { size: 11 }, color: TICK }
          }
        }
      },
      plugins: [labelPlugin]
    });
  }

  /* ---------------------------------------------------------------------- *
   * render(result) - dibuja las 6 graficas a partir del objeto de compute()
   * ---------------------------------------------------------------------- */
  function render(result) {
    var ch = result.charts;
    var comps = {};
    result.components.forEach(function (c) { comps[c.key] = c; });

    /* 0. Evaluacion del estudio (semaforo AIAG) */
    renderEvaluation(result);

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
      ds1.push({ label: '% Tolerance', data: order.map(function (k) { return 100 * comps[k].pctTolerance; }),
                 backgroundColor: PALETTE[3] });
    }
    make('chartComponents', {
      type: 'bar',
      data: { labels: labels1, datasets: ds1 },
      options: baseOptions({
        scales: {
          y: { beginAtZero: true, ticks: { callback: function (v) { return v + ' %'; } } }
        },
        plugins: { tooltip: { callbacks: { label: function (c) {
          return c.dataset.label + ': ' + c.parsed.y.toFixed(2) + ' %'; } } } }
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
                        font: { size: 10 }, color: TICK } },
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

  global.MSACharts = { render: render, destroyAll: destroyAll, PALETTE: PALETTE };
})(typeof window !== 'undefined' ? window : globalThis);
