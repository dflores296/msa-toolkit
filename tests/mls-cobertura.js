/* ============================================================================
 * mls-cobertura.js - La evidencia que decide H*, y el contraste con el GPQ.
 *
 * NO es una suite de pruebas: no afirma nada, mide. Se corre a mano cuando hay
 * que rehacer la eleccion de H* o comprobar que el MLS sigue concordando con el
 * GPQ despues de tocar el modulo:
 *
 *     node tests/mls-cobertura.js [repeticiones]
 *
 * Las pruebas que SI afirman viven en tests/tests-mls.js. Este archivo existe
 * porque la eleccion de H* es una decision documentada, y una decision sin la
 * medicion al lado es una preferencia.
 *
 * QUE MIDE, Y POR QUE ASI
 *
 * H* solo aparece en el limite SUPERIOR de la razon parte/total, que por la
 * regla 1 - x es el limite INFERIOR de la razon gage/total. Asi que medir la
 * cobertura global no distingue entre candidatos: casi todo el error de
 * cobertura vive en el otro extremo. Lo que discrimina es la tasa de fallo POR
 * DEBAJO -cuantas veces la razon verdadera queda por debajo del limite
 * inferior-, que al 95 % bilateral tiene que valer 2.5 %.
 *
 * Un candidato que se queda muy por debajo del 2.5 % no es "seguro": es un
 * intervalo que regala anchura y ya no dice nada. Uno que se pasa del 2.5 %
 * miente sobre su propia confianza, que es peor.
 * ==========================================================================*/
var path = require('path');
var REPO = path.resolve(__dirname, '..');
require(path.join(REPO, 'assets/js/design.js'));
require(path.join(REPO, 'assets/js/stats.js'));
require(path.join(REPO, 'assets/js/anova.js'));
require(path.join(REPO, 'assets/js/mls.js'));
require(path.join(REPO, 'assets/js/interval.js'));

function maker(seed) {
  var s = seed >>> 0;
  function u() { s = (Math.imul(1103515245, s) + 12345) >>> 0; return (s + 0.5) / 4294967296; }
  return { nrm: function () { return Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u()); } };
}
function crossed(g, p, o, r, sP, sO, sI, sE) {
  var rows = [], pv = [], ov = [], iv = {}, i, j, k;
  for (i = 0; i < p; i++) pv.push(g.nrm() * sP);
  for (j = 0; j < o; j++) ov.push(g.nrm() * sO);
  for (j = 0; j < o; j++) for (i = 0; i < p; i++) iv[j + '|' + i] = g.nrm() * (sI || 0);
  for (j = 0; j < o; j++) for (i = 0; i < p; i++) for (k = 0; k < r; k++) {
    rows.push({ operator: 'Op' + j, part: 'P' + i,
                value: 100 + pv[i] + ov[j] + iv[j + '|' + i] + g.nrm() * sE });
  }
  return rows;
}
function fx(x, d) { return (100 * x).toFixed(d === undefined ? 2 : d) + ' %'; }
function mediana(a) { a.sort(function (x, y) { return x - y; }); return a[Math.floor(a.length / 2)]; }

var N = parseInt(process.argv[2] || '3000', 10);
var CONF = 0.95;
var MODOS = ['zero', 'hqr', 'product'];
var CASOS = [
  { n: '10x3x3 con interaccion', p: 10, o: 3, r: 3, sO: 0.10, sI: 0.12, sE: 0.25, inter: 'include' },
  { n: '10x3x3 sin interaccion', p: 10, o: 3, r: 3, sO: 0.10, sI: 0,    sE: 0.25, inter: 'exclude' },
  { n: '5x3x2   estudio chico',  p: 5,  o: 3, r: 2, sO: 0.05, sI: 0,    sE: 0.14, inter: 'exclude' },
  { n: '25x4x3  estudio grande', p: 25, o: 4, r: 3, sO: 0.06, sI: 0,    sE: 0.15, inter: 'exclude' },
  { n: '10x3x3  gage malo',      p: 10, o: 3, r: 3, sO: 0.30, sI: 0.25, sE: 0.45, inter: 'include' },
  { n: '25x4x3  gage pesimo',    p: 25, o: 4, r: 3, sO: 0.60, sI: 0,    sE: 0.90, inter: 'exclude' }
];

