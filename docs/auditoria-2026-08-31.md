# Auditoría MSA Toolkit — 31 de agosto de 2026

Auditoría crítica de los tres motores MSA bajo el supuesto de que la aplicación
**aprueba o rechaza sistemas de medición en una planta industrial**.

Base auditada: commit `52b6b1e` (`main` = `develop`).
Cada hallazgo marcado como confirmado fue **reproducido ejecutando los motores**,
no inferido de la lectura del código.

Este documento existe para poder **retomar el trabajo desde otra sesión o
cuenta**: lleva el estado de cada hallazgo, lo que ya se corrigió y con qué
commit, y lo que queda pendiente con su razonamiento.

---

## Estado actual

| Hallazgo | Prioridad | Estado | Commit |
|---|---|---|---|
| F-04 · Categoría de rechazo por orden de aparición | P0 | **Cerrado** | `04dc8d5` |
| F-01 · `Var_GRR = 0` tratado como veredicto | P1 (era P0) | **Cerrado** | `3beef45`, `1fc0a3b` |
| F-03 · El reporte de atributos lanza TypeError | P0 | **Cerrado** | `b1dffdf` |
| F-03.1 · Impresión sin cálculo usa el encabezado de variables | P1 | **Cerrado** | este commit |
| F-02 · Anidado ruteado a cruzado | P0 | **Cerrado** | este commit |
| F-05 · Reporte con datos nuevos y tablas viejas | P1 | **Cerrado** | este commit |
| F-06 · Atributos 0/1 → ANOVA de variables | P1 | **Cerrado** | este commit |
| F-07 · %GRR sin intervalo de confianza | P1 | **Cerrado** | este commit |
| F-14 · Inyección de fórmulas en el CSV exportado | P1 | Pendiente | — |
| F-15 · «Validado contra AIAG» afirmado para los tres métodos | P1 | Pendiente | — |
| F-08 · `__proto__` como nombre → NaN silencioso | P2 | Pendiente | — |
| F-16 · Sin Content-Security-Policy | P2 | Pendiente | — |
| F-10 · Alfa fuera de catálogo al importar → α = 0 | P2 | Pendiente | — |
| F-11 · Tarjeta y barra se contradicen en %GRR = 10.00 | P2 | Pendiente | — |
| F-17 · Impresión incluía paneles del otro método | P2 | **Cerrado** | este commit |
| F-09 · `fSurvival(NaN)` devuelve 0 | P2 | Pendiente | — |
| F-18 · Tooltips en `title=""`, ARIA de pestañas incompleto | P2 | Pendiente | — |
| F-19 · Chart.js 4.4.1 sin lockfile, SRI ni revisión en CI | P2 | Pendiente | — |
| F-13 · Filas duplicadas al importar se sobrescriben | P3 | Pendiente | — |
| F-12 · Categoría llamada «otro» pierde su kappa | P3 | Pendiente | — |
| F-20 · Duplicación cruzado/anidado; `app.js` monolítico | P3 | Parcial | `1fc0a3b` |
| F-21 · Sin persistencia de la captura | P3 | Pendiente | — |
| F-22 · Cadenas desactualizadas (`<title>`, badge, meta) | P3 | Pendiente | — |
| F-23 · `num(v, sig)` mal nombrado; escalas inconsistentes | P3 | Pendiente | — |
| F-24 · Semáforo solo por color | P3 | Pendiente | — |
| F-25 · `betaInv` 200 iteraciones; `getComputedStyle` en bucle | P3 | Pendiente | — |
| F-26 · Ninguna suite tocaba el DOM | P3 | Parcial | `b1dffdf`, `ad6cfce` |
| F-27 · `design.js` es precondición de carga, no dependencia blanda | P2 | Anotado | — |

---

## Lo que está bien, y es la parte difícil

El **motor cruzado reproduce a Minitab dígito a dígito** sobre el dataset del
apéndice AIAG MSA 4.ª ed. (`gageaiag.mtw`):

| Cantidad | MSA Toolkit | Minitab publicado |
|---|---|---|
| % Contribución Total Gage R&R | 7.76 | 7.76 |
| % Study Variation Total Gage R&R | 27.86 | 27.86 |
| NDC | 4 | 4 |
| F interacción · p | 0.4337 · 0.9741 | 0.434 · 0.974 |

