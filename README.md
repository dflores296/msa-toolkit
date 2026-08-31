# MSA Toolkit

Herramientas de análisis de sistemas de medición (MSA) que corren enteramente en
el navegador. Sin backend, sin instalación y sin licencia de software que pagar.
Pensado para reemplazar el libro de Excel con macros que se usaba para los
estudios Gage R&R.

**Métodos disponibles hoy:**

- **Gage R&R por ANOVA cruzado** (*crossed*, dos factores con efectos
  aleatorios): cada operador mide las mismas piezas. Es el mismo método del
  libro original, con el motor de cálculo corregido y validado.
- **Gage R&R por ANOVA anidado** (*nested*), para **pruebas destructivas**:
  medir la pieza la destruye, así que cada operador mide sus propias piezas de
  un lote que se supone homogéneo. El diseño no puede separar la interacción
  operador × pieza —la reproducibilidad sale como efecto de operador— y la
  aplicación lo dice en pantalla en vez de esconderlo. La identidad de una
  pieza es aquí el par **operador + pieza**: numerar 1..n las piezas de cada
  operador es válido, y la «1» de uno y la «1» de otro se analizan como dos
  objetos físicos distintos.
- **Attribute Agreement Analysis** (concordancia por atributos), para inspección
  **pasa / no pasa**: la medición es una categoría, no un número. Aquí no hay
  varianza que descomponer, así que no salen %GRR ni NDC; sale **acuerdo**:
  si cada evaluador se repite a sí mismo, si coinciden entre ellos y —cuando se
  conoce la respuesta correcta— si además aciertan, con kappa, efectividad,
  error de fuga y falsa alarma.

Se cambia de método desde el selector de la barra, y cada uno tiene su dirección
(`#cruzado`, `#anidado`, `#atributos`). **Cambiar de método vacía la captura**,
entre cualesquiera dos: la rejilla se ve igual en los tres, pero el mismo dato en
la misma celda significa otra cosa en cada uno, así que conservarlo daría un
estudio que parece válido y no lo es. Se pregunta antes, y cancelar no toca
nada.

## Cómo se usa

1. **Configuración** — número de operadores, piezas y réplicas, con nombres
   editables.
2. **Captura** — se genera la tabla; escribes las mediciones o pegas un bloque
   copiado de Excel directamente en la primera celda.
3. **Resultados** — tabla ANOVA, componentes de varianza, evaluación del sistema
   de medición y las gráficas (ocho en el cruzado, cinco en el anidado: allí no
   hay gráfica de interacción ni agrupaciones por pieza compartida, porque
   ninguna pieza la miden dos operadores). Los límites de especificación son
   opcionales.

En **atributos** los tres pasos son los mismos, pero la celda es una categoría y
no un número, hay una columna de **estándar** —la clasificación correcta de cada
pieza, opcional— y los resultados son concordancias y kappa en vez de
componentes de varianza. Sin estándar solo se puede saber si los evaluadores
coinciden; pueden estar todos de acuerdo y todos equivocados, y la página lo
dice.

### Discriminación: qué significa un %GRR de 0 %

`Var_GRR = 0` **no** significa «instrumento deficiente», y tampoco «instrumento
perfecto». Nunca se puede observar una repetibilidad menor que el escalón con
que se anotaron las lecturas, así que un cero puede venir de tres sitios
distintos que exigen respuestas opuestas. La aplicación los separa **sin pedir
ningún campo nuevo**, mirando los propios datos:

| Estado | Qué se observó | Qué hace la aplicación |
|---|---|---|
| **Escalón observado adecuado** | El escalón se midió y no rebasa el criterio | Nada. Es el caso de casi todos los estudios y no debe estorbar |
| **Repetibilidad no medible** | Ninguna réplica difirió de otra, pero hay varios valores distintos | Publica el veredicto **sin degradarlo**, marca el NDC como *No evaluable* y avisa de que el 0 % es una **cota**, no un estimado |
| **Posible resolución insuficiente o redondeo** | El escalón se midió y rebasa el criterio | Avisa, con el escalón, los dos porcentajes y **cuál** de los dos criterios se rebasó |
| **No concluyente** | Un solo valor distinto en todo el estudio | Retira el veredicto y lo reporta como estudio no concluyente |

