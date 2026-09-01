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

> **Dónde vive esto.** *(Actualizado el 1 de septiembre de 2026.)* Todas las
> correcciones de la tabla están **en `main`**, fusionadas desde `develop` con
> el commit de merge `6da89cc`. Ya no hay que ir a `develop` a buscarlas: la
> advertencia anterior —«`main` sigue en `52b6b1e`, intacta»— quedó superada
> por ese merge.
>
> El mapa de commits de F-07 y los puntos a los que volver si hay que deshacer
> algo están en [`f07-commits.md`](f07-commits.md); lo que a F-07 le falta por
> rematar en escritorio, en [`f07-cabos-sueltos.md`](f07-cabos-sueltos.md).

| Hallazgo | Prioridad | Estado | Commit |
|---|---|---|---|
| F-04 · Categoría de rechazo por orden de aparición | P0 | **Cerrado** | `04dc8d5` |
| F-01 · `Var_GRR = 0` tratado como veredicto | P1 (era P0) | **Cerrado** | `3beef45`, `1fc0a3b` |
| F-03 · El reporte de atributos lanza TypeError | P0 | **Cerrado** | `b1dffdf` |
| F-03.1 · Impresión sin cálculo usa el encabezado de variables | P1 | **Cerrado** | este commit |
| F-02 · Anidado ruteado a cruzado | P0 | **Cerrado** | este commit |
| F-05 · Reporte con datos nuevos y tablas viejas | P1 | **Cerrado** | este commit |
| F-06 · Atributos 0/1 → ANOVA de variables | P1 | **Cerrado** | este commit |
| F-07 · %GRR sin intervalo de confianza | P1 | **CERRADO** (pendiente cotejo con Minitab) | `0105a08` |
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

### F-07 — Un punto sin intervalo decidía la aceptación · `0105a08` → `55c921f` · **CERRADO**

> **ACTUALIZACIÓN. El bloqueo de fuente se levantó y el MLS está implementado en
> los tres modelos**: cruzado con interacción, cruzado sin ella y anidado. Las
> fórmulas se transcribieron desde capturas de las páginas de Minitab aportadas
> por el usuario, no desde la red. El registro completo —qué se leyó verbatim,
> las **diez erratas** encontradas en la fuente, los puntos donde la
> implementación se aparta de lo impreso y con qué álgebra, y la constante `H*`
> que Minitab usa sin definir— está en
> [`docs/mls-transcripcion.md`](mls-transcripcion.md). El módulo es
> `assets/js/mls.js`; las pruebas, `tests/tests-mls.js`; la evidencia
> regenerable, `tests/mls-cobertura.js`. Ningún modelo se rotula ya como
> experimental. El GPQ se conserva como segunda opinión independiente y es lo
> que las pruebas usan de juez.
>
> **Lo que sigue pendiente, y por qué no bloquea el cierre:**
>
> - **El cotejo contra una corrida real de Minitab.** Es la validación que
>   falta: las comprobaciones hechas son internas o contra el GPQ. Está
>   planificada.
> - **`H*_qr`**, que Minitab usa sin definir en ninguna de las tres páginas.
>   Resuelto por cobertura medida y rotulado como elección empírica. Sólo afecta
>   al límite inferior del %GRR.
> - **La limitación 3 (sub-cobertura del anidado) mejora pero no desaparece:**
>   el 10×3×3 pasa de 89.5 % a 90.0 % y el 5×3×2 de 87.3 % a 88.3 %, contra un
>   90 % nominal. Cambiar de método no era la causa entera. Queda registrada
>   como limitación, no como hallazgo abierto.
>
> **Lo que NO cambió:** el intervalo sigue sin dictaminar. Los dos motivos por
> los que se retiró esa política son geométricos y ajenos al método —la banda
> condicional mide 20 pp y muchos intervalos son más anchos, y la conclusividad
> dependía de la distancia del gage al umbral y no de la calidad del estudio—,
> así que tener ya el método publicado no los arregla.

<details>
<summary>Registro del estado anterior, cuando F-07 estaba bloqueada por la fuente</summary>