El **anidado** deriva sus componentes de los cuadrados medios esperados
correctos (`σ²_rep = CM_rep`, `σ²_pieza = (CM_pieza(op) − CM_rep)/r`,
`σ²_op = (CM_op − CM_pieza(op))/(n·r)`) y prueba cada efecto contra el estrato
que lo contiene. En **atributos**, Fleiss y Cohen usan las fórmulas canónicas,
con el error estándar bajo `H₀` correcto en ambos, y Clopper–Pearson por
inversión de la beta. **La aritmética no es el problema.**

---

## Hallazgos cerrados

### F-04 — La categoría de rechazo salía del orden de las filas · `04dc8d5`

Sin `rejectCategory` explícita, el motor tomaba `cats[1]`: la **segunda
categoría en orden de aparición en los datos**. Los mismos datos, reordenados,
intercambiaban el error de fuga con la falsa alarma.

```
Caso: 3 piezas conformes, 1 no conforme. Ana comete 1 falsa alarma, 0 fugas.
  primera fila "Pasa"     -> reject = "No pasa"  FUGA 0 %    FALSA ALARMA 33.3 %
  mismos datos, otro orden -> reject = "Pasa"     FUGA 33.3 % FALSA ALARMA 0 %
```

Los umbrales AIAG son distintos a propósito (2 % y 5 %) porque una fuga llega
al cliente y una falsa alarma se queda en la planta. **Corregido:** sin elección
explícita y válida no se publican efectividad, fuga ni falsa alarma; el
desplegable abre vacío; las tarjetas de veredicto llevan la categoría en el
título. La prueba de invariancia de orden que existía enmascaraba el bug porque
siempre pasaba `categories` explícitas.

### F-01 — `Var_GRR = 0` no es un veredicto · `3beef45`, `1fc0a3b`

**Enunciado original corregido:** afirmé que `Var_GRR = 0` implica falta de
discriminación. **No la implica.** Un micrómetro excelente lo produce
legítimamente:

```
A. LEGITIMO  micrometro 0.001 mm, error real 0.00002, piezas en 2 mm
   V_grr = 2.1e-30   30/30 celdas sin variacion
   %SV = 0.00 % "Aceptable"   %GRR real = 0.006 %   <- el veredicto es correcto
   NDC = 654170470307296  <- 15 digitos en la tarjeta

C. PATOLOGICO  las 90 lecturas identicas
   %SV = 0.00 % "Aceptable"   NDC = null -> la tarjeta decia "inf"   avisos = 0
```

El defecto real es más estrecho: un **no-estimado presentado con la cara de un
estimado**, más el NDC roto en las dos direcciones. Bajado de P0 a P1.

**Cuatro estados, inferidos sin pedir ningún campo nuevo:**

| Estado | Evidencia | NDC | Veredicto | Aviso |
|---|---|---|---|---|
| Escalón observado adecuado | escalón medido, ≤ 10 % | número | intacto | ninguno |
| Repetibilidad no medible | ninguna réplica difirió | `No evaluable` | **intacto** | «el 0 % es una cota» |
| Posible resolución insuficiente o redondeo | escalón > 10 % | número | intacto | con las cifras |
| No concluyente | 1 valor distinto | `No evaluable` | **retirado** | mensaje explícito |

**Cómo se infiere el escalón** — y por qué el alcance importa: es la mínima
diferencia no nula entre **réplicas distintas del mismo operador sobre la misma
pieza**. La mínima diferencia entre mediciones *cualesquiera* sobreestima 222×
en el caso del micrómetro (ahí ninguna celda varía, así que esa diferencia es
entre *piezas*) y levantaría una alarma sobre un instrumento excelente.

**El escalón NO es la resolución nominal del instrumento.** Los datos solo
demuestran con qué finura fueron *anotadas* las lecturas. Un micrómetro de
0.0001 mm exportado redondeado a 0.01 mm produce datos idénticos a los de un
equipo grueso. Por eso el aviso dice «posible resolución insuficiente **o**
redondeo excesivo de los datos» y pide comprobar antes de concluir del equipo.

**El 10 % se evalúa contra los dos denominadores**, cada uno cuando existe:
`escalón / (k·σ_total)` siempre que `σ_total > 0`, y `escalón / tolerancia` solo
si se capturó alguna. El estado final es **el peor de los dos** (un OR): basta
con que uno se rebase. `V_grr` y `V_total` son **varianzas** (σ²), y se
convierten a σ con una raíz antes de compararlas con el escalón.