#### Qué es —y qué no es— el valor que se infiere

Es el **escalón observado en los datos**, también llamado *resolución
aparente*. **No es la resolución nominal del instrumento**, y la aplicación no
puede conocerla: los datos solo demuestran con qué finura fueron **anotadas**
las lecturas. Un micrómetro de 0.001 mm cuyas mediciones se exportaron
redondeadas a 0.01 mm produce un escalón observado de 0.01 mm, y eso es un
hecho sobre el archivo, no sobre el equipo. Por eso el aviso dice *«posible
resolución insuficiente **o** redondeo excesivo de los datos»* y pide comprobar
con qué resolución se registró antes de concluir nada del instrumento.

#### Cómo se infiere

Es la **mínima diferencia no nula entre dos lecturas del mismo operador sobre
la misma pieza en réplicas distintas**. Esas dos lecturas comparten todo salvo
el acto de medir, así que lo único que puede separarlas es el sistema de
medición. La mínima diferencia entre mediciones *cualesquiera* no sirve: si
ninguna celda varía, esa diferencia es la que hay entre dos **piezas**. Medido:
en un estudio con micrómetro de 0.001 mm sobre piezas repartidas en 2 mm, la
mínima diferencia global es 0.222 —222 veces el escalón real— y usarla
levantaría una alarma sobre un instrumento excelente. Cuando ninguna celda
varía, el escalón simplemente **no es medible**, y eso es lo que se reporta.

#### Contra qué se compara el 10 %

Contra **los dos denominadores**, cada uno cuando existe:

| Criterio | Cómo se calcula | Cuándo se evalúa |
|---|---|---|
| Variación del estudio | `escalón / (k × σ_total)`, con el multiplicador activo (6 o 5.15) | Siempre que `σ_total > 0` |
| Tolerancia | `escalón / (USL − LSL)`, o el margen unilateral, o la tolerancia directa | Solo si se capturó alguna; si no, no se evalúa |

El estado final es **el peor de los dos**: basta con que **uno** rebase el 10 %
para marcar *posible resolución insuficiente* (un OR, no un AND). Un escalón que
se come el 40 % de la tolerancia es un problema aunque las piezas del estudio
estén muy dispersas y lo disimulen frente a la variación del estudio, y al
revés. El aviso nombra cuál o cuáles se rebasaron, para poder comprobarlo.

`V_grr` y `V_total` son **varianzas** (σ²) —salen de cuadrados medios y de sumas
de componentes—, y se convierten a σ con una raíz antes de compararlas con el
escalón, que está en unidades de medición.

#### Constantes

El **10 %** es el criterio de discriminación de AIAG (`DISCRIMINATION_LIMIT`).
Las otras dos son **protección numérica, no criterios de calidad**, y no salen
de ningún manual: `ZERO_VARIANCE_RATIO` (1e-12) es la fracción de `Var_Total`
por debajo de la cual `Var_GRR` se considera cero —una cancelación de sumas de
cuadrados deja residuos de 1e-30 que son ruido del punto flotante—, y
`EQUALITY_EPS_RATIO` (1e-12) es la tolerancia con que dos lecturas se consideran
iguales, porque `10.3 − 10.2` no da `0.1` exacto.

#### El NDC ya no imprime `inf`