> **F-07 NO está cerrada.** La revisión metodológica completa está en
> [`docs/f07-validacion-gpq.md`](f07-validacion-gpq.md). Este recuadro es el
> punto de entrada para retomar el trabajo desde otra sesión o cuenta: resume
> qué se implementó, qué falta y por qué, con referencia a las secciones
> exactas del documento largo.
>
> #### Lo que quedó implementado (commit `55c921f`)
>
> - **Las cuatro afirmaciones falsas sobre Minitab, retiradas** de
>   `interval.js`, esta auditoría, `README.md` y el documento de validación:
>   «GPQ es el método de Minitab», «90 % es su valor por omisión», y «no hay
>   valores publicados contra qué validar» (sí los hay: existe una página
>   propia de Minitab para intervalos de *razones* de varianza).
> - **El GPQ dejó de dictaminar.** Vuelve a dictaminar la **estimación
>   puntual** con las bandas AIAG (`assess()` en `anova.js`). El intervalo se
>   conserva como información, rotulado «GPQ experimental, en validación, no
>   utilizado para el dictamen», y cuando cruza un límite emite sólo una
>   advertencia de lectura — nunca una categoría.
> - **Retirada la política que exigía el intervalo entero dentro de una
>   banda**, con dos motivos medidos: la banda condicional mide 20 pp y un
>   intervalo más ancho no cabe en ella por geometría (un 5×3×2 concluía el
>   0 % de las veces), y la conclusividad dependía de la distancia del gage al
>   umbral, no de la calidad del estudio.
> - **Piso de 60 mediciones retirado**, sin sustituto obligatorio; quedan
>   avisos informativos por operadores, piezas, réplicas y representatividad
>   del rango, en los dos motores.
> - **Un solo intervalo, dos escalas.** %Contribution y %Study Variation se
>   derivan del mismo intervalo de la razón `V_GRR/V_Total`; ya no pueden
>   contradecirse entre sí.
> - **Fronteras de banda unificadas**: 1.00, 9.00, 10.00 y 30.00 son
>   condicionales, escritas una sola vez en `assess`. Antes, 9.00 exacto hacía
>   que el criterio puntual y el del intervalo se contradijeran.
> - **Nivel de confianza seleccionable** (90/95/99, 95 % por omisión), en la
>   huella del resultado, recalcula al cambiar, se imprime.
> - Suites en verde tras el cambio: 196/196 Node, 75/75 impresión, 50/50
>   diseño, 35/35 frescura.
>
> Detalle completo: §3, §5–§9 y §13 de `docs/f07-validacion-gpq.md`.
>
> #### Lo que NO se hizo, y por qué
>
> **El intervalo oficial por MLS/Satterthwaite sobre la razón —el núcleo de
> F-07— sigue sin implementarse.** No es una decisión pendiente de aprobación:
> es un bloqueo de fuente. Este entorno tiene el egreso de red restringido
> (`support.minitab.com` responde 403 al proxy), así que no se pudieron leer
> las páginas de fórmulas directamente. **El 31 de agosto se subió al
> repositorio un documento técnico de referencia** —
> [`docs/mls-fuente-minitab.md`](mls-fuente-minitab.md)
> — que investigó las fuentes primarias y **desbloquea una parte, no toda**:
>
> - **Desbloqueado y listo para implementar:** el intervalo exacto χ² de
>   repetibilidad, las constantes G_q/H_q con su regla de validación de rango,
>   el MLS reconstruido para combinaciones lineales positivas (Gage total,
>   Total, validable numéricamente contra Minitab), el truncamiento y la regla
>   de límites unilaterales. Todo confirmado verbatim o con ruta de validación
>   clara.
> - **Sigue bloqueado, con una corrección importante.** Los coeficientes `A`,
>   `B`, `C` de la ecuación cuadrática de la **razón** —el cálculo que
>   efectivamente reemplazaría al GPQ— siguen sin estar transcritos en este
>   repositorio. El documento técnico decía que sólo existen como imágenes PNG
>   en Minitab. **Es incorrecto, o incompleto**: el 31 de agosto, el
>   responsable del producto abrió la página pública de Minitab en su propio
>   navegador y las fórmulas se renderizan como **texto matemático real**, no
>   como una captura de pantalla — confirmado visualmente para la razón
>   parte/total, caso "con operador y con interacción" (`Limite inferior =
>   (−B − √(B²−4AC))/2A`, con A, B, C en términos de `S1⁴..S4⁴` y los cruzados
>   `G12, G13, H12, H13`...). **El bloqueo real era el egreso de red de este
>   contenedor** (`support.minitab.com` da 403), no la ausencia de la fórmula
>   en la web pública.
>
>   No se transcribió: la captura llegó cortada por scroll horizontal —
>   términos de `A` y `B` se pierden a la mitad— y sólo cubre una de las tres
>   variantes que hacen falta (falta "sin interacción" y el caso anidado). Un
>   coeficiente con un término faltante da un intervalo silenciosamente
>   incorrecto, así que no se transcribe nada parcial. **Acordado: el
>   responsable del producto sube el texto completo de las tres variantes en la
>   siguiente sesión.** Detalle completo, con lo que se alcanzó a leer, en el
>   recuadro de corrección del §14 de `docs/f07-validacion-gpq.md`.
>
> **Plan para continuar, en dos etapas — ver §14 de `docs/f07-validacion-gpq.md`
> para el detalle completo:**
>
> 1. **Etapa 1 (aprobable ya):** implementar lo desbloqueado — repetibilidad
>    exacta, G_q/H_q, MLS reconstruido y validado para Gage total/Total — en un
>    módulo nuevo que no reutiliza funciones del GPQ. No resuelve el intervalo
>    de la razón, pero dejaría el terreno determinista y sin simulación donde
>    sí hay fuente.
> 2. **Etapa 2 (a la espera del texto completo, no de acceso de pago):** en
>    cuanto llegue la transcripción completa de las tres variantes, se cita con
>    número de página/sección de la página de Minitab de donde salió y se
>    implementa. Ruta alternativa si no llega: fuentes de pago con acceso
>    institucional (Burdick, Borror & Montgomery 2005; Gui, Graybill, Burdick &
>    Ting 1995; Burdick & Graybill 1992), o documentar permanentemente el
>    intervalo de la razón como «sin fuente primaria verificable» y mantener el
>    GPQ como único intervalo, ya rotulado experimental — que es el estado
>    actual.
>
> **Hallazgo adicional del documento:** la sub-cobertura del motor anidado
> (86–88 % contra 90 % nominal, medida en §12 limitación 3) puede no ser un
> defecto de esta implementación — Chiang (2001/2002) documenta que MLS y
> Satterthwaite para razones sub-cubren cuando el componente del numerador es
> pequeño y de pocos grados de libertad, el régimen exacto de un anidado con
> pocos operadores. Queda como hipótesis a confirmar en la Etapa 1.


