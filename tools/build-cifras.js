#!/usr/bin/env node
/* ============================================================================
 * build-cifras.js - Escribe las cifras de la documentacion desde el repositorio.
 *
 * Las cifras estaban transcritas a mano y se despegaron: docs/pruebas.md decia
 * 192 pruebas cuando la suite corria 230, y la tabla de validacion vivia
 * duplicada en README.md y en docs/motores.md, asi que tocaba acordarse de
 * cambiar las dos.
 *
 * Aqui no hay ninguna cifra escrita a mano salvo la columna de valores
 * PUBLICADOS por Minitab, que es una constante externa y no algo que este
 * repositorio pueda calcular. Todo lo demas sale de correr el motor sobre
 * datasets/aiag-msa4.json y de contar las pruebas que registran las suites.
 *
 *   node tools/build-cifras.js            # reescribe los bloques
 *   node tools/build-cifras.js --check    # no escribe: falla si se despegaron
 *
 * En --check tambien falla si el motor deja de reproducir los valores
 * publicados por Minitab, de modo que la tabla del README no puede quedarse
 * bonita mientras el calculo se degrada.
 * ==========================================================================*/
'use strict';

var fs = require('fs');
var path = require('path');

var ROOT = path.join(__dirname, '..');
var CHECK = process.argv.indexOf('--check') !== -1;

/* --- Valores publicados por Minitab para gageaiag.mtw -----------------------
 * Unica constante escrita a mano del archivo. Fuente: dataset del apendice del
 * manual AIAG MSA 4a ed., que Minitab distribuye como gageaiag.mtw. La columna
 * "Minitab publicado" del README sale de aqui; la columna "MSA Toolkit", de
 * correr el motor. Si las dos dejan de coincidir, --check falla.
 * -------------------------------------------------------------------------*/
var MINITAB = {
  ss:       { parte: 88.3619, operador: 3.1673, interaccion: 0.3590, repetibilidad: 2.7589 },
  fInt:     0.434,
  pInt:     0.974,
  pctContribucion: 7.76,
  pctStudyVar:     27.86,
  ndc:      4
};

/* Tolerancias de comparacion: la ultima cifra que el valor publicado imprime. */
var TOL = { ss: 5e-5, f: 5e-4, p: 5e-4, pct: 5e-3, ndc: 0 };

// --- Calculo -----------------------------------------------------------------

function cargarMotor() {
  require(path.join(ROOT, 'assets/js/design.js'));
  require(path.join(ROOT, 'assets/js/stats.js'));
  require(path.join(ROOT, 'assets/js/anova.js'));
  require(path.join(ROOT, 'assets/js/anova-nested.js'));
  require(path.join(ROOT, 'assets/js/attribute.js'));
  require(path.join(ROOT, 'assets/js/report.js'));
  require(path.join(ROOT, 'assets/js/mls.js'));
  require(path.join(ROOT, 'assets/js/interval.js'));
}

/** Corre el motor cruzado sobre el dataset AIAG y devuelve las cifras. */
function validacion() {
  var dataset = require(path.join(ROOT, 'datasets/aiag-msa4.json'));
  var res = globalThis.MSAAnova.compute(dataset.data, {});
  function sc(source) {
    var fila = res.anovaFull.rows.filter(function (r) { return r.source === source; })[0];
    if (!fila) throw new Error('El motor ya no publica la fila «' + source + '» de la tabla ANOVA.');
    return fila.ss;
  }
  return {
    ss: {
      parte:         sc('Parte'),
      operador:      sc('Operador'),
      interaccion:   sc('Operador * Parte'),
      repetibilidad: sc('Repetibilidad')
    },
    fInt: res.interactionTest.f,
    pInt: res.interactionTest.p,
    pctContribucion: res.metrics.pctContribution,
    pctStudyVar:     res.metrics.pctStudyVar,
    ndc: res.ndc
  };
}

/**
 * Cuenta las pruebas cargando las mismas suites que run-node.js, sin llamar a
 * report(): report() imprime y fija process.exitCode, y aqui solo hace falta el
 * total. La lista se lee de run-node.js para que agregar una suite alla no deje
 * este conteo corto sin que nadie lo note.
 */
function totalPruebas() {
  var runner = fs.readFileSync(path.join(ROOT, 'tests/run-node.js'), 'utf8');
  var suites = [];
  var re = /require\('\.\/(tests[^']*\.js)'\)/g, m;
  while ((m = re.exec(runner)) !== null) suites.push(m[1]);
  if (!suites.length) throw new Error('No se encontraron suites en tests/run-node.js.');

  require(path.join(ROOT, 'tests/harness.js'));
  suites.forEach(function (s) { require(path.join(ROOT, 'tests', s)); });

  var total = globalThis.MSATestKit.results.length;
  if (!total) throw new Error('Las suites no registraron ninguna prueba.');
  return total;
}

// --- Comparacion contra Minitab ----------------------------------------------