function msdf(res) {
  var wi = res.anova.some(function (x) { return x.source === 'Operador * Parte'; });
  var map = wi ? { 'Parte': 1, 'Operador': 2, 'Operador * Parte': 3, 'Repetibilidad': 4 }
               : { 'Parte': 1, 'Operador': 2, 'Repetibilidad': 3 };
  var ms = {}, df = {};
  res.anova.forEach(function (x) {
    if (map[x.source]) { ms[map[x.source]] = x.ms; df[map[x.source]] = x.df; }
  });
  return { ms: ms, df: df };
}

console.log('MLS - eleccion de H* por cobertura medida');
console.log('Confianza nominal ' + fx(CONF, 0) + ', ' + N + ' estudios por caso.');
console.log('La columna que decide es el fallo POR DEBAJO: nominal 2.50 %.');
console.log('Un candidato muy por debajo regala anchura; uno por encima miente.\n');

var cab = ['caso', 'razon real', 'zero', 'hqr', 'product', 'fallo arriba', 'Satt.'];
console.log(cab.join('\t'));
CASOS.forEach(function (c, ci) {
  var grr = c.sO * c.sO + c.sI * c.sI + c.sE * c.sE;
  var real = grr / (grr + 1);
  var bajo = { zero: 0, hqr: 0, product: 0 }, alto = 0, satt = 0, n = 0;
  var g = maker(20260831 + ci * 7919);
  for (var t = 0; t < N; t++) {
    var res = MSAAnova.compute(crossed(g, c.p, c.o, c.r, 1, c.sO, c.sI, c.sE),
                               { interaction: c.inter });
    var x = msdf(res);
    var ok = true;
    MODOS.forEach(function (m) {
      var iv = MSAMls.gageTotal(x.ms, x.df, { I: c.p, J: c.o, K: c.r },
                                { conf: CONF, hStar: m });
      if (!iv) { ok = false; return; }
      if (m === 'zero') {
        if (iv.method === 'Satterthwaite') satt++;
        if (real > iv.hi) alto++;
      }
      if (real < iv.lo) bajo[m]++;
    });
    if (ok) n++;
  }
  console.log([c.n, fx(real), fx(bajo.zero / n), fx(bajo.hqr / n), fx(bajo.product / n),
               fx(alto / n), fx(satt / n, 1)].join('\t'));
});

console.log('\n\nContraste con el GPQ: dos metodos independientes sobre los mismos estudios.');
console.log('Si el MLS estuviera mal transcrito, las anchuras se separarian.\n');
console.log(['diseno', 'ancho MLS', 'ancho GPQ', 'LI=0', 'LS=100'].join('\t'));
[[10, 3, 3, 'include'], [10, 3, 3, 'exclude'], [10, 4, 3, 'exclude'],
 [10, 5, 3, 'exclude'], [25, 4, 4, 'exclude']].forEach(function (d, di) {
  var g = maker(555 + di * 131), wM = [], wG = [], z = 0, h = 0, n = 0;
  var reps = Math.min(N, 600);
  for (var t = 0; t < reps; t++) {
    var res = MSAAnova.compute(crossed(g, d[0], d[1], d[2], 1, 0.10,
                                       d[3] === 'include' ? 0.12 : 0, 0.25),
                               { interaction: d[3] });
    var m = MSAInterval.forResult(res, { conf: CONF });
    var q = MSAInterval.forResult(res, { conf: CONF, method: 'GPQ' });
    if (!m || !q) continue;
    n++;
    wM.push(m.studyVar.hi - m.studyVar.lo);
    wG.push(q.studyVar.hi - q.studyVar.lo);
    if (m.studyVar.lo <= 0.0001) z++;
    if (m.studyVar.hi >= 99.999) h++;
  }
  console.log([d[0] + 'x' + d[1] + 'x' + d[2] + (d[3] === 'include' ? ' int' : ' sin'),
               mediana(wM).toFixed(1) + ' pp', mediana(wG).toFixed(1) + ' pp',
               fx(z / n, 1), fx(h / n, 1)].join('\t'));
});