`DISCRIMINATION_LIMIT` (0.10) es el criterio AIAG. `ZERO_VARIANCE_RATIO` y
`EQUALITY_EPS_RATIO` (1e-12) son **protección numérica, no criterios de
calidad**.

### F-02 — El anidado se ruteaba a cruzado · este commit

**Causa raíz:** la identidad de una pieza se leía como un **nombre global**, y
en el anidado no lo es. La convención natural de una destructiva —numerar 1..n
las piezas de cada operador— produce nombres que coinciden entre operadores sin
que las piezas tengan nada que ver. De ahí salían tres fallos encadenados, y
los tres se reprodujeron ejecutando el código antes de tocarlo:

```
partsByOp = [["1".."5"], ["1".."5"], ["1".."5"]]

1. detectDesign(partsByOp)      -> "cruzado"   (app.js)
   y la app cambiaba sola de metodo, avisando "todos los operadores midieron
   las mismas piezas", que es falso.
2. MSANested.validate(rows)     -> ok: false
   "...5 pieza(s) aparecen bajo varios... usa el metodo Cruzado."
   El validador empujaba al metodo que asume lo contrario de lo que ocurrio.
3. MSAAnova.compute(rows)       -> acepta la matriz (esta balanceada) y publica
   un ANOVA con termino Operador x Parte, que fisicamente no existe.
```

**La regla:** en el anidado la identidad estadística de una pieza es el **par
(operador, pieza)** — `Ana|1` y `Beto|1` son dos objetos distintos. El
identificador local se conserva intacto para tablas, gráficas, exportaciones y
reportes; solo la identidad interna se califica.

**Y la regla de enrutado:** un nombre repetido no es evidencia de nada. Ningún
cambio de método se deduce ya de los nombres: manda el que el archivo
**declara** (`method`, o su `format`), y lo que solo se sospecha se pregunta.
Estando en anidado, ninguna coincidencia de nombres saca del anidado.

**Corregido con un cambio estructural, no un `if`,** igual que F-03: la decisión
se extrae a `assets/js/design.js`, un modelo **puro y sin DOM**. Mientras vivió
dentro de `app.js`, la única manera de ver el fallo era abrir el navegador e
importar un archivo.

En vez del error que empujaba al método equivocado, se emiten dos avisos que
son lo único que los datos sostienen:

> En el método anidado, las piezas con el mismo identificador bajo operadores
> diferentes se consideran objetos físicos distintos.
>
> Si los operadores midieron realmente las mismas piezas físicas, utiliza el
> método cruzado.

**Compatibilidad:** los estudios anidados existentes no se mueven. Con
identificadores únicos globales —lo que la app propone por omisión, 1..30— la
validación pasa exactamente igual, sin avisos nuevos, y
`tests/regresion-visual.js HEAD anidado` no encuentra ninguna diferencia:
veredictos, tablas, notas, CSV, las cinco gráficas y el reporte impreso son
idénticos. Lo que antes era un error ahora es un caso válido; nada que antes
funcionara dejó de funcionar.

### F-07 — Un punto sin intervalo decidía la aceptación · este commit

**Reproducido** con el motor en vivo, y confirma el hallazgo:

```
12 estudios 10x3x3 del MISMO sistema (sigma_ms/sigma_pieza = 0.30)
  %GRR: 38.8 21.4 21.7 40.7 31.4 36.0 30.3 44.8 23.5 20.4 25.6 29.9
  rango 20.4 a 44.8   -> el mismo gage a los dos lados del 30 %
300 estudios 3x5x2 de un sistema BUENO: 24/300 "Inaceptable" -> 8 % de rechazos falsos
```

**Método: GPQ**, el que usa Minitab. En un modelo balanceado cada cuadrado
medio cumple `MS·df/σ² ~ χ²_df`, así que `MS·df/W` con `W ~ χ²_df` simulada es
una cantidad pivotal generalizada. Se simulan juegos de MS, se recalculan los
componentes **con las mismas fórmulas del motor** —truncado de negativos
incluido— y se toman percentiles. Se prefirió a MLS porque %Study Variation,
%Contribución y %Tolerance salen del mismo juego, y el truncado queda *dentro*
del pivote en vez de ignorarse.

**Validación: cobertura, no una tabla copiada.** No hay valores publicados a
mano para estos intervalos, así que no se inventa una referencia: se simulan
estudios de sistemas con %GRR verdadero conocido y se cuenta cuántas veces el
intervalo lo contiene. Medido contra un nominal de 90 %:

| Caso | Cobertura | Ancho medio |
|---|---|---|
| cruzado 10×3×3, marginal | 96.0 % (al 95 % nominal) | 40.1 pp |
| cruzado 10×3×3, bueno | 95.8 % (al 95 %) | 26.4 pp |
| cruzado 5×3×2 | 96.0 % (al 95 %) | 38.1 pp |
| anidado 10×3×3 | 93.0 % (al 95 %) | 61.6 pp |

Una cobertura sobre cientos de estudios no se acierta por casualidad; un número
suelto, sí.

**Confianza por omisión: 90 %**, el valor de Minitab para Gage R&R. Medido, no
elegido por gusto: sobre un gage excelente (%GRR real 5.4 %) un 10×3×3 concluye
el **18 %** de las veces al 95 % y el **44 %** al 90 %. Un veredicto que casi
nunca se emite no ayuda a nadie.

**El veredicto sale del intervalo**, y solo concluye si el intervalo entero cae
en una banda. El punto **no desaparece**: sigue en la tarjeta como estimación
—es lo que imprime Minitab y contra lo que se compara la convención AIAG—, con
su etiqueta AIAG debajo. Lo que cambia es que deja de dictaminar.

**El resultado incomoda, y es correcto.** Sobre el propio dataset AIAG:

```
%StudyVar 27.86 %   IC 90 % [16.95, 69.18]   -> No concluyente: cruza el 30 %
```

No es un defecto del intervalo. Con 3 operadores la reproducibilidad tiene
**2 grados de libertad**, y en el pivote `MS_op` se puede inflar hasta 40×. Un
estudio 10×3×3 no alcanza a clasificar un gage cuyo %GRR real ronda el umbral;
eso ya era verdad antes, solo que no se veía.

**El piso de 60 mediciones se implementó, y no es redundante.** Se midió: solo
con el intervalo, un 5×3×2 sigue concluyendo el 24–51 % de las veces. El piso
cubre una incertidumbre que el intervalo **no mide** —que 5 piezas cubran el
rango del proceso— y bloquea el **veredicto**, nunca el cálculo.

**Efecto medido sobre el caso de la auditoría** (300 estudios 3×5×2 de un
sistema bueno): rechazos falsos **7.3 % → 0.3 %**.

**Ningún motor se tocó.** `interval.js` lee la tabla ANOVA del propio
resultado. La regresión visual lo confirma: `panelComponentes`, `panelAnova`,
`csv` y el anexo salen idénticos; cambian solo las tarjetas, los avisos y el
encabezado impreso, que es donde entra el intervalo.

### F-06 — Un pasa/no pasa codificado 0/1 se analizaba como variables · este commit

**Reproducido** importando un archivo `1/0` estando en **atributos**:

```
metodo activo era "atributos"; tras importar 0/1 -> cruzado
aviso: "El archivo trae mediciones numericas, asi que se salio del metodo de atributos."
%GRR sobre una variable binaria: 99.54 %   con veredicto "Inaceptable"
```

**Causa raíz.** `looksCategorical` declara categórico un archivo solo si más
del 80 % de los valores no son numéricos. Codificar pasa/no pasa como `1/0` o
`1/2` —práctica corriente en registros de inspección— da **0 % de texto**.

**Lo que se mira, y por qué solo eso:** pocos valores distintos (≤ 3) y todos
enteros. Es el patrón que ninguna medición continua produce —un micrómetro no
devuelve exactamente dos valores en 90 lecturas— y que toda escala ordinal
corta produce siempre. No se busca «0 y 1» en concreto, porque `1/2`, `1/3` y
`-1/1` son igual de comunes.

**Y no decide.** Dos niveles también salen de un calibre de aguja o de un
estudio real cuyas piezas resultaron casi idénticas; los datos no distinguen
los casos. Se aplica la misma regla de F-02: **un cambio de método que altera
el modelo estadístico nunca es silencioso.**

| Método activo | Antes | Ahora |
|---|---|---|
| atributos | se iba a cruzado | **se queda**, y dice por qué |
| cruzado / anidado | analizaba en silencio | **pregunta**, con las cifras del archivo delante |
| el archivo declara método | — | manda el archivo, sin preguntar |

Cancelar es una respuesta, no un silencio: queda escrito con qué supuesto se
sigue y qué pasa si es el equivocado.