**Reproducido** con el motor en vivo, y confirma el hallazgo:

```
12 estudios 10x3x3 del MISMO sistema (sigma_ms/sigma_pieza = 0.30)
  %GRR: 38.8 21.4 21.7 40.7 31.4 36.0 30.3 44.8 23.5 20.4 25.6 29.9
  rango 20.4 a 44.8   -> el mismo gage a los dos lados del 30 %
300 estudios 3x5x2 de un sistema BUENO: 24/300 "Inaceptable" -> 8 % de rechazos falsos
```

> **CORREGIDO DESPUÉS DE F-07.** El párrafo original decía «Método: GPQ, el que
> usa Minitab». **Era falso.** Minitab documenta **MLS** como método principal
> para los intervalos de razones de varianza, y usa **Satterthwaite** u otra
> aproximación publicada cuando no se cumplen las condiciones del método
> principal. El GPQ es una implementación **experimental de esta aplicación**.

**Método: GPQ**, implementado por esta aplicación y **no atribuible a Minitab**.
En un modelo balanceado cada cuadrado medio cumple `MS·df/σ² ~ χ²_df`, así que
`MS·df/W` con `W ~ χ²_df` simulada es una cantidad pivotal generalizada. Se
simulan juegos de MS, se recalculan los componentes **con las mismas fórmulas
del motor** —truncado de negativos incluido— y se toman percentiles.

> **CORREGIDO DESPUÉS DE F-07.** «No hay valores publicados a mano para estos
> intervalos» **era falso**. Minitab publica método y fórmulas para los
> intervalos de **razones de varianza**, cruzado y anidado por separado. La
> referencia existe; lo que no se ha hecho es comparar contra ella.

**Validación: cobertura, no una tabla copiada.** Se simulan estudios de sistemas
con %GRR verdadero conocido y se cuenta cuántas veces el intervalo lo contiene.
Es evidencia de consistencia interna, **no** validación externa. Medido contra
un nominal de 90 %:

| Caso | Cobertura | Ancho medio |
|---|---|---|
| cruzado 10×3×3, marginal | 96.0 % (al 95 % nominal) | 40.1 pp |
| cruzado 10×3×3, bueno | 95.8 % (al 95 %) | 26.4 pp |
| cruzado 5×3×2 | 96.0 % (al 95 %) | 38.1 pp |
| anidado 10×3×3 | 93.0 % (al 95 %) | 61.6 pp |

Una cobertura sobre cientos de estudios no se acierta por casualidad; un número
suelto, sí.

> **CORREGIDO DESPUÉS DE F-07.** «90 %, el valor de Minitab» **era falso**: no
> se demostró que 90 % sea el valor por omisión de Minitab, cuya documentación
> dice que 95 % normalmente funciona bien. Y justificar el nivel por «concluye
> más veces» es **circular**: cuántas veces se emite un veredicto no es un
> criterio estadístico. **Confianza por omisión hoy: 95 %**, seleccionable
> entre 90, 95 y 99.