Con `Var_GRR` en cero o en el ruido del punto flotante, `1.41 × σ_pieza / σ_GRR`
no significa nada: antes salía `inf` o un entero de quince cifras, y las dos
cosas se leen como «separa infinitas categorías», que es lo contrario de lo que
pasa. Ahora dice **No evaluable**, y por encima de 100 dice `> 100`, porque AIAG
solo pide 5 y el número exacto sale de dividir entre una varianza prácticamente
nula. Los dos motores usan la misma función (`ndcOf`), para que no acaben
clasificando distinto el mismo equipo.

**La categoría de rechazo se elige, no se adivina.** Con dos categorías y
estándar, hay que decir cuál significa *pieza no conforme*: de esa elección
depende cuál error es una **fuga** (dejar pasar una mala, le llega al cliente,
umbral 2 %) y cuál una **falsa alarma** (rechazar una buena, se queda en la
planta, umbral 5 %). Mientras no se elija, la efectividad y los dos errores no
se calculan y la página dice por qué; el acuerdo y kappa no dependen de esa
elección y se publican igual. Antes se tomaba por defecto la segunda categoría
en orden de aparición, así que los mismos datos capturados en otro orden de
filas intercambiaban los dos errores.

Los datos se pueden exportar e importar como CSV o JSON, y la vista de
resultados está preparada para imprimir a PDF.

## Estado del motor

El motor está validado contra el dataset del apéndice del manual **AIAG MSA
4.ª ed.** (10 piezas × 3 operadores × 3 réplicas), el mismo que Minitab
distribuye como `gageaiag.mtw`:

| Cantidad | MSA Toolkit | Minitab publicado |
|---|---|---|
| SC Parte / Operador / Interacción / Repetibilidad | 88.3619 / 3.1673 / 0.3590 / 2.7589 | idem |
| F interacción, p | 0.434, 0.9741 | 0.434, 0.974 |
| % Contribución Gage R&R | 7.76 % | 7.76 % |
| % Study Variation Gage R&R | 27.86 % | 27.86 % |
| NDC | 4 | 4 |

### Motor anidado

El dataset publicado de referencia para destructivas está pendiente, pero el
motor anidado **no** se valida contra números inventados: se apoya en una
identidad exacta del ANOVA balanceado. Si se toman las mismas mediciones del
apéndice AIAG y se renumeran las piezas 1 a 30 —de modo que ninguna la midan dos
operadores— el layout es un anidado 3 × 10 × 3 y se cumple

```
SC_Operador(anidado)      = SC_Operador(cruzado)        = 3.1673
SC_Pieza(Operador)        = SC_Pieza + SC_Interacción   = 88.3619 + 0.3590
SC_Repetibilidad(anidado) = SC_Repetibilidad(cruzado)   = 2.7589
gl_Pieza(Operador) = o(n−1) = 27 = 9 + 18
```

(el término cruzado se anula porque, para una pieza fija, los residuos de
interacción suman cero sobre los operadores). Las cuatro cantidades de la
derecha son las publicadas por Minitab, así que el anidado queda anclado en los
mismos números. Se suma un caso construido a mano con los tres cuadrados medios
exactos, y pruebas de propiedad. El dataset está en
`datasets/aiag-msa4-anidado.json`.

### Motor de atributos

Falta un dataset de atributos con resultados publicados (el candidato es el
ejemplo del manual AIAG MSA 4.ª ed.), y está anotado como deuda. Mientras tanto
el motor **no** se valida contra números inventados, sino contra tres cosas que
no dependen de conseguir ese archivo:

- **Casos resueltos a mano** —cuatro piezas, dos evaluadores, dos réplicas— con
  la cuenta escrita junto a la prueba.
- **Identidades exactas de kappa**: un caso de Fleiss que da 7/15, y dos de
  Cohen que dan 0.75 y 0.40, con las tablas construidas para que el valor salga
  fracción exacta.
- **Propiedades**: renombrar las categorías no cambia nada, el orden de las
  filas tampoco, el acuerdo perfecto da 100 % y kappa 1, kappa cae a cero cuando
  el acuerdo lo explica el desbalance del lote, y el intervalo de
  Clopper-Pearson se comprueba **contra la propia binomial**, sin tablas de por
  medio.

