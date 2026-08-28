/* ============================================================================
 * harness.js - Arnes minimo de pruebas, compartido por todas las suites.
 *
 * Estaba dentro de tests.js cuando solo existia el motor cruzado. Con el
 * anidado hay dos suites que reportan juntas, asi que el arnes vive aparte y
 * el reporte lo dispara quien carga las suites (run-node.js o tests/index.html)
 * cuando ya estan todas.
 * ==========================================================================*/
(function (global) {
  'use strict';

  var results = [];

  function test(name, fn) {
    try { fn(); results.push({ name: name, ok: true }); }
    catch (e) { results.push({ name: name, ok: false, message: e.message }); }
  }

  function near(actual, expected, tol, what) {
    if (!isFinite(actual)) throw new Error((what || '') + ': valor no finito (' + actual + ')');
    if (Math.abs(actual - expected) > tol) {
      throw new Error((what || 'valor') + ': se esperaba ' + expected + ' +/- ' + tol + ', se obtuvo ' + actual);
    }
  }

  function assert(cond, msg) { if (!cond) throw new Error(msg || 'assert fallo'); }

  /** Cierra la corrida: publica MSATests y, en Node, imprime y fija la salida. */
  function report() {
    var passed = results.filter(function (r) { return r.ok; }).length;
    global.MSATests = {
      results: results,
      passed: passed,
      failed: results.length - passed,
      total: results.length,
      aiagRows: global.AIAG_ROWS,
      aiagNestedRows: global.AIAG_NESTED_ROWS
    };
    if (typeof window === 'undefined' && typeof process !== 'undefined') {
      results.forEach(function (r) {
        console.log((r.ok ? '  ok   ' : '  FALLO') + '  ' + r.name + (r.ok ? '' : '\n         ' + r.message));
      });
      console.log('\n' + passed + '/' + results.length + ' pruebas pasaron.');
      process.exitCode = passed === results.length ? 0 : 1;
    }
    return global.MSATests;
  }

  global.MSATestKit = { test: test, near: near, assert: assert, results: results, report: report };
})(typeof window !== 'undefined' ? window : globalThis);
