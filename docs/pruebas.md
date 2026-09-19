# Las pruebas

Qué cubre cada suite, qué **no** cubre, y qué hace falta para correrla.

## La suite de motor

<!-- CIFRAS:INICIO pruebas -->
<!-- Generado por tools/build-cifras.js desde datasets/ y tests/.
     No editar a mano: se regenera, y el CI lo verifica con --check. -->

230 pruebas de regresión entre los modelos puros —todas sobre el cálculo:
corren en Node, sin navegador, y no tocan la pantalla.

`tests/index.html` corre 204 de ellas: no carga `tests-interval.js` ni `tests-carga.js`.
<!-- CIFRAS:FIN pruebas -->

Para correrlas:

```bash
node tests/run-node.js      # en terminal
```

o abre `tests/index.html` en el navegador, que muestra el detalle de cada
prueba.

Es lo único que corre en integración continua (`.github/workflows/ci.yml`).

## Orden de carga

`tests/tests-carga.js` fija el contrato de dependencias entre los módulos:
comprueba que los tres cargadores (`index.html`, `tests/index.html` y
`run-node.js`) listen cada módulo **después** de sus dependencias, que cada
módulo declare los globales que nombra, y —lo que le da valor— que cargar en el
orden correcto funcione **y que cargar en el orden equivocado falle**. Existe
porque `anova-nested.js` dereferencia `MSADesign` al evaluarse: es una
precondición real, y se prueba en vez de disimularse con una degradación
silenciosa.

## Que un método no mueva al otro

Los dos métodos comparten la misma pantalla, y eso una suite de motor no lo ve:
el cálculo puede seguir dando los mismos números mientras la pantalla los
muestra mal, se come una gráfica o rompe el reporte. Para eso está
`tests/regresion-visual.js`, que corre el mismo estudio en dos versiones del
repo y compara todo lo que la página publica —veredictos, tablas, notas, CSV,
cada gráfica y el reporte impreso, pixel a pixel:

```bash
node tests/regresion-visual.js HEAD~1            # cruzado contra el commit anterior
node tests/regresion-visual.js main anidado      # anidado contra main
```

Necesita Playwright y Chromium, que **no** son dependencias del proyecto: es
una herramienta de escritorio aparte (`npm i playwright && npx playwright
install chromium`). La aplicación y `tests/run-node.js` siguen corriendo sin
instalar nada.

**Reporte impreso.** `node tests/tests-report.js` corre dentro de la suite y
prueba el modelo puro del encabezado (`assets/js/report.js`) contra los tres
resultados reales. Además, `node tests/prueba-impresion.js` recorre el camino
completo de impresión en un navegador de verdad —botón *Imprimir / PDF* y
`Ctrl+P`, en los tres métodos— y comprueba que el encabezado no trae campos de
otro método ni `undefined`/`null`/`NaN`, que no se cuelan los paneles del método
ajeno, que la interfaz se restaura **aunque la preparación falle**, y que
imprimir no altera los cálculos ni el estado capturado. Necesita Playwright,
que **no es dependencia del proyecto**, igual que `regresion-visual.js`.

El recorrido de impresión cubre además los casos **sin haber calculado** en los
tres métodos, importar-calcular-imprimir en atributos, y la categoría de rechazo
pendiente: ahí no hay resultado del que deducir la familia del estudio, y era
donde un estudio de atributos se imprimía con el encabezado de variables (F-03.1).

**Frescura del resultado.** `node tests/prueba-frescura.js` comprueba que un
resultado deje de publicarse en cuanto cambian los datos de los que salió:
banner, panel atenuado, *Imprimir / PDF* bloqueado, y —lo que un bloqueo de
botón no cubre— que Ctrl+P tampoco imprima el resultado viejo (F-05).

**Diseño y enrutado.** `node tests/prueba-diseno.js` hace lo mismo con el camino
de F-02: captura manual con las piezas numeradas 1..n en cada operador, importar
ese estudio en CSV (que no declara método) y en JSON (que sí lo declara),
reordenar las filas del archivo, y las reglas de nombres repetidos en los dos
métodos. Es el trozo que solo existe en la pantalla: un `route()` impecable no
sirve de nada si `app.js` no lo llama.

**Lo que esto todavía no cubre.** `regresion-visual.js` compara *dos revisiones
del repo*, así que sirve para no mover lo que ya estaba bien, no para encontrar
lo que nunca estuvo bien: un defecto presente en las dos coincide y pasa por
bueno. Su recorrido carga además el dataset de ejemplo, cuyos nombres de pieza
son los que el programa pone solo — y F-02 fue exactamente un fallo que solo
aparecía con nombres escritos por el usuario, por eso `prueba-diseno.js` los
escribe a mano. Sigue habiendo mucha pantalla sin cubrir: fuera del camino de
impresión y del de diseño, un cambio en `assets/js/app.js` puede dejar la suite
de motor entera en verde y romper lo que se ve, y eso se comprueba a mano en el
navegador. Está anotado como deuda en
[`plan-siguientes-metodos.md`](plan-siguientes-metodos.md).

Las tres herramientas de navegador (`regresion-visual.js`, `prueba-impresion.js`
y `prueba-diseno.js`) **no corren en CI**: necesitan Playwright, que no es
dependencia del proyecto. CI corre `node tests/run-node.js`.