El ejemplo que carga el botón es un caso **construido a mano** para enseñar a
leer las cifras —cada evaluador falla de una manera distinta a propósito—, no un
dataset de validación, y lo dice al cargarlo.

### Diseño e identidad de la pieza

`assets/js/design.js` decide, **sin DOM**, dos cosas que antes vivían pegadas a
la pantalla: qué identidad tiene una pieza en cada método (en el anidado, el par
`operador|pieza`) y a qué método pertenece un archivo que se importa. Ningún
cambio de método se deduce ya de cómo se llamen las piezas: manda el que el
archivo **declara**, y lo que solo se sospecha se pregunta. `tests/tests-design.js`
cubre los seis escenarios de la auditoría —numeración local y global, cruzado
compartido, importación que conserva el método, reordenar filas y renombrar
piezas— y `tests/prueba-diseno.js` comprueba en un navegador de verdad que la
aplicación cablea ese modelo.

### Orden de carga

`tests/tests-carga.js` fija el contrato de dependencias entre los módulos:
comprueba que los tres cargadores (`index.html`, `tests/index.html` y
`run-node.js`) listen cada módulo **después** de sus dependencias, que cada
módulo declare los globales que nombra, y —lo que le da valor— que cargar en el
orden correcto funcione **y que cargar en el orden equivocado falle**. Existe
porque `anova-nested.js` dereferencia `MSADesign` al evaluarse: es una
precondición real, y se prueba en vez de disimularse con una degradación
silenciosa.

167 pruebas de regresión entre los cuatro modelos puros —todas sobre el cálculo:
corren en Node, sin navegador, y no tocan la pantalla. Para correrlas:

```bash
node tests/run-node.js      # en terminal
```

o abre `tests/index.html` en el navegador, que además muestra lado a lado los
resultados del motor corregido y los del motor VBA original.

### Que un método no mueva al otro

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
[`docs/plan-siguientes-metodos.md`](docs/plan-siguientes-metodos.md).

Las tres herramientas de navegador (`regresion-visual.js`, `prueba-impresion.js`
y `prueba-diseno.js`) **no corren en CI**: necesitan Playwright, que no es
dependencia del proyecto. CI corre `node tests/run-node.js`.

## Auditoría

[`docs/auditoria-2026-08-31.md`](docs/auditoria-2026-08-31.md) — auditoría
crítica de los tres motores bajo el supuesto de que la aplicación aprueba o
rechaza sistemas de medición en planta. Lleva el estado de cada hallazgo, lo
corregido con su commit y lo pendiente con su razonamiento, para poder retomarla
desde otra sesión.

## Qué se corrigió respecto del Excel

El libro [`docs/Gage R&R Study.xlsm`](docs/Gage%20R&R%20Study.xlsm) tenía **12 defectos** en el motor de cálculo. Los
cuatro más graves:

1. `SS_Parte` y `SS_Operador` no incluían el factor de réplicas, así que la
   tabla ANOVA estaba mal y la descomposición no cerraba.
2. Los componentes de varianza usaban divisores incorrectos (`/o` en vez de
   `/(o·r)`).
3. La varianza de interacción no se dividía entre `r`, sobreestimándola `r`
   veces. En simulaciones esto llega a **cambiar el veredicto AIAG**, marcando
   como inaceptable un sistema que en realidad es marginal.
4. No había prueba F ni agrupamiento del término de interacción, así que el
   modelo nunca coincidía con el de Minitab.

El análisis completo, con la evidencia numérica de cada uno, está en
**[`docs/auditoria-motor-excel.md`](docs/auditoria-motor-excel.md)**.

## Estructura