function comprobarContraMinitab(v) {
  var fallos = [];
  function cmp(what, actual, esperado, tol) {
    if (Math.abs(actual - esperado) > tol) {
      fallos.push('  ' + what + ': el motor da ' + actual + ', Minitab publica ' + esperado);
    }
  }
  Object.keys(MINITAB.ss).forEach(function (k) {
    cmp('SC ' + k, v.ss[k], MINITAB.ss[k], TOL.ss);
  });
  cmp('F interaccion',        v.fInt, MINITAB.fInt, TOL.f);
  cmp('p interaccion',        v.pInt, MINITAB.pInt, TOL.p);
  cmp('% Contribucion',       v.pctContribucion, MINITAB.pctContribucion, TOL.pct);
  cmp('% Study Variation',    v.pctStudyVar, MINITAB.pctStudyVar, TOL.pct);
  cmp('NDC',                  v.ndc, MINITAB.ndc, TOL.ndc);
  return fallos;
}

// --- Bloques generados -------------------------------------------------------

var AVISO = '<!-- Generado por tools/build-cifras.js desde datasets/ y tests/.\n' +
            '     No editar a mano: se regenera, y el CI lo verifica con --check. -->';

function d(x, n) { return x.toFixed(n); }

function tablaValidacion(v) {
  return [
    AVISO,
    '',
    '| Cantidad | MSA Toolkit | Minitab publicado |',
    '|---|---|---|',
    '| SC Parte / Operador / Interacción / Repetibilidad | ' +
      [d(v.ss.parte, 4), d(v.ss.operador, 4), d(v.ss.interaccion, 4), d(v.ss.repetibilidad, 4)].join(' / ') +
      ' | idem |',
    '| F interacción, p | ' + d(v.fInt, 3) + ', ' + d(v.pInt, 4) + ' | ' +
      d(MINITAB.fInt, 3) + ', ' + d(MINITAB.pInt, 3) + ' |',
    '| % Contribución Gage R&R | ' + d(v.pctContribucion, 2) + ' % | ' + d(MINITAB.pctContribucion, 2) + ' % |',
    '| % Study Variation Gage R&R | ' + d(v.pctStudyVar, 2) + ' % | ' + d(MINITAB.pctStudyVar, 2) + ' % |',
    '| NDC | ' + v.ndc + ' | ' + MINITAB.ndc + ' |'
  ].join('\n');
}

function conteoPruebas(total) {
  return [
    AVISO,
    '',
    total + ' pruebas de regresión entre los modelos puros —todas sobre el cálculo:',
    'corren en Node, sin navegador, y no tocan la pantalla.'
  ].join('\n');
}

// --- Reescritura de los marcadores -------------------------------------------

function marcadores(nombre) {
  return {
    inicio: '<!-- CIFRAS:INICIO ' + nombre + ' -->',
    fin:    '<!-- CIFRAS:FIN ' + nombre + ' -->'
  };
}

/** Sustituye el cuerpo entre marcadores. Devuelve el texto nuevo. */
function sustituir(texto, archivo, nombre, cuerpo) {
  var m = marcadores(nombre);
  var i = texto.indexOf(m.inicio);
  var j = texto.indexOf(m.fin);
  if (i === -1 || j === -1) {
    throw new Error('Faltan los marcadores «' + nombre + '» en ' + archivo + '.\n' +
                    'Se esperaba ' + m.inicio + ' ... ' + m.fin + '.');
  }
  if (j < i) throw new Error('Los marcadores «' + nombre + '» estan invertidos en ' + archivo + '.');
  return texto.slice(0, i + m.inicio.length) + '\n' + cuerpo + '\n' + texto.slice(j);
}

// --- Principal ---------------------------------------------------------------

function main() {
  cargarMotor();
  var v = validacion();
  var total = totalPruebas();

  if (CHECK) {
    var desviados = comprobarContraMinitab(v);
    if (desviados.length) {
      console.error('El motor ya no reproduce los valores publicados de Minitab:');
      desviados.forEach(function (l) { console.error(l); });
      console.error('\nEsto no se arregla regenerando el README: es el calculo el que cambio.');
      process.exit(1);
    }
  }

  var bloques = [
    { archivo: 'README.md',        nombre: 'validacion', cuerpo: tablaValidacion(v) },
    { archivo: 'docs/motores.md',  nombre: 'validacion', cuerpo: tablaValidacion(v) },
    { archivo: 'docs/pruebas.md',  nombre: 'pruebas',    cuerpo: conteoPruebas(total) }
  ];

  var despegados = [];
  bloques.forEach(function (b) {
    var ruta = path.join(ROOT, b.archivo);
    var antes = fs.readFileSync(ruta, 'utf8');
    var despues = sustituir(antes, b.archivo, b.nombre, b.cuerpo);
    if (antes === despues) return;
    if (CHECK) { despegados.push(b.archivo + ' («' + b.nombre + '»)'); return; }
    fs.writeFileSync(ruta, despues);
    console.log('actualizado  ' + b.archivo + ' («' + b.nombre + '»)');
  });

  if (CHECK) {
    if (despegados.length) {
      console.error('Las cifras de la documentacion se despegaron de los datos:');
      despegados.forEach(function (f) { console.error('  ' + f); });
      console.error('\nRegenerarlas es parte del cambio, no del despliegue:');
      console.error('  node tools/build-cifras.js');
      process.exit(1);
    }
    console.log('Las cifras de la documentacion coinciden con los datos (' + total + ' pruebas).');
    return;
  }

  console.log('Cifras al dia: ' + total + ' pruebas, %GRR ' + d(v.pctStudyVar, 2) + ' %, NDC ' + v.ndc + '.');
}

try {
  main();
} catch (e) {
  console.error('build-cifras: ' + e.message);
  process.exit(1);
}