**Cubre también la captura manual.** Escribir 0/1 en la rejilla no pasa por la
importación, y el ANOVA de una variable binaria es igual de vacío: al calcular,
el aviso aparece junto al resultado. Los motores no se tocaron; la detección
vive en `design.js`, que es puro.

**Pruebas.** Seis en Node (`tests-design.js`) más 13 comprobaciones de
navegador en `prueba-diseno.js`. La de navegador usa el caso **peligroso**, no
el llamativo: tres evaluadores que casi siempre coinciden dan un %GRR bajo y un
veredicto «Aceptable» sobre datos donde la varianza no mide nada.

### F-05 — El reporte podía mezclar resultados viejos con mediciones nuevas · este commit

**Reproducido antes de tocar nada**, con el ejemplo AIAG en cruzado:

```
calcular            -> %SV publicado 27.86 %, primera celda 0.29
poner 99 en la celda:
  %SV en pantalla   27.86 %   <- no cambio, y nada dice que caduco
  panel visible     si
  Imprimir          habilitado
  rotulo            "actualizado al escribir"
imprimir:
  encabezado %SV    27.86 %   <- del resultado VIEJO
  el anexo trae 99  si        <- del DOM ACTUAL
  y afirma "Los calculos de este reporte salen exactamente de estos datos"
```

**Causa raíz.** `validateLive()` solo movía el contador y el botón. Los campos
de opciones (alfa, LSL/USL, multiplicador…) sí recalculan al cambiar; las
celdas de medición no, y nada marcaba la diferencia.

**Corregido con una huella, no con un `if` por campo.** `state.stamp` guarda,
al calcular, la firma de **todo** lo que entró en el resultado: celdas,
estándar, método y campos de opciones. `resultIsStale()` la compara con la
pantalla. Así no hay una tercera cosa que se olvide mañana, y **deshacer** una
edición quita la caducidad: se compara contenido, no «hubo un evento de
teclado».

Cuando caduca: banner con su botón de **Recalcular** dentro, panel **atenuado**
—no escondido: ocultar unos números que alguien acaba de mirar confunde más—,
rótulo cambiado, e **Imprimir / PDF bloqueado**.

**Ctrl+P no pasa por el botón**, así que la regla vive también en el modelo:
con `ctx.stale`, `report.js` trata el resultado como inexistente —ninguna cifra
vieja llega al papel— y lo declara. El anexo cambia su frase por la contraria,
en el mismo sitio donde el lector la buscaría.

**El rótulo** «actualizado al escribir» pasa a «se recalcula al pulsar
Calcular»: prometía algo que la aplicación no hacía.

**Pruebas.** Tres en Node sobre el modelo puro y `tests/prueba-frescura.js`
(35 comprobaciones en navegador): el escenario completo, Ctrl+P, deshacer,
recalcular, que los campos de opciones **no** dejen el panel caduco porque esos
sí recalculan solos, y los tres métodos.

### F-03.1 — La impresión sin cálculo usaba el encabezado de variables · `4690438`

**Encontrado revalidando F-03 sobre `develop` después de F-02**, no reportado en
la auditoría original. **No es regresión de F-02:** el mismo recorrido da un
encabezado carácter por carácter idéntico en `b1dffdf` (F-03 recién cerrada) y
en `ad6cfce`. Es una brecha que la corrección de F-03 dejó abierta.

**Causa raíz.** F-03 se cerró deduciendo el método de `result.model`, y solo de
ahí. La página se puede imprimir **sin haber calculado**, y entonces
`result === null`: no hay `model` del que deducir nada, así que un estudio de
atributos caía en la rama de variables.

```
#atributos, importar el dataset, imprimir SIN calcular:

  Attribute Agreement Analysis · MSA Toolkit      <- el subtitulo si acierta
  Estudio        3 operadores x 30 piezas x 3 replicas = 270 mediciones
  Especificacion Sin especificacion
  Multiplicador  6 sigma
  Modelo         Sin calcular
```

«operadores», «mediciones», `Especificacion` y `Multiplicador` en un estudio de
concordancia: la **regla 1** que el propio `report.js` dice hacer cumplir, rota
en el único caso que esa regla no miraba. En cruzado habría salido además
`Alfa`.

**Corregido** con una prioridad explícita en `studyKind(result, ctx)`, porque
`result.model` y `ctx.method` son dos fuentes de la misma verdad y lo que
faltaba era decir cuál manda cuando solo existe una:

| | Fuente | Encabezado |
|---|---|---|
| a) | hay `result` | manda `result.model` — aunque `ctx.method` diga otra cosa |
| b) | no hay `result` | manda `ctx.method`, el método activo en pantalla |
| c) | ninguno de los dos | **neutral**: fecha, `3 x 10 x 3 = 90 celdas`, `Sin calcular` |

Atributos sin calcular imprime ahora **evaluadores × piezas × réplicas =
clasificaciones**, el método, la categoría de rechazo (o `No seleccionada`) y
`Estado: Sin calcular`. Y **no** imprime especificación, multiplicador, alfa,
modelo, NDC, %Study Variation, ni kappa, efectividad, fuga o falsa alarma: esas
cuatro existen en el método, pero todavía no se han calculado, y ponerlas en
blanco sería decir que fallaron.

**Pruebas.** Seis en Node sobre el modelo puro (`tests/tests-report.js`,
incluida la contradicción a) contra b)) y seis recorridos nuevos en
`tests/prueba-impresion.js` (39 → 75 comprobaciones): los tres métodos sin
calcular, importar-calcular-imprimir en atributos, categoría de rechazo
pendiente y luego elegida, y la restauración de la interfaz en todos ellos.
Verificado que tienen dientes: reinyectando el comportamiento viejo caen 3
pruebas de Node y 6 comprobaciones del navegador.

### F-03 y F-17 — El reporte impreso · `b1dffdf`

`buildPrintHeader` daba por hecha la forma de respuesta de los métodos de
variables: `r.metrics.pctStudyVar.toFixed(2)` sobre un resultado de atributos
lanzaba `TypeError`, `preparePrint()` abortaba entera y **el tercer método no
podía entregar su documento**. Además `printRestore` nunca se asignaba, así que
la pantalla se quedaba rota tras imprimir.

**Corregido con un cambio estructural, no un `if`:** el encabezado se extrae a
`assets/js/report.js`, un modelo **puro y sin DOM** que decide qué filas van en
cada método y se prueba en Node contra los tres resultados reales. Mientras esa
decisión vivió pegada al DOM, la única forma de descubrir que estaba rota era
abrir el navegador e imprimir.

Además: `preparePrint()` registra el restaurador **antes** de tocar la pantalla
y envuelve la preparación en `try/catch`; y la regla de impresión
`.tab-panel[hidden]{display:block!important}` se acota por método (antes
revelaba también los paneles del método ajeno, que salían como páginas en
blanco con su título).

---

## Pendientes, en el orden que recomiendo

### F-05 (P1) — El reporte puede mezclar resultados viejos con datos nuevos

Editar una celda dispara `validateLive()`, que **no invalida `state.result` ni
oculta el panel**. Al imprimir, el encabezado y las tablas salen del resultado
viejo mientras el anexo se arma leyendo el DOM actual — y el anexo afirma «los
cálculos de este reporte salen exactamente de estos datos». Lo agrava el rótulo
permanente **«actualizado al escribir»**, que promete algo que la app no hace.

### F-07 (P1) — %GRR sin intervalo de confianza

```
12 estudios simulados 10x3x3 del MISMO sistema (sigma_ms/sigma_pieza = 0.30):
  %GRR: 26.1 26.8 40.2 30.0 18.7 25.1 29.2 18.2 31.9 43.3 29.5 30.4
  rango 18.2 % a 43.3 %  -> el mismo gage cae a los dos lados del 30 %

300 estudios 3x5x2 de un sistema BUENO (sigma_ms/sigma_pieza = 0.15):
  21/300 declarados "Inaceptable"  -> 7 % de rechazos falsos
```

### F-27 (P2) — `design.js` es una precondición de carga, no una dependencia blanda

Anotado al revalidar F-03; **no** es un defecto de F-02 ni de F-03, es una
propiedad de la integración que conviene tener escrita.

`anova-nested.js` lee `global.MSADesign.KEY_SEP` **al evaluarse**, no dentro de
una función, y `loadPayload` usa `MSADesign`. Medido sirviendo un 404 para cada
archivo:

```
design.js 404 -> MSADesign:false MSANested:false | 2 pageerror
                 el boton de ejemplo y toda importacion se caen en los TRES metodos
stats.js  404 -> MSAStats:false, todo lo demas vivo | sin pageerror
```

Solo es alcanzable si un despliegue publica `index.html` sin `design.js`. El
camino de F-03 (imprimir) sigue sin lanzar y sigue restaurando incluso así.

