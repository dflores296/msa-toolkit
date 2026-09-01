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
 * F-03.1 -- LA BRECHA QUE QUEDO ABIERTA
 *
 * La correccion de F-03 dedujo el metodo de `result.model`, y solo de ahi.
 * Con `result === null` -- la pagina se puede imprimir sin haber calculado --
 * no hay `model` del que deducirlo, asi que un estudio de ATRIBUTOS caia en
 * la rama de variables y se imprimia "3 operadores x 30 piezas = 270
 * mediciones", "Especificacion" y "Multiplicador". Es la regla 1 de arriba,
 * incumplida en el unico caso que la regla 1 no miraba.
 *
 * Ahora el metodo se resuelve por prioridad, en `studyKind`:
 *   a) si hay `result`, manda `result.model`;
 *   b) si no lo hay, manda `ctx.method`, que es el metodo activo en pantalla;
 *   c) si no hay ninguno de los dos, encabezado NEUTRAL: fecha, tamano sin
 *      adjetivar y "Sin calcular". Nada que presuponga una familia de metodo.
 *
 * No es un `if` mas en el sitio de siempre: `result.model` y `ctx.method` son
 * dos fuentes distintas de la misma verdad, y lo que faltaba era decir cual
 * manda cuando solo existe una.
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
   *             rejectCategory  categoria de rechazo elegida (solo atributos)
   * ----------------------------------------------------------------------*/

  /* De que familia es este estudio, por prioridad (F-03.1).
     Devuelve 'atributos', 'variables' o null (nada de lo que fiarse). */
  function studyKind(result, c) {
    if (result && result.model) {                    // a) manda el resultado
      return result.model === 'attribute' ? 'atributos' : 'variables';
    }
    var m = c && c.method;                           // b) manda el metodo activo
    if (m === 'atributos') return 'atributos';
    if (m === 'cruzado' || m === 'anidado') return 'variables';
    return null;                                     // c) neutral
  }

  /* Tamano del estudio. Las palabras cambian con la familia porque las cosas
     son otras: no hay operadores midiendo, hay evaluadores clasificando, y lo
     que sale de cada celda no es una medicion sino una clasificacion. Sin
     familia conocida no se adjetiva: se cuentan celdas y ya. */
  function sizeRow(c, kind) {
    var nOp = Number(c.operators) || 0, nPt = Number(c.parts) || 0, nRep = Number(c.replicates) || 0;
    var total = nOp * nPt * nRep;
    if (kind === null) return ['Estudio', nOp + ' x ' + nPt + ' x ' + nRep + ' = ' + total + ' celdas'];
    var attr = kind === 'atributos';
    return ['Estudio',
      nOp + (attr ? ' evaluadores x ' : ' operadores x ') + nPt + ' ' +
      (c.countLabel || 'piezas') + ' x ' + nRep + ' replicas = ' + total + ' ' +
      (attr ? 'clasificaciones' : 'mediciones')];
  }

  /* F-05: un resultado que ya no corresponde a los datos capturados no es un
     resultado, es un recuerdo. Se trata como "sin calcular" -- ninguna cifra
     suya llega al papel -- y se dice por que, en vez de imprimir el
     encabezado viejo junto a un anexo de mediciones nuevas. */
  var STALE_TEXT = 'Resultados desactualizados: los datos cambiaron despues de calcular. ' +
                   'Recalcula antes de usar este reporte.';

  function headerRows(result, ctx) {
    var c = ctx || {};
    var stale = !!c.stale && !!result;
    var effective = stale ? null : result;
    var kind = studyKind(effective, c);
    var rows = [['Fecha', textOr(c.date)]];
    rows.push(sizeRow(c, kind));
    if (stale) { rows.push(['Estado', STALE_TEXT]); return rows; }

    if (kind === 'atributos') {
      return effective ? attributeRows(rows, effective) : attributePendingRows(rows, c);
    }
    if (kind === 'variables') return variableRows(rows, effective, c);
    return neutralRows(rows);
  }

  /* --- Atributos sin calcular (F-03.1) -----------------------------------
   * Lo unico que se sabe antes de calcular es el tamano del estudio, que
   * metodo esta activo y si ya se eligio la categoria de rechazo. Se imprime
   * eso y nada mas: ni especificacion, ni multiplicador, ni alfa, ni modelo,
   * ni NDC, ni %Study Variation -- no existen en concordancia -- y tampoco
   * kappa, efectividad, fuga ni falsa alarma, que existen pero todavia no se
   * han calculado y ponerlas en blanco seria decir que fallaron. */
  function attributePendingRows(rows, c) {
    rows.push(['Metodo', 'Attribute Agreement Analysis']);
    /* Mismo estado que el "sin elegir" de un estudio ya calculado (F-04),
       visto un momento antes: nadie la ha elegido todavia. */
    var reject = (c.rejectCategory === null || c.rejectCategory === undefined)
                 ? '' : String(c.rejectCategory).trim();
    rows.push(['Categoria de rechazo', reject ? '"' + reject + '"' : 'No seleccionada']);
    rows.push(['Estado', 'Sin calcular']);
    return rows;
  }

  /* --- Ni resultado ni metodo (F-03.1, caso c) ---------------------------
   * No se presupone familia: sin `result` y sin un `ctx.method` reconocible,
   * cualquier fila especifica seria una invencion. */
  function neutralRows(rows) {
    rows.push(['Estado', 'Sin calcular']);
    return rows;
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
    /* F-07. Primero el dictamen, que sale de la ESTIMACION PUNTUAL, y despues
       el intervalo, con el nombre de su metodo. El orden importa: un reporte
       que abre con un intervalo invita a decidir con el, y decidir no es lo
       que este intervalo hace. Si no se pudo calcular, las filas desaparecen
       -- no se imprime un intervalo vacio. */
    if (r.assessment && r.assessment.studyVar) {
      rows.push(['Evaluacion AIAG basada en la estimacion puntual',
        textOr(r.assessment.studyVar.label)]);
    }
    if (r.interval && r.interval.studyVar && r.interval.studyVar.lo !== null) {
      rows.push(['IC ' + Math.round(100 * r.interval.conf) + ' % de la razon V_GRR / V_Total, ' +
        'en % Study Variation',
        numOr(r.interval.studyVar.lo, 2, ' %') + ' a ' + numOr(r.interval.studyVar.hi, 2, ' %')]);
      /* El rotulo viene dentro del propio intervalo, puesto por interval.js:
         pantalla y papel nombran el mismo metodo porque leen el mismo dato.
         El texto de reserva NO nombra ningun metodo: si el rotulo faltara,
         inventar uno aqui es justo el fallo que abrio F-07. */
      rows.push(['Estado del intervalo',
        textOr(r.interval.statusLabel ||
               'No utilizado para el dictamen.')]);
      if (r.intervalCross) rows.push(['Advertencia del intervalo', textOr(r.intervalCross.label)]);
    }
    rows.push(['% Contribucion equivalente',
      numOr(r.metrics && r.metrics.pctContribution, 2, ' %')]);
    rows.push(['Intervalo de % Tolerance', 'Pendiente de referencia validada']);
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

  global.MSAReport = { headerRows: headerRows, studyKind: studyKind,
                       STALE_TEXT: STALE_TEXT, NO_EVAL: NO_EVAL,
                       numOr: numOr, textOr: textOr };
})(typeof window !== 'undefined' ? window : globalThis);