```
index.html               aplicación (una sola página)
assets/js/stats.js       distribución F (beta incompleta)
assets/js/anova.js       motor de cálculo — puro, sin DOM, reutilizable
assets/js/anova-nested.js motor anidado (pruebas destructivas)
assets/js/attribute.js   motor de concordancia por atributos
assets/js/design.js      identidad de la pieza y enrutado de método — sin DOM
assets/js/report.js      encabezado del reporte impreso — sin DOM
                         (design.js va ANTES que anova-nested.js: lo usa al cargar)
assets/js/charts.js      las ocho gráficas (Chart.js)
assets/js/app.js         interfaz y flujo
tests/                   suite de regresión + reimplementación del VBA original
datasets/                casos de validación con resultados publicados
docs/                    auditoría, estándar de diseño y plan de trabajo
```

`assets/js/anova.js` no depende del DOM ni de ninguna librería: se puede
importar desde Node o desde otra herramienta tal cual.

El diseño de la interfaz —layout, gráficas, redacción de mensajes, tooltips,
validación, reporte impreso— está fijado en
**[`docs/estandar-de-diseno.md`](docs/estandar-de-diseno.md)**. Cada método que
se agregue debe cumplirlo, o cambiarlo primero.

## Publicar en GitHub Pages

El sitio es 100 % estático, sin paso de compilación:

1. En GitHub: **Settings → Pages → Source: Deploy from a branch**, rama `main`,
   carpeta `/ (root)`.
2. Queda publicado en `https://dflores296.github.io/msa-toolkit/`, y las pruebas
   de validación en `https://dflores296.github.io/msa-toolkit/tests/`.

El archivo `.nojekyll` desactiva el procesamiento con Jekyll: el sitio se sirve
tal cual, sin sorpresas con rutas ni carpetas.

### Al cambiar CSS o JavaScript, sube la version

Los enlaces a los assets llevan un sufijo `?v=AAAAMMDDx`:

```html
<link rel="stylesheet" href="assets/css/style.css?v=20260830b">
```

GitHub Pages sirve el CSS y el JS con caché, así que sin ese sufijo un
navegador que ya visitó el sitio sigue usando los archivos viejos aunque el
despliegue haya sido correcto: la página se ve igual y parece que no se
publicó nada. Cambia el valor en `index.html` y en `tests/index.html` (mismo
valor en los dos) cada vez que toques un archivo de `assets/` o de `tests/`.

También funciona sin servidor: basta abrir `index.html` con doble clic, porque
Chart.js va servido desde el propio repositorio y no hay dependencias externas.

## Hoja de ruta

**El alcance planeado está cubierto.** Los tres métodos que se usan en planta
—mediciones normales, pruebas destructivas e inspección por atributos— están
hechos, cada uno con su suite de regresión.

Lo que se evaluó y se decidió **no** hacer, con su razón, está en
**[`docs/plan-siguientes-metodos.md`](docs/plan-siguientes-metodos.md)**:
Promedio y Rango (X̄ & R), Estudio Tipo 1 (Cg / Cgk), linealidad y sesgo,
estabilidad, Kendall para categorías ordenadas, e intervalos de confianza para
el %GRR. Ninguno está descartado para siempre; simplemente piden instrumentación
o patrones que rara vez están disponibles en línea, y con los tres hechos se
cubren los casos reales.

## Licencia

**Código visible, no código abierto.** Copyright (c) 2026 dflores296, todos los
derechos reservados. El repositorio es público para poder consultarlo y para
alojar el sitio en GitHub Pages, pero **no** se concede licencia de uso, copia,
modificación ni redistribución. Ver [LICENSE](LICENSE).

Chart.js (`assets/vendor/`) mantiene su licencia MIT propia.

## Marcas

Minitab es marca registrada de Minitab, LLC. AIAG es marca registrada de
Automotive Industry Action Group. Este proyecto no está afiliado ni avalado por
ellos. Se les menciona únicamente como referencia técnica: para citar la
convención de cálculo que sigue cada quien y para documentar contra qué valores
publicados se validó el motor.