**Decisión: no se degrada el motor anidado.** Un anidado que se apañara sin su
dependencia calcularía con una clave de celda distinta de la que usa la
pantalla, y eso es peor que no arrancar. Si la precondición es real, se prueba;
no se disimula. `tests/tests-carga.js` fija el contrato: comprueba el orden en
los tres cargadores (`index.html`, `tests/index.html`, `run-node.js`), que cada
módulo declare los globales que nombra, que cargar en el orden bueno funcione
**y que cargar en el orden malo falle** — lo último es lo que hace que lo
primero valga algo.

### Los demás

- **F-06:** `looksCategorical` exige >80 % de texto; atributos codificados 0/1
  sacan al usuario del método y corren un ANOVA de variables.
- **F-14:** `csvCell()` solo entrecomilla por `"`, `,` y salto de línea. Un
  nombre que empiece por `=`, `+`, `-` o `@` se ejecuta al abrir en Excel.
  Verificado: `=cmd|'/c calc'!A1` sale sin modificar.
- **F-15:** el pie de página afirma validación AIAG en las tres pantallas; el
  motor de atributos no tiene ningún dataset publicado detrás, cosa que los
  propios documentos del repo reconocen.
- **F-08:** solo `__proto__` rompe (`constructor`, `toString`, `valueOf` están
  bien); da `%StudyVar = 0` con `decompositionError = NaN`, y el guardia
  `> 1e-9` no dispara sobre NaN. Invertir a `!(x <= 1e-9)`.

---

## Calificaciones

| Dimensión | 31-ago inicial | Tras F-01/03/04 | Tras F-02 | Tras F-03.1 | Tras F-05/06/07 |
|---|---|---|---|---|---|
| Exactitud estadística | 72 | 78 | 85 | 85 | 91 |
| Calidad de código | 74 | 76 | 78 | 79 | 80 |
| Arquitectura | 70 | 73 | 76 | 76 | 78 |
| UX | 68 | 70 | 74 | 76 | 80 |
| UI | 84 | 84 | 84 | 84 | 84 |
| Seguridad | 68 | 68 | 68 | 68 | 68 |
| Rendimiento | 82 | 82 | 82 | 82 | 82 |

## ¿Publicaría esta aplicación en producción para una planta de manufactura?

**Los cuatro P0 están cerrados.** Con F-02 se va el último bloqueante: ya no hay
manera de que la aplicación analice una prueba destructiva con un modelo que
asume lo contrario de lo que ocurrió físicamente, ni de que empuje hacia él.

Con F-05, F-06 y F-07 cerrados, **sí**. Queda una afirmación que la pantalla
hace y no sostiene —la validación AIAG para los tres métodos, F-15—, y sigue en
pie la reserva de siempre: que un dictamen de liberación lo firme una persona
que sepa leer las gráficas, no la tarjeta de veredicto sola.

Con una advertencia que sale de haber cerrado F-07 y no estaba en la auditoría:
**el estudio 10×3×3 de manual no alcanza a clasificar un gage cuyo %GRR ronda
el umbral.** La aplicación ahora lo dice en vez de esconderlo detrás de un
punto, pero quien la use va a ver «no concluyente» más a menudo de lo que
espera. Eso es información, no un defecto — y cambia lo que conviene hacer:
diseñar estudios con más operadores, que es donde está el cuello de botella
(la reproducibilidad tiene o−1 grados de libertad).

Lo que sí publicaría hoy, con confianza, es el **motor cruzado como
calculadora**: reproduce los valores publicados de Minitab dígito a dígito y
está mejor documentado que el libro de Excel que reemplaza.

---

## Nota sobre cómo leer este documento

F-01 se enunció mal la primera vez, el autor pidió la demostración, y al
construirla resultó que un micrómetro excelente produce exactamente la misma
salida. El hallazgo sobrevivió —el defecto existe— pero más pequeño y de otra
naturaleza. **Los hallazgos pendientes no han pasado por ese mismo escrutinio.**
Antes de implementar cualquiera, conviene reproducirlo primero.

Pendientes de verificar contra fuente primaria, y señalados como tales desde el
principio: la convención de denominadores de la tabla de atributos de AIAG
(efectividad se cuenta a nivel de pieza, fuga y falsa alarma a nivel de
decisión) y la situación de CVE de Chart.js 4.4.1.
