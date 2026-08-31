/* ============================================================================
 * report.js - El encabezado del reporte impreso, como modelo puro.
 *
 * POR QUE EXISTE ESTE ARCHIVO
 *
 * El encabezado se armaba dentro de app.js leyendo el resultado a mano, y daba
 * por hecho la forma de respuesta de los metodos de variables. Un estudio de
 * atributos no tiene metrics.pctStudyVar, asi que `r.metrics.pctStudyVar
 * .toFixed(2)` lanzaba TypeError, la preparacion abortaba entera y el tercer
 * metodo se quedaba sin reporte (F-03 de la auditoria).
 *
 * El arreglo no es un `if` mas: es sacar la decision de que filas van en cada
 * metodo a una funcion SIN DOM, que se puede probar en Node contra los tres
 * resultados reales. Mientras eso viva pegado al DOM, la unica manera de
 * detectar el fallo es abrir el navegador e imprimir.
 *
 * TRES REGLAS QUE ESTA FUNCION HACE CUMPLIR
 *
 *   1. No se inventan para atributos campos propios de variables. Un estudio
 *      de concordancia no tiene componentes de varianza, y ponerle un renglon
 *      vacio de "% Study Variation" seria decir que existe y no se pudo.
 *   2. Lo que no aplica NO SE IMPRIME. No se imprime "Alfa: no aplica" ni
 *      "NDC: -": la fila entera desaparece. Alfa solo existe en el cruzado
 *      -- el anidado no tiene interaccion que probar y atributos no tiene
 *      ANOVA --, y el multiplicador y la especificacion solo en variables.
 *   3. Lo que SI aplica pero no se pudo calcular dice "No evaluable", nunca
 *      undefined, null ni NaN. Son dos cosas distintas y se leen distinto:
 *      una fila ausente dice "aqui no hay tal cosa"; "No evaluable" dice
 *      "esto existe y este estudio no lo determina".
 *
 * Sin dependencias. Sin DOM. Determinista. Reutilizable desde los tests.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var NO_EVAL = 'No evaluable';

  /** Numero -> texto, con "No evaluable" para null, undefined, NaN e Infinity. */
  function numOr(v, decimals, suffix) {
    if (v === null || v === undefined || typeof v !== 'number' || !isFinite(v)) return NO_EVAL;
    return v.toFixed(decimals === undefined ? 2 : decimals) + (suffix || '');
  }

  /** Texto -> texto, con "No evaluable" para vacio, null y undefined. */
  function textOr(v) {
    if (v === null || v === undefined) return NO_EVAL;
    var s = String(v).trim();
    return s === '' || s === 'undefined' || s === 'null' || s === 'NaN' ? NO_EVAL : s;
  }

  /* ------------------------------------------------------------------------
   * headerRows(result, ctx) -> [[etiqueta, valor], ...]
   *
   *   result  lo que devuelve el motor activo, o null si aun no se ha
   *           calculado nada (la pagina se puede imprimir sin resultados).
   *   ctx     los datos que solo viven en la pantalla, ya leidos por quien
   *           llama, para que esta funcion no toque el DOM:
   *             date          fecha ya formateada
   *             method        'cruzado' | 'anidado' | 'atributos'
   *             operators     numero de operadores o evaluadores capturados
   *             parts         piezas por operador (anidado) o piezas (resto)
   *             replicates    replicas por celda
   *             countLabel    'piezas' | 'piezas por operador'
   *             spec          etiqueta de la especificacion (solo variables)
   *             multiplier    '6' | '5.15'                (solo variables)
   *             alpha         '0.25' | '0.05' | '0.10'    (solo cruzado)
   * ----------------------------------------------------------------------*/
  function headerRows(result, ctx) {
    var c = ctx || {};
    var attr = !!(result && result.model === 'attribute');
    var rows = [['Fecha', textOr(c.date)]];

    /* Tamano del estudio. En atributos las palabras cambian porque las cosas
       son otras: no hay operadores midiendo, hay evaluadores clasificando, y
       lo que sale de cada celda no es una medicion sino una clasificacion. */
    var nOp = Number(c.operators) || 0, nPt = Number(c.parts) || 0, nRep = Number(c.replicates) || 0;
    rows.push(['Estudio',
      nOp + (attr ? ' evaluadores x ' : ' operadores x ') + nPt + ' ' +
      (c.countLabel || 'piezas') + ' x ' + nRep + ' replicas = ' + (nOp * nPt * nRep) + ' ' +
      (attr ? 'clasificaciones' : 'mediciones')]);

    return attr ? attributeRows(rows, result) : variableRows(rows, result, c);
  }

  /* --- Variables: cruzado y anidado -------------------------------------- */
  function variableRows(rows, r, c) {
    rows.push(['Especificacion', textOr(c.spec)]);
    rows.push(['Multiplicador', textOr(c.multiplier) === NO_EVAL ? NO_EVAL : c.multiplier + ' sigma']);
    /* Alfa solo en el cruzado: es el nivel de la prueba F de la interaccion, y
       el anidado no tiene interaccion estimable que probar. Antes se imprimia
       "Alfa: no aplica", que ocupa un renglon para no decir nada. */
    if (c.method === 'cruzado') rows.push(['Alfa', textOr(c.alpha)]);

    if (!r) {
      rows.push(['Modelo', 'Sin calcular']);
      return rows;
    }
    rows.push(['Modelo',
      r.model === 'nested' ? 'Anidado (sin interaccion estimable)'
      : r.model === 'with-interaction' ? 'Con interaccion'
      : r.model === 'without-interaction' ? 'Sin interaccion (agrupada)'
      : NO_EVAL]);
    rows.push(['% Study Variation (GRR)',
      numOr(r.metrics && r.metrics.pctStudyVar, 2, ' %')]);
    rows.push(['Categorias distintas', textOr(r.ndcLabel)]);
    rows.push(['Discriminacion', textOr(r.discrimination && r.discrimination.label)]);
    if (r.inconclusive) rows.push(['Veredicto', 'Estudio no concluyente']);
    return rows;
  }

  /* --- Atributos ---------------------------------------------------------
   * Ni %GRR, ni NDC, ni alfa, ni multiplicador, ni especificacion: ninguna de
   * esas cosas existe en un estudio de concordancia. Lo que va en su lugar son
   * las cifras con las que se decide un estudio por atributos. */
  function attributeRows(rows, r) {
    var m = r.meta || {}, k = r.metrics || {};
    rows.push(['Categorias', (m.categories || []).join(', ') || NO_EVAL]);
    rows.push(['Estandar', m.hasStandard
      ? 'si, ' + Object.keys(m.standardOf || {}).length + ' de ' + (m.parts || []).length + ' piezas'
      : 'no capturado']);

    /* La categoria de rechazo solo tiene sentido con dos categorias, y sin
       ella no se publican efectividad, fuga ni falsa alarma (F-04). Si falta,
       se dice "sin elegir" y no "No evaluable": no es que no se pudiera
       calcular, es que nadie la eligio. */
    if (m.hasStandard && (m.categories || []).length === 2) {
      rows.push(['Categoria de rechazo', m.rejectCategory
        ? '"' + m.rejectCategory + '" (conforme: "' + m.acceptCategory + '")'
        : 'sin elegir']);
    }

    if (r.withinAppraiser && r.withinAppraiser.length) {
      rows.push(['Dentro del evaluador (peor)', numOr(k.worstWithin, 2, ' %')]);
    }
    rows.push(['Entre evaluadores', numOr(k.between, 2, ' %')]);
    if (m.hasStandard) rows.push(['Todos vs estandar', numOr(k.allVsStandard, 2, ' %')]);
    rows.push(['Kappa (' + (k.kappaSource || 'sin fuente') + ')', numOr(k.kappa, 4)]);

    /* Las tres cifras de decision binaria solo si se calcularon. */
    if (r.effectiveness && r.effectiveness.length) {
      rows.push(['Efectividad (peor)', numOr(k.worstEffectiveness, 2, ' %')]);
      rows.push(['Error de fuga (peor)', numOr(k.worstMiss, 2, ' %')]);
      rows.push(['Falsa alarma (peor)', numOr(k.worstFalseAlarm, 2, ' %')]);
    }
    return rows;
  }

  global.MSAReport = { headerRows: headerRows, NO_EVAL: NO_EVAL,
                       numOr: numOr, textOr: textOr };
})(typeof window !== 'undefined' ? window : globalThis);
