/* Corre las suites de pruebas en Node: node tests/run-node.js */
require('../assets/js/stats.js');
require('../assets/js/anova.js');
require('../assets/js/anova-nested.js');
require('../assets/js/attribute.js');
require('./harness.js');
require('./tests.js');
require('./tests-nested.js');
require('./tests-attribute.js');
MSATestKit.report();