> **RETIRADO DESPUÉS DE F-07.** La política que describe este párrafo —el
> veredicto sale del intervalo— **ya no existe**. Se retiró por dos motivos
> medidos: la banda condicional [10 %, 30 %] mide 20 pp y un intervalo más ancho
> no cabe en ella **por geometría** (un 5×3×2 concluía el 0 % de las veces), y
> la conclusividad dependía de la distancia del gage al umbral, no de la calidad
> del estudio. **Hoy dictamina la estimación puntual con las bandas AIAG**, y el
> intervalo sólo advierte cuando cruza un límite.

**El resultado incomoda, y es correcto.** Sobre el propio dataset AIAG:

```
%StudyVar 27.86 %   Evaluacion AIAG puntual: Condicional segun la aplicacion
                    IC 95 % [14.92, 81.72]  -> advertencia: cruza el limite de 30 %
```

El intervalo es genuinamente ancho, y no es un defecto del cálculo: con 3
operadores la reproducibilidad tiene **2 grados de libertad**, y en el pivote
`MS_op` se puede inflar hasta 40×. Lo que cambió es la lectura: el estudio
**sí** recibe dictamen —el puntual— y el intervalo advierte que ese dictamen
cae cerca de una frontera.

> **RETIRADO DESPUÉS DE F-07.** El piso de 60 mediciones **ya no existe**.
> Medía el total de mediciones, que no distingue estructuras de diseño: un
> 2×15×2 de 60 mediciones da un intervalo **2.7× más ancho** que un 3×10×2 de
> las mismas 60, y el piso los trataba igual mientras bloqueaba un 3×5×2 de 30
> que es mejor que el 2×15×2. La representatividad del rango de piezas sigue
> siendo un motivo legítimo para **advertir** —y se advierte, en los dos
> motores—, pero no para un umbral numérico que bloquee el veredicto.

**Ningún motor se tocó.** `interval.js` lee la tabla ANOVA del propio
resultado. La regresión visual lo confirma: `panelComponentes`, `panelAnova`,
`csv` y el anexo salen idénticos; cambian solo las tarjetas, los avisos y el
encabezado impreso, que es donde entra el intervalo.

</details>

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

**Qué detecta, y qué no.** Detecta datos numéricos con pocos valores distintos
(≤ 3) y todos enteros. **No detecta que sean atributos, ni puede.** «3 valores
enteros» no prueba que haya una codificación: prueba que la captura **admite**
esa lectura. El mismo patrón lo produce, con toda legitimidad, una medición
real de escala corta y unidad entera —un durómetro que reporta 10, 11 y 12— o
un instrumento de resolución gruesa frente a la variación de las piezas (F-01).
Ninguna estadística de los valores separa esos casos, porque la diferencia no
está en los números sino en qué mide el instrumento, y eso solo lo sabe quien
hizo el estudio.

El umbral es la condición **necesaria** de una codificación —toda codificación
la cumple— y lo bastante estrecha para no dispararse sobre una medición
continua. Es un filtro de sensibilidad alta y especificidad baja **a
propósito**: se prefiere preguntar de más a analizar de más en silencio. No se
busca «0 y 1» en concreto, porque `1/2`, `1/3` y `-1/1` son igual de comunes.

**Y no decide.** Dos niveles también salen de un calibre de aguja o de un
estudio real cuyas piezas resultaron casi idénticas; los datos no distinguen
los casos. Se aplica la misma regla de F-02: **un cambio de método que altera
el modelo estadístico nunca es silencioso.**

| Método activo | Antes | Ahora |
|---|---|---|
| atributos | se iba a cruzado | **se queda**, y dice por qué |
| cruzado / anidado | analizaba en silencio | **pregunta**, con las cifras del archivo delante |
| el archivo declara método | — | manda el archivo, sin preguntar |

Cancelar es una respuesta, no un silencio: queda constancia de la decisión **y
se recuerda**. Quien confirma que su durómetro de 10/11/12 mide de verdad no
vuelve a ver el aviso sobre esos datos — un aviso que no se puede resolver deja
de leerse, incluido el día que sí importa. La memoria guarda la **firma de los
datos**, no un «ya avisé»: editar las mediciones vuelve a preguntar.

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

Con una advertencia que sale de F-07: **el estudio 10×3×3 de manual estima el
%GRR con mucha imprecisión cuando el gage ronda un umbral.** El intervalo lo
hace visible en vez de esconderlo detrás de un punto. Eso es información, no un
defecto — y cambia lo que conviene hacer: diseñar estudios con más operadores,
que es donde está el cuello de botella (la reproducibilidad tiene o−1 grados de
libertad). Lo que **no** se hace con esa información es retirar el dictamen:
F-07 demostró que hacerlo dejaba estudios enteros sin veredicto por la posición
del gage frente al umbral, no por la calidad de la medición.

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
