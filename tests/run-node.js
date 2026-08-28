/* Corre las suites de pruebas en Node: node tests/run-node.js */
require('../assets/js/stats.js');
require('../assets/js/anova.js');
require('../assets/js/anova-nested.js');
require('./harness.js');
require('./tests.js');
require('./tests-nested.js');
MSATestKit.report();
