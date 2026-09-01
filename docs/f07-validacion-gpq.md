# F-07 — Validación del intervalo de confianza del %GRR

> **ACTUALIZACIÓN (1 de septiembre de 2026, posterior a todo lo que sigue).
> El MLS está implementado para los TRES modelos** —cruzado con interacción,
> cruzado sin ella y anidado—, con la aproximación de Satterthwaite como
> alternativa, transcrito de las páginas de Minitab. La transcripción, las diez
> erratas de la fuente y la validación están en
> [`mls-transcripcion.md`](mls-transcripcion.md); el módulo, en
> `assets/js/mls.js`.
>
> **Lo que este documento sigue describiendo correctamente:** la mecánica del
> GPQ, que se conserva como **segunda opinión independiente** y es lo que las
> pruebas usan de juez; y las mediciones que retiraron la política de
> dictaminar por intervalo, que siguen vigentes porque son geométricas y no
> dependen del método.
>
> **Lo que ha quedado obsoleto:** todo lo que aquí se lee como «el cruzado usa
> GPQ», «el anidado usa GPQ» o «falta implementar MLS». Ningún modelo sale ya
> por GPQ: hay que pedirlo a propósito con `options.method = 'GPQ'`. Obsoleto
> también **«nivel de confianza 90 %, fijo, no configurable»** (§1 y §3): hoy
> el valor por omisión es **95 %** y se elige en pantalla entre 90, 95 y 99 %.

**Estado: F-07 está cerrada en los tres modelos.** El intervalo sale por MLS,
ningún modelo se rotula experimental, y el intervalo sigue sin dictaminar —la
política de veredicto se corrigió en su momento (§13)—. Lo que queda pendiente
no es método sino verificación externa, y está en
[`f07-cabos-sueltos.md`](f07-cabos-sueltos.md).

> **Corrección de fondo respecto a la primera versión de este documento.** El
> §4 de la versión original concluía que el intervalo de la razón «no tiene
> referencia externa». **La premisa era incorrecta: la referencia existe.**
> Minitab publica método y fórmulas para los intervalos de **razones de
> varianza**, en páginas propias para cruzado y anidado, con MLS como método
> principal y Satterthwaite como alternativa cuando la ecuación cuadrática no
> tiene solución válida (`B² − 4AC < 0`). La brecha no es «no hay contra qué
> validar»; es **«hay una referencia publicada y esta aplicación no se ha
> comparado contra ella»**. Eso convierte la brecha de insalvable en ejecutable.

Todos los números se regeneran con `node tests/evidencia-f07.js` (secciones:
`exacta`, `mls`, `aiag`, `cobertura`, `diseno`, `semilla`, `modelo`). Ese script
no toca la aplicación; sólo lee sus resultados.

**Correcciones que este informe hace a lo que afirmé antes:**

1. **La afirmación «GPQ es el método de Minitab» era falsa.** Minitab usa MLS.
   Retirada — §2.
2. **La justificación del 90 % era circular.** Se sostenía en «concluye más», que
   no es un argumento estadístico — §3.
3. **El piso de 60 mediciones no distingue estructuras de diseño.** Medido: no lo
   hace, y hay diseños de 60 peores que otros de 30 — §5.

---

## 1. Definición exacta del método implementado

**Nombre.** Generalized Pivotal Quantity (GPQ), también llamado *generalized
confidence interval* (GCI). Es un método de **inferencia generalizada**
(Weerahandi), no de máxima verosimilitud ni bootstrap.

**Referencia.** El método está publicado para estudios Gage R&R en
Burdick, Borror y Montgomery, *Design and Analysis of Gauge R&R Studies: Making
Decisions with Confidence Intervals in Random and Mixed ANOVA Models*
(ASA-SIAM, 2005), que cubre **MLS y intervalos generalizados** como las dos
familias disponibles. La literatura comparativa lo nombra **GCI** junto a MLS y
a un método bayesiano. **No he podido acceder al texto primario desde este
entorno**, así que la implementación no está trazada línea por línea contra una
fórmula publicada: está validada contra dos referencias independientes (§5).

**Parámetro.** No uno: el intervalo se construye sobre la **distribución
conjunta simulada de los componentes**, y de ahí salen los intervalos marginales
de %Study Variation, %Contribution y %Tolerance. No hay un intervalo de σ²
publicado en la interfaz.

**Algoritmo.** Con `MS_i` y `df_i` de la tabla ANOVA del resultado:

```
para b = 1..B:
    para cada fuente i del modelo:
        W_i  ~ chi2(df_i)                    (Marsaglia-Tsang -> Gamma -> chi2)
        MS~_i = MS_i * df_i / W_i             <- la cantidad pivotal
    componentes = build_modelo(MS~)           <- MISMAS formulas del motor
    metricas[b] = { %StudyVar, %Contribution, %Tolerance }
intervalo = percentiles [alpha/2, 1-alpha/2] de cada metrica
```

**El pivote.** En un modelo balanceado de efectos aleatorios,
`MS_i·df_i/σ²_i ~ χ²_{df_i}` y los `MS_i` son independientes. Por tanto
`MS_i·df_i/W_i` con `W_i ~ χ²_{df_i}` simulada es una cantidad pivotal
generalizada para el `σ²_i` que produjo ese `MS_i`.

**Distribuciones.** Sólo χ²: Gamma(k/2,1) por Marsaglia–Tsang (con la corrección
`shape<1 → Gamma(shape+1)·U^{1/shape}`), normal por Box–Muller, uniforme por
mulberry32. Verificado en `tests-interval.js`: media y varianza de la χ²
simulada coinciden con `k` y `2k` para k ∈ {1,2,5,27,60}.

**Cuadrados medios y grados de libertad.** Se leen de `result.anova`, la misma
tabla que la aplicación imprime. Cada fila aporta `df` y `ms`; nada más. El
mapeo fuente → coeficiente por modelo:

| Modelo | Fuentes leídas | σ²_rep | σ²_repro | σ²_part |
|---|---|---|---|---|
| `with-interaction` | Parte, Operador, Operador×Parte, Repetibilidad | `MS_E` | `max(0,(MS_O−MS_PO)/(p·r)) + max(0,(MS_PO−MS_E)/r)` | `(MS_P−MS_PO)/(o·r)` |
| `without-interaction` | Parte, Operador, Repetibilidad | `MS_E` (agrupado) | `max(0,(MS_O−MS_E)/(p·r))` | `(MS_P−MS_E)/(o·r)` |
| `nested` | Operador, Pieza(Operador), Repetibilidad | `MS_E` | `max(0,(MS_O−MS_PO)/(n·r))` | `(MS_PO−MS_E)/r` |

**Componentes negativos y truncados.** Se truncan a cero **dentro** del pivote,
igual que el motor. Es deliberado: el truncado forma parte del estimador y
desplaza su distribución, así que ignorarlo daría el intervalo de un estimador
distinto del que se publica. **Consecuencia medible:** el límite inferior del
GPQ queda sistemáticamente por encima del de MLS, que no trunca (§5). La tasa de
truncado llega al **67 %** en escenarios con σ²_op ≈ 0 (§6).

**Resultados no finitos.** Un sorteo con `W_i ≤ 0` o no finito se descarta; un
`%StudyVar` no finito se descarta. Si sobreviven menos de `B/2` sorteos, se
devuelve `null` y **no se publica intervalo**. En los 6 000 estudios simulados
de §6 no se descartó ninguno.

**V_grr ≈ 0.** No hay caso especial. `σ_total = 0` da `%StudyVar = 0`, y por
tanto un intervalo degenerado. **Esto no está probado ni acotado** — ver §12.
Los estudios degenerados de F-01 se filtran antes: `app.js` no llama a `classify`
si `result.inconclusive`.

**Cruzado vs anidado.** Sólo cambia la tabla de arriba. El anidado usa
`Pieza(Operador)` y **no** existe `Operador × Parte` (verificado, §11).

**Número de sorteos.** `DRAWS = 4000`, fijo. **No hay criterio de convergencia.**

**Error Monte Carlo.** Medido sobre el AIAG: con 4 000 sorteos el límite superior
da 69.18 %; con 20 000, 70.13 %. **≈ 1 punto porcentual de ruido en el límite
superior con la configuración de producción.** No es despreciable y no está
declarado en la interfaz — ver §12.

**Nivel de confianza.** 90 %, fijo, no configurable. Ver §3.

**Los intervalos que se piden en la revisión, uno por uno:**

| Cantidad | ¿Se publica? |
|---|---|
| σ²_repetibilidad | **No.** Se simula, no se expone. |
| σ²_reproducibilidad | **No.** |
| σ²_Gage R&R | **No** en la interfaz. Sí se calcula en la evidencia (§5). |
| σ²_pieza a pieza | **No.** |
| σ²_total | **No.** |
| %Contribution | Sí — percentiles de `100·grr/total`. |
| %Study Variation | Sí — percentiles de `100·√(grr/total)`. |
| %Tolerance | Sí — percentiles de `100·k·√grr·(½ si unilateral)/tolerancia`. Si no hay LSL/USL ni tolerancia, `tolerance = null` y la fila desaparece. |

---

## 2. La afirmación sobre Minitab: **retirada**

**Era falsa.** La documentación oficial de Minitab describe, para Gage R&R
cruzado y anidado, el método **Modified Large Sample (MLS)** para los
componentes de varianza, con **Satterthwaite como respaldo** cuando MLS no
aplica, y acota a cero los límites negativos.

Fuentes:
[componentes de varianza, cruzado](https://support.minitab.com/en-us/minitab/help-and-how-to/quality-and-process-improvement/measurement-system-analysis/how-to/gage-study/crossed-gage-r-r-study/methods-and-formulas/variance-components-in-confidence-intervals/) ·
[componentes de varianza, anidado](https://support.minitab.com/en-us/minitab/help-and-how-to/quality-and-process-improvement/measurement-system-analysis/how-to/gage-study/nested-gage-r-r-study/methods-and-formulas/variance-components-in-confidence-intervals/) ·
[razones de varianza, cruzado](https://support.minitab.com/en-us/minitab/help-and-how-to/quality-and-process-improvement/measurement-system-analysis/how-to/gage-study/crossed-gage-r-r-study/methods-and-formulas/variance-ratios-in-confidence-intervals/)

**Descripción correcta, y la única que debe usarse:**
> «Método GPQ implementado por la aplicación.»

**Qué pretende reproducir mi intervalo:** ninguno de los de Minitab. Es una
**construcción propia de esta aplicación** sobre un método publicado. En
particular, el intervalo de %Study Variation **no** es el de Minitab, ni se ha
comparado con él.

**Pendiente de corregir en código y textos** (§13): el docblock de
`interval.js`, la etiqueta `IC 90 % del %GRR (GPQ)` del reporte y la entrada
F-07 de la auditoría afirman o insinúan la equivalencia con Minitab.

---

## 3. El nivel de confianza

> **ACTUALIZADO.** El 90 % por omisión está **retirado**. Hoy el valor por
> omisión es **95 %**, seleccionable entre 90, 95 y 99 desde la pantalla. El
> nivel entra en la huella del resultado, obliga a recalcular al cambiarlo y se
> imprime en el reporte. Ya no se atribuye ningún nivel a Minitab, cuya
> documentación dice que 95 % normalmente funciona bien. La justificación
> anterior —«al 90 % se concluye más»— era **circular** y está retirada: con qué
> frecuencia se emite un veredicto no es un criterio estadístico. Y desde que el
> intervalo no dictamina, la objeción desaparece por completo: cambiar el nivel
> ya no puede cambiar ningún dictamen.

**La justificación que di era circular** — «concluye el 44 % de las veces en vez
del 18 %» describe una consecuencia, no un criterio. Retirada.

**Qué riesgo representa.** α = 0.10 repartido 5 % por cola. La regla de veredicto
exige que el intervalo **entero** caiga en una banda, así que declarar
«Aceptable» equivale a un test unilateral al **5 %** de que el %GRR verdadero
supere el umbral. Con 95 % sería al 2.5 %.

**Qué cambia frente al 95 %** (AIAG, §7): `[16.95, 69.18]` al 90 % contra
`[14.92, 81.72]` al 95 %.

**Tasas medidas** (§6, 400 estudios/escenario, al 90 %):

- **Aceptación incorrecta: 0/6000.** Ningún estudio con %GRR real > 30 % fue
  declarado Aceptable, en ningún escenario.
- **Rechazo incorrecto: 0/6000.** Ningún estudio con %GRR real < 10 % fue
  declarado Inaceptable.
- **No concluyentes: del 18 % (gage muy malo) al 100 %** (5×3×2).

La regla de intervalo-entero-en-banda es **muy conservadora**: convierte el
riesgo de decidir mal en riesgo de no decidir. Bajar del 95 % al 90 % no
compró tasa de error — ya era cero — compró conclusividad.

**Recomendación reconocida.** No he encontrado una recomendación AIAG o Minitab
sobre qué nivel usar para *dictaminar*. Minitab documenta el método, no una
política de decisión. **Por tanto el 90 % es una política propia de esta
aplicación y debe presentarse como tal.**

**Selector propuesto (requiere aprobación, §13).** 90 / 95 / 99, con 95 % como
predeterminado documentado — es el convenio por defecto en calidad y no fue
elegido para producir más veredictos. Y con todo lo que la revisión pide: el
nivel se guarda con el estudio, entra en `state.stamp`, aparece en pantalla, CSV
y reporte, forma parte de la semilla, cambiarlo marca el resultado desactualizado
y recalcula el veredicto.

---

## 4. Validación independiente

Dos referencias, **ninguna comparte una línea con `interval.js`**.

### 4.1 Referencia EXACTA (analítica)

Para un solo componente, el intervalo correcto se conoce en forma cerrada:
`[df·MS/χ²_{df,1−α/2}, df·MS/χ²_{df,α/2}]`. La χ² inversa se implementó desde
cero (Lanczos + serie/fracción continua de la gamma incompleta + bisección), sin
usar `stats.js`. 200 000 sorteos:

| df | MS | exacto inf | exacto sup | GPQ inf | GPQ sup | dif inf | dif sup |
|---|---|---|---|---|---|---|---|
| 6 | 1.00000 | 0.476509 | 3.668866 | 0.476340 | 3.671008 | −0.035 % | +0.058 % |
| 18 | 2.50000 | 1.558749 | 4.792100 | 1.557784 | 4.792384 | −0.062 % | +0.006 % |
| 60 | 0.03907 | 0.029643 | 0.054279 | 0.029629 | 0.054285 | −0.047 % | +0.012 % |
| 200 | 1.00000 | 0.854722 | 1.188506 | 0.854391 | 1.188556 | −0.039 % | +0.004 % |

**Concuerda con la referencia exacta dentro del error Monte Carlo.** Valida el
pivote, el muestreador χ² y la maquinaria de percentiles.

### 4.2 Referencia MLS (Graybill–Wang), forma cerrada

Sobre σ²_grr, donde MLS aplica directamente (combinación lineal de coeficientes
positivos). `L = θ − √(ΣG²c²MS²)`, `U = θ + √(ΣH²c²MS²)`,
`G_i = 1 − df_i/χ²_{df_i,1−α}`, `H_i = df_i/χ²_{df_i,α} − 1`. Sin simular.

| Caso | Modelo | Punto | MLS | GPQ | dif inf | dif sup |
|---|---|---|---|---|---|---|
| AIAG 10×3×3 | sin interacción | 0.09143 | [0.05528, 1.06786] | [0.05564, 1.09351] | +0.7 % | +2.4 % |
| AIAG, interacción forzada | con interacción | 0.08943 | [0.05342, 1.06586] | [0.06171, 1.07296] | **+15.5 %** | +0.7 % |
| sim 10×3×3 con interacción | con interacción | 0.07212 | [0.05747, 0.29977] | [0.06161, 0.30695] | +7.2 % | +2.4 % |
| sim 25×4×3 sin interacción | sin interacción | 0.02315 | [0.01983, 0.05028] | [0.01988, 0.05061] | +0.3 % | +0.7 % |
| sim 5×3×2 chico | sin interacción | 0.01855 | [0.01271, 0.06137] | [0.01335, 0.06342] | +5.1 % | +3.3 % |

**Concuerdan, y la discrepancia tiene explicación metodológica.** Todas las
diferencias del límite inferior son **positivas** — GPQ siempre por encima de
MLS. Es el truncado a cero: GPQ trunca dentro del pivote, MLS no. La mayor
(+15.5 %) es el modelo con interacción, que tiene dos componentes truncables.
La dirección es la esperada y es consistente en los cinco casos.

**Lo que estas dos referencias NO cubren:** el intervalo de la **razón**
`V_GRR / V_Total`, del que salen %Study Variation y %Contribution. §4.1 valida un
componente aislado; §4.2 valida σ²_grr, que es un **numerador**. La razón tiene
el mismo σ²_grr en el numerador y dentro del denominador, así que su
distribución **no** se deduce de las marginales de sus partes: la correlación
entre numerador y denominador es justo lo que no está verificado, y justo lo que
modela la ecuación cuadrática de la referencia publicada.

**La razón sigue sin validarse contra la referencia externa, que sí existe** (ver
el recuadro del encabezado). Ésa es la brecha principal, y es la razón por la
que el GPQ dejó de dictaminar.

---

## 5. Cobertura por escenario

400 estudios por escenario, 1 200 sorteos GPQ cada uno, confianza nominal 90 %,
semilla base 20260907. `EE` = error estándar binomial de la cobertura.
**`ACEP` e `INAC` salen del veredicto PUNTUAL AIAG**, que es el que dictamina;
`cruza` es el porcentaje de estudios en que el intervalo toca un límite y se
emite la advertencia de lectura.

| Escenario | %GRR real | Cobertura | EE | trunc. | ACEP | INAC | cruza | acept. mala | rech. malo |
|---|---|---|---|---|---|---|---|---|---|
| cruzado excelente (lejos de 10) | 5.4 | 91.3 | ±1.4 | 19 % | 387 | 0 | 225 | 0 | 0 |
| cruzado **justo en 10 %** | 10.0 | 90.3 | ±1.5 | 11 % | 184 | 1 | 392 | 0 | 1 |
| cruzado medio (20 %) | 19.9 | 90.5 | ±1.5 | 17 % | 0 | 39 | 348 | 0 | 0 |
| cruzado **justo en 30 %** | 29.8 | 91.3 | ±1.4 | 16 % | 0 | 213 | 368 | 0 | 0 |
| cruzado malo (55 %) | 54.6 | 90.5 | ±1.5 | 10 % | 0 | 400 | 73 | 0 | 0 |
| cruzado **con interacción** | 29.5 | 91.8 | ±1.4 | 25 % | 0 | 236 | 369 | 0 | 0 |
| cruzado **σ_op = 0 exacto** | 19.6 | 90.8 | ±1.4 | **67 %** | 1 | 30 | 262 | 0 | 0 |
| cruzado σ_op ≈ 0 | 19.6 | **93.8** | ±1.2 | **64 %** | 0 | 25 | 298 | 0 | 0 |
| cruzado chico 5×3×2 | 14.7 | 91.0 | ±1.4 | 39 % | **35** | **46** | 397 | 0 | 0 |
| cruzado 2 operadores | 28.5 | **94.0** | ±1.2 | 37 % | 0 | 197 | 385 | 0 | 0 |
| cruzado 5 operadores | 28.5 | 90.5 | ±1.5 | 6 % | 0 | 197 | 367 | 0 | 0 |
| cruzado grande 25×4×4 | 28.5 | 90.3 | ±1.5 | 3 % | 0 | 140 | 361 | 0 | 0 |
| **anidado** 10×3×3 | 28.5 | 89.5 | ±1.5 | 60 % | 0 | 204 | 365 | 0 | 0 |
| **anidado** 5×3×2 | 14.7 | **87.3** | ±1.7 | 58 % | **30** | **112** | 384 | 0 | 0 |
| **anidado** malo | 54.6 | 90.0 | ±1.5 | 40 % | 0 | 400 | 12 | 0 | 0 |

ACEP+INAC no suma 400: falta la banda condicional (10–30 %).
Procedimiento: normales independientes, σ_pieza = 1, σ_op y σ_rep fijados para
el %GRR objetivo; interacción sólo en el escenario marcado; anidados generados
con piezas propias por operador.

**Lecturas:**

- Cobertura del intervalo entre **87.3 % y 94.0 %** contra un nominal de 90 %.
- **Conservador donde hay poca información:** 2 operadores (94.0 %) y σ_op ≈ 0
  (93.8 %). Coherente con el truncado.
- **Tasa de truncado hasta 67 %**, y no aparece en la interfaz.
- **El anidado sub-cubre de forma sistemática** — no es ruido; ver limitación 3
  del §12.

**El precio de que dictamine el punto, medido y explícito.** Con el veredicto
puntual, los estudios chicos **sí** emiten clasificaciones equivocadas dentro de
la banda condicional: un 5×3×2 cruzado cuyo %GRR real es 14.7 % —o sea,
condicional— se declara **Aceptable 35 veces y No aceptable 46 veces de 400**; el
anidado equivalente, 30 y 112. Ninguna de esas etiquetas es correcta. Los
errores graves siguen en cero (aceptar un gage con %GRR real > 30, o rechazar uno
con real < 10: **0 en 6 000 estudios**, salvo un único caso en el escenario que
está *exactamente* sobre el umbral del 10 %).

Ese es el intercambio que F-07 acepta conscientemente: la política anterior
evitaba esas etiquetas equivocadas retirando el veredicto, pero lo retiraba
tanto que la banda condicional era inalcanzable y la decisión dependía de la
posición del gage frente al umbral. **Un dictamen imperfecto y declarado es
preferible a ningún dictamen**, y por eso la advertencia de cruce existe: en el
5×3×2 el intervalo cruza un límite en el **99 %** de los estudios, así que la
advertencia aparece prácticamente siempre que la clasificación es frágil.

---

## 6. Regla del mínimo de 60 mediciones — **RETIRADA**

> **EJECUTADO.** El piso ya no existe en el código. No se sustituyó por umbrales
> obligatorios de grados de libertad: quedan **avisos informativos** por
> operadores, piezas, réplicas y representatividad del rango, y **ninguno
> bloquea** el cálculo ni el veredicto puntual. Lo que sigue documenta por qué
> se retiró.


**Origen: política propia de esta aplicación.** No es AIAG ni Minitab; el número
salió de la propia auditoría («digamos, 60»). **No debe presentarse como
requisito universal.**

**Medido — tres diseños de 60 mediciones no son el mismo estudio:**

| Diseño | N | gl parte | gl op | gl int | gl rep | ancho IC | concluye* |
|---|---|---|---|---|---|---|---|
| 3 op × 10 piezas × 2 rep | 60 | 9 | 2 | 18 | 30 | 8.5 pp | 43 % |
| 2 op × 15 piezas × 2 rep | 60 | 14 | **1** | 14 | 30 | **23.3 pp** | 21 % |
| 10 op × 3 piezas × 2 rep | 60 | **2** | 9 | 18 | 30 | 14.6 pp | 35 % |
| 3 op × 5 piezas × 2 rep | **30** | 4 | 2 | 8 | 15 | 12.5 pp | 27 % |
| 3 op × 10 piezas × 3 rep | 90 | 9 | 2 | 18 | 60 | 8.2 pp | 44 % |

\* sólo por el intervalo, **sin** el piso. Gage excelente (%GRR real 5.4 %).

**La regla de 60 no distingue nada de esto.** El 2×15×2 tiene 60 mediciones, un
intervalo **2.7× más ancho** que el 3×10×2, y sin embargo el piso los trata
igual — mientras bloquea un 3×5×2 de 30 mediciones que es **mejor** que el
2×15×2 (12.5 pp contra 23.3 pp). **La regla está midiendo la cosa equivocada.**

**Lo que sí discrimina es los grados de libertad**, y en particular `gl_op = o−1`:
con 2 operadores hay 1 grado de libertad para la reproducibilidad y el intervalo
se dispara.

**Propuesta (requiere aprobación, §13).** Sustituir el piso por una evaluación de
suficiencia por componente, con cuatro niveles separados que hoy están fundidos:

| Nivel | Qué hace | Criterio propuesto |
|---|---|---|
| Permitir calcular | siempre | — |
| Advertencia | aviso, veredicto intacto | por debajo de lo que sugiere AIAG (10 piezas, 3 op, 3 rep) |
| Bloquear veredicto | cálculo e intervalo visibles, sin dictamen | `gl_op < 2` **o** `gl_parte < 5` **o** `gl_rep < 15`; N total sólo como revisión adicional |
| No concluyente | ya existe (F-01) | datos degenerados |

**Nota:** la representatividad del rango de piezas —el argumento con el que
justifiqué el piso— **no es medible desde los datos**. Sigue siendo un motivo
legítimo para advertir, pero no para un umbral numérico presentado como si se
hubiera medido.

---

## 7. Dataset AIAG: trazabilidad completa

Modelo final: **`without-interaction`** (auto agrupó la interacción).

| Fuente | gl | SC | CM |
|---|---|---|---|
| Parte | 9 | 88.36193 | 9.8179927 |
| Operador | 2 | 3.16726 | 1.5836311 |
| Repetibilidad | 78 | 3.11792 | 0.0399733 |
| Total | 89 | 94.64711 | — |

Componentes: σ²_rep = 0.0399733 · σ²_repro = σ²_op = 0.0514553 ·
σ²_grr = 0.0914285 · σ²_part = 1.0864466 · σ²_total = 1.1778751.

**Semilla.** FNV-1a sobre `"df:MS.toPrecision(12)"` de cada fuente, en orden del
modelo: `"9:9.81799271605"`, `"2:1.58363111111"`, `"78:0.0399732763533"` →
**1525363893**. 4 000 sorteos, percentiles 5 y 95.

| | Punto | IC 90 % |
|---|---|---|
| %StudyVar | 27.86 | [16.95, 69.18] |
| %Contribution | 7.76 | [2.87, 47.86] |
| %Tolerance | 18.14 | [14.22, 61.75] |

Segunda ejecución: **idéntica**.

**Por qué el límite superior llega a 69.18 %** — trazabilidad numérica, no la
frase sobre los 2 grados de libertad:

| Percentil | %SV | σ²_op | σ²_rep | σ²_part |
|---|---|---|---|---|
| 5 % | 16.95 | 0.01834 | 0.03418 | 1.77532 |
| 50 % | 31.03 | 0.27825 | 0.04065 | 2.99340 |
| **95 %** | **69.18** | 0.35614 | 0.03435 | **0.42549** |
| 99 % | 91.59 | 1.75213 | 0.03806 | 0.34371 |

Dos cosas ocurren a la vez, y **ninguna sola explica el límite**:

1. `χ²_{2, 0.05} = 0.10259`, así que el pivote infla `MS_Operador` hasta
   **19.50×**: de 1.58363 a 30.87404, lo que da σ²_op = (30.87404 − 0.03997)/30
   = **1.02780**. Con σ²_part y σ²_rep en su valor puntual eso daría **70.40 %**.
2. Pero en el sorteo del percentil 95 real, σ²_op es sólo 0.35614 — y σ²_part
   **cae a 0.42549** desde su valor puntual de 1.086. El límite lo produce la
   combinación: numerador arriba **y** denominador abajo.

**Contraste con MLS sobre σ²_grr:** punto 0.091429, MLS [0.055276, 1.067859],
GPQ [0.055643, 1.093506].

**Sigue sin comparación externa el intervalo de %StudyVar**, que es el que
produce el veredicto «No concluyente».

---

## 8. Política de veredicto — **la que se describe aquí está RETIRADA**

> **EJECUTADO.** Nada de esta sección sigue vigente en el código. Hoy dictamina
> la **estimación puntual** con las bandas AIAG; el intervalo no clasifica.
> Además se corrigió la discrepancia de frontera: 1.00, 9.00, 10.00 y 30.00
> pertenecen a la banda **condicional**, escritas una sola vez en `assess` para
> que pantalla, impresión y pruebas no puedan divergir. Y se agrupó todo lo que
> se dice del R&R total en una sola sección de pantalla y de reporte, en vez de
> tarjetas contiguas que podían leerse como dictámenes independientes. Lo que
> sigue documenta el defecto que motivó el cambio.


**Regla actual:** se dictamina sólo si el intervalo **entero** cae en una banda.

| %Study Variation | Veredicto actual |
|---|---|
| entero < 10 % | Aceptable |
| cruza el 10 % | No concluyente |
| entero en [10 %, 30 %] | **Marginal** |
| cruza el 30 % | No concluyente |
| entero > 30 % | Inaceptable |

La zona 10–30 % **sí** se conserva como tercera banda; la etiqueta es
«Marginal», la misma del criterio AIAG puntual.

**%Contribution** usa la misma mecánica con umbrales 1 % y 9 % (§9).

**%Tolerance** usa los mismos umbrales que %StudyVar (10/30). El intervalo **se
calcula directamente** en cada sorteo, no por transformación del de %StudyVar.
Sin LSL/USL ni tolerancia, `tolerance = null`, la tarjeta dice «sin LSL/USL» y no
hay veredicto.

**NDC** sigue siendo **puntual**, sin intervalo. **No se combina con el veredicto
del %GRR.**

**Aquí está el defecto de política.** La aplicación **no tiene veredicto global**:
publica cinco tarjetas independientes y deja la síntesis al lector. Los casos que
la revisión enumera quedan hoy sin resolver:

| Situación | Hoy |
|---|---|
| %StudyVar aceptable pero NDC < 5 | dos tarjetas, sin relación explícita |
| %StudyVar no concluyente pero %Contribution aceptable | posible y **no explicado** |
| %Tolerance inaceptable, %StudyVar aceptable | posible y no explicado |
| %Contribution no concluyente, NDC adecuado | posible y no explicado |

**La aplicación puede mostrar dos tarjetas contiguas con dictámenes distintos sin
explicación visible.** Corregí un caso de esto en F-07 (§9) y con ello di el
problema por resuelto; **no lo estaba**. Falta distinguir explícitamente:
veredicto por métrica · veredicto global · advertencias metodológicas ·
suficiencia del diseño. **Requiere diseño y aprobación** (§13).

---

## 9. El cambio de %Contribution

**Regla anterior:** veredicto por el **punto**, umbrales 1 % / 9 %, vía
`MSAAnova.assess`.
**Regla nueva:** veredicto por el **intervalo**, mismos umbrales.
**Motivo declarado:** eliminar una contradicción visible — %StudyVar decía «No
concluyente» y %Contribution «Aceptable» sobre el mismo sistema.

**Ese motivo es insuficiente**, y lo trato como cambio metodológico:

- **Fuente de los umbrales.** 1 % y 9 % son el criterio de Minitab para
  %Contribution (excelente < 1 %, pobre > 9 %), ya presentes en `assess` antes de
  F-07. **No los introduje yo**; lo que introduje es aplicarlos al intervalo.
- **Cálculo.** Percentiles de `100·grr/total` del mismo juego de sorteos.
- **Relación con %StudyVar.** `%Contribution = (%StudyVar/100)²·100`. Son
  **monótonas**, así que sobre el mismo sorteo el orden se conserva y los
  intervalos son transformaciones exactas uno del otro. Pero **los umbrales no se
  corresponden**: 10 % de %StudyVar ↔ 1 % de contribución (coinciden), pero 30 %
  de %StudyVar ↔ **9 %** de contribución (30²/100 = 9 — también coinciden).
  Es decir: **las dos tarjetas son matemáticamente la misma información**, y sus
  veredictos deberían coincidir siempre. Que antes se contradijeran era el
  síntoma de que una usaba punto y otra intervalo.
- **Casos próximos a 1 % y a 9 %:** **no hay pruebas específicas.** Pendiente.
- **Casos donde punto e intervalo difieren:** el AIAG mismo (punto «Aceptable
  (1 a 9 %)», intervalo «No concluyente»).
- **Participación en el veredicto global:** no hay veredicto global (§8).

---

## 10. Diseño de la semilla

**Hoy la semilla es FNV-1a sobre `df:MS.toPrecision(12)` de cada fuente. Nada
más.**

**No entran:** modelo (cruzado/anidado, con/sin interacción) · número de
operadores, piezas y réplicas · nivel de confianza · número de sorteos · versión
del algoritmo.

**Consecuencia demostrada:** un cruzado agrupado y un anidado con los mismos `df`
y `CM` reciben **la misma semilla**. Los intervalos serían distintos —las
fórmulas difieren— así que **no es un error de corrección**, pero la firma **no
es canónica**: no identifica el estudio del que salió, y un cambio de versión del
algoritmo no cambiaría la semilla.

**Comprobaciones pedidas:**

| Propiedad | Resultado |
|---|---|
| Mismos datos y configuración → mismo intervalo | ✅ exacto |
| Renombrar piezas no cambia el intervalo | ✅ exacto (anidado, local vs global: bit a bit) |
| **Reordenar filas no cambia el intervalo** | ⚠️ **igual a 2.06e-16 relativo, no bit a bit** |
| Cambiar la confianza cambia el intervalo | ✅ 90 % `[16.95, 69.18]` → 95 % `[14.92, 81.72]` |
| Más sorteos → sólo precisión | ⚠️ sí, pero **≈ 1 pp** en el límite superior (§1) |
| Cruzado y anidado no comparten semilla | ❌ **pueden compartirla** |

Sobre el ⚠️ del reordenado: reordenar las filas cambia `MS_Pieza(Operador)` en el
**último bit** (`3.68091666666666839` vs `...884`) por el orden de sumación en el
ANOVA. La semilla **no** cambia (`toPrecision(12)` lo absorbe) y el %GRR puntual
**tampoco**. Es ruido de coma flotante **aguas arriba de `interval.js`**, de un
ULP. No es una inestabilidad metodológica, pero la afirmación correcta es
«invariante hasta precisión de máquina», no «idéntico».

**El reporte impreso hoy registra:** método y nivel de confianza. **No registra**
número de sorteos ni versión del algoritmo.

---

## 11. Interacción y componentes negativos

**Verificado: el intervalo usa siempre el mismo modelo que el punto.** El
selector es `MODELS[result.model]`, el mismo campo que fija el resultado puntual.

| Opción | Modelo del punto | Fuentes del intervalo | IC |
|---|---|---|---|
| auto (agrupa) | `without-interaction` | Parte, Operador, Repetibilidad | [16.95, 69.18] |
| interacción forzada | `with-interaction` | Parte, Operador, Operador×Parte, Repetibilidad | [17.93, 71.42] |
| interacción excluida | `without-interaction` | Parte, Operador, Repetibilidad | [16.95, 69.18] |

Cuando se agrupa, la fila «Repetibilidad» de la tabla ya trae el `MS` agrupado y
sus `df` agrupados, así que el intervalo lo hereda automáticamente. **No puede
ocurrir el desajuste que la revisión teme**, en ninguna de las dos direcciones.

**Componentes negativos y truncados:** el truncado ocurre por sorteo, dentro del
pivote. Tasa medida hasta 67 % (§5). No se muestra en la interfaz.

**Anidado, verificado:** usa `Operador`, `Pieza (Operador)`, `Repetibilidad`;
**no** existe `Operador × Parte`. Numeración 1..n por operador y numeración
global 1..15 dan intervalos **bit a bit idénticos**. Reordenar filas: idéntico a
2.06e-16 (§10).

---

## 12. Limitaciones conocidas

Estado actualizado tras ejecutar las decisiones aprobadas.

**Vigentes:**

1. **El intervalo de la razón no está validado contra la referencia externa
   publicada.** Es la brecha principal y la razón por la que el GPQ no
   dictamina. Ver §14.
2. **Error Monte Carlo con `DRAWS = 4000`.** Medido con 40 semillas sobre el
   dataset AIAG: la desviación estándar del límite superior es **1.39 pp**, y
   entre semillas el rango va de 67.85 a 74.38 (6.5 pp). Con 20 000 sorteos baja
   a 0.57 pp y el costo pasa de 3 ms a 19 ms. No está declarado en la interfaz.
   Desaparece cuando el intervalo pase a MLS, que es determinista y no simula.
3. **El motor anidado sub-cubre.** Medido con 2 000 estudios por caso: anidado
   5×3×2 da 86.05 % y 87.85 % con dos semillas distintas (−5.1 y −2.9 errores
   estándar del nominal 90 %), y anidado 10×3×2 da 87.00 % (−4.0 EE), todos con
   61 % de truncado; el cruzado 5×3×2 equivalente da 91.90 %. **No es ruido de
   muestreo**, y la dirección es la insegura: el intervalo es más estrecho de lo
   que declara.
   > **Actualización (documento técnico de referencia, §D/F).** Esto puede **no
   > ser un defecto de esta implementación**: Chiang (2001, *Technometrics*
   > 43(3):356-367) demostró que tanto MLS como Satterthwaite para razones
   > "can fail by a large margin to maintain the nominal confidence level"
   > cuando el componente del numerador (reproducibilidad) es pequeño y de
   > pocos grados de libertad — exactamente el régimen de un anidado con pocos
   > operadores. Antes de tratarlo como bug, el documento pide descartar dos
   > causas de implementación propias del GPQ actual: convención de cola
   > invertida en el muestreo χ² (no aplica aquí, es simulación, no G_q/H_q) y
   > el truncamiento asimétrico en [0,1]. **Sigue pendiente de diagnóstico**,
   > pero ahora con una hipótesis nula clara: si al migrar a MLS la cobertura
   > sube a ≥89–90 %, era la implementación; si persiste en 86–88 % sólo con
   > numerador chico y pocos g.l., es la limitación conocida del método y se
   > documenta, no se corrige.
4. **`V_grr ≈ 0` no está probado ni acotado.**
5. **Tasas de truncado de hasta 67 % no se muestran** al usuario.
6. **La semilla no es canónica** (§10). Decisión no aprobada en este alcance.
7. **La cobertura se midió con datos generados por el mismo modelo que el método
   asume** (normales, balanceados, independientes). No dice nada sobre robustez
   a la no-normalidad.
8. **%Tolerance no tiene intervalo.** Su denominador es la tolerancia de
   especificación, no `V_Total`, así que no se deriva de la razón. Se conserva el
   punto y se declara «pendiente de referencia validada».

**Resueltas por las decisiones aprobadas:**

- ~~La política de veredicto no resuelve el desacuerdo entre métricas~~ →
  %Contribution y %StudyVar salen del **mismo** intervalo de la razón, así que no
  pueden discrepar; y el dictamen es uno solo, el puntual.
- ~~El piso de 60 mediciones mide la cosa equivocada~~ → retirado.
- ~~Sin pruebas cerca de los umbrales de %Contribution~~ → hay pruebas en 0.99,
  1.00, 9.00 y 9.01, y en 9.99, 10.00, 30.00 y 30.01 para %StudyVar y %Tolerance.
- ~~Anidado 5×3×2: cobertura 87.3 %, merece más simulaciones~~ → se midió, y
  resultó ser un problema real: ahora es la limitación 3.

---

## 13. Decisiones aprobadas, y qué se hizo con cada una

Aprobadas por el responsable del producto. Estado de cada una:

| # | Decisión | Estado |
|---|---|---|
| 1 | Retirar la atribución a Minitab del GPQ y del 90 % | ✅ **Hecho** — `interval.js`, `auditoria-2026-08-31.md`, `README.md`, este documento |
| 2 | Marcar el intervalo como experimental / en validación | ✅ **Hecho** — pantalla y reporte impreso |
| 3 | Nivel de confianza seleccionable, 95 % por omisión | ✅ **Hecho** — 90 / 95 / 99, en la huella, recalcula, se imprime |
| 4 | Retirar el piso de 60 mediciones | ✅ **Hecho** — sin sustituto obligatorio; sólo avisos informativos |
| 5 | Retirar la clasificación por intervalo | ✅ **Hecho** — el intervalo sólo advierte cruces |
| 6 | %Contribution y %StudyVar del mismo intervalo | ✅ **Hecho** — las dos derivan de la razón, no se simulan por separado |
| 7 | Fronteras de banda coherentes en toda la aplicación | ✅ **Hecho** — 1.00, 9.00, 10.00 y 30.00 son **condicional**; escritas una sola vez en `assess` |
| 8 | Intervalo oficial por MLS + Satterthwaite sobre la razón | ⛔ **No hecho — parcialmente desbloqueado**, ver §14 |
| 9 | Intervalo de %Tolerance | ⏸ **Pendiente de referencia validada** — se conserva el punto y se dice explícitamente |
| 10 | Semilla canónica con versión de algoritmo | ⏸ **Pendiente** — no aprobado en este alcance |

**Lo que hoy dictamina: la estimación puntual con las bandas AIAG.** El
intervalo GPQ acompaña, se rotula «experimental, en validación, no utilizado
para el dictamen», y cuando cruza un límite emite una única advertencia de
lectura. No emite categorías, no produce «no concluyente» y no bloquea nada.

---

## 14. Por qué el §8 no se implementó — actualizado con el documento técnico

**El bloqueo de red seguía vigente cuando se escribió la primera versión de esta
sección:** el contenedor tiene el egreso restringido y `support.minitab.com`
respondía `403` al `CONNECT` del proxy. No se resolvió leyendo la fuente desde
aquí — se resolvió **por otra vía**: el responsable del producto adjuntó
[`docs/mls-fuente-minitab.md`](mls-fuente-minitab.md),
que investiga las fórmulas contra las fuentes primarias (Burdick & Graybill
1984, 1992; Burdick, Borror & Montgomery 2003/2005; Gui, Graybill, Burdick &
Ting 1995; Chiang 2001/2002) y **declara explícitamente, fórmula por fórmula,
qué está confirmado verbatim, qué es una reconstrucción razonada y qué sigue sin
verificar.** Esa disciplina es la que le da valor: es la misma que exige el
hallazgo de F-07.

### Lo que el documento desbloquea (Etapa 1 — se puede implementar ya)

Confirmado **verbatim** contra Minitab o contra un paper con ecuación citable:

1. **Repetibilidad: intervalo EXACTO χ², nunca MLS.** `L = n₄S₄²/χ²_{1−α/2:n₄}`,
   `U = n₄S₄²/χ²_{α/2:n₄}`. Determinista, sin sorteos, verificable dígito a
   dígito contra Minitab con cualquier dataset — candidato natural a primer test
   de regresión del módulo nuevo.
2. **G_q, H_q** (Burdick & Graybill 1984, Technometrics 26(2), ec. 2.3), con una
   regla de validación de rango explícita en el propio documento: `G_q ∈ (0,1)`,
   `H_q ≥ 0`; si no se cumple, la cola de la χ²/F está invertida. Esa aserción
   debe ir en el código, no sólo en un comentario.
3. **Estimadores puntuales por componente**, cruzado y anidado — coinciden con
   los que ya usan `anova.js` y `anova-nested.js`, así que no cambian.
4. **MLS para combinaciones lineales POSITIVAS** (Gage total, Total): forma
   Graybill-Wang, marcada por el documento como «reconstruida, no verbatim» —
   se implementa y se **valida numéricamente** contra Minitab en 3–4 datasets,
   nunca se cita como transcripción literal.
5. **Truncamiento**: `[0, ∞)` en componentes, `[0, 1]` en razones, aplicado
   **antes** de la raíz cuadrada — confirmado verbatim, ya es lo que hace
   `interval.js` sobre el GPQ.
6. **Límites unilaterales**: sustituir `α/2` por `α` en G y H — confirmado
   verbatim, aplica igual al exacto, a MLS y a Satterthwaite.
7. **`gage/total = 1 − parte/total`**, con el intercambio L↔U que produce el
   `1 − x` — confirmado verbatim, y es la misma arquitectura que ya tiene
   `interval.js` (`ratio` como origen único de las dos escalas).

### Lo que SIGUE bloqueado (Etapa 2 — el núcleo de F-07)

> **CORRECCIÓN, 31 de agosto de 2026.** El documento técnico afirmaba que las
> fórmulas de `A`, `B`, `C` "viven en imágenes PNG" en las páginas de Minitab.
> **Es incorrecto, o al menos incompleto.** El responsable del producto abrió
> la página `.../gage-study/crossed-gage-r-r-study/methods-and-formulas/
> variance-ratios-in-confidence-intervals/` en su propio navegador, con sesión
> iniciada, y las fórmulas se renderizan como **texto matemático real**
> (tipografía vectorial con fracciones, exponentes y subíndices — no una
> captura de pantalla). Confirmado visualmente para la razón parte/total, caso
> "con operador y término de interacción":
>
> ```
> Limite inferior = (−B − sqrt(B² − 4AC)) / 2A
> A = a²(1−G1²)S1⁴ + b²(1−H2²)S2⁴ + c²(1−H3²)S3⁴ + d²(1−H4²)S4⁴
>     + ab(2+G12)S1²S2² + ac(2+G13)S1²S3² + ad(2+G14)S1²S4² + ...   [CORTADO]
> B = −2a(1−G1²)S1⁴ + 2c(1−H3²)S3⁴ − b(2+G12)S1²S2² + a(2+G13)S1²S3²
>     − c(2+G13)S1²S3² − d(2+G14)S1²S4² + 2b...                    [CORTADO]
> C = (1−G1²)S1⁴ + (1−H3²)S3⁴ − (2+G13)S1²S3²
> Limite superior = (−B + sqrt(B² − 4AC)) / 2A   (con G y H intercambiados)
> Si B² − 4AC < 0: no hay solucion, Minitab usa el segundo metodo (Satterthwaite).
> ```
>
> Esto **coincide exactamente** con la estructura que el documento técnico ya
> había confirmado por otra vía (cuadrática, `L`/`U` como raíces, caída a
> Satterthwaite), y de paso trae los términos cruzados `G₁₂`, `G₁₃`, `H₁₂`,
> `H₁₃`... que eran la parte peor verificada del documento (requería Burdick &
> Graybill 1992). Buena corroboración cruzada entre dos fuentes independientes.
>
> **No es transcribible todavía.** La captura está cortada por scroll
> horizontal — los términos `+ ad(2+G...` y `+ 2b...` se pierden a la mitad, y
> falta la fórmula completa de `B` y de `A` en el límite superior. Un `A`, `B`
> o `C` con un término faltante da un intervalo silenciosamente incorrecto, así
> que no se transcribe nada parcial. **Además esta captura es sólo el caso
> "con operador y con interacción"**; hacen falta también "sin interacción" y
> el caso anidado, que Minitab documenta en páginas separadas.
>
> **Acordado con el responsable del producto: sube el texto completo de las
> tres variantes en la próxima sesión** (las páginas de Minitab: *Variance
> ratios in confidence intervals* — cruzado con/sin interacción — y su
> equivalente para *Nested Gage R&R Study*). Con eso, la Etapa 2 deja de estar
> bloqueada por fuente de pago: **el bloqueo real era el egreso de red de este
> contenedor, no la ausencia de la fórmula en la web pública.**

**Los coeficientes `A`, `B`, `C` de la ecuación cuadrática de la razón —el
cálculo que de verdad reemplaza al GPQ— siguen sin estar transcritos en este
repositorio**, aunque ahora se sabe que están disponibles en texto en la
página pública de Minitab (no sólo en fuentes de pago). Ruta alternativa, si
la próxima sesión prefiere no depender de la captura: Burdick, Borror &
Montgomery (2005, ASA-SIAM, cap. 3-4), Gui, Graybill, Burdick & Ting (1995,
*JSPI* 48:215-227) y Burdick & Graybill (1992, Marcel Dekker) para los
términos cruzados `G_qq′`, `H_qq′` que hacen falta en las diferencias de
cuadrados medios (σ²_P, σ²_O, σ²_PO).

**La recomendación del propio documento es no reconstruirlos:** "no publique A,
B, C reconstruidos […] esto es precisamente el tipo de atribución que el
hallazgo de auditoría exige." Implementar una cuadrática inventada y rotularla
como «el método de Minitab» repetiría el error exacto que F-07 existe para
corregir — sólo que en la fórmula en vez de en el nombre.

### Plan de dos etapas para cerrar F-07

**Etapa 1 (aprobable ya, sin fuente adicional):** implementar repetibilidad
exacta + G_q/H_q + MLS reconstruido y validado numéricamente para Gage total y
Total, en un módulo nuevo que no reutiliza funciones del GPQ. Esto **no**
resuelve el núcleo de F-07 —la razón sigue sin intervalo correcto— pero es
determinista, sin `DRAWS` ni semillas, y deja el terreno preparado.

**Etapa 2 (bloqueada, requiere una de estas dos cosas):**

1. Transcribir `A`, `B`, `C` y `G_qq′`/`H_qq′` verbatim de BBM 2005 cap. 3-4 o
   de Gui et al. 1995, citados con número de ecuación — requiere acceso
   institucional a esas fuentes de pago, que no está disponible en este entorno.
2. Alternativamente, si se decide no perseguir el acceso: **documentar** el
   intervalo de la razón como «no implementado por falta de fuente primaria
   verificable» de forma permanente, y mantener el GPQ como el único intervalo
   disponible, rotulado experimental — que es exactamente el estado actual.

**No hay ruta de "reconstruir y validar numéricamente" para la Etapa 2** como
sí la hay para el Gage total en la Etapa 1: sin `A`, `B`, `C` publicados contra
los que comparar, "validar numéricamente" no tiene con qué contrastarse — sería
validar la reconstrucción contra sí misma.

**Hallazgo adicional del documento, relevante para §12.** La sub-cobertura del
anidado (86–88 % contra 90 % nominal) puede no ser un defecto: Chiang
(2001/2002) documenta que MLS y Satterthwaite para razones sub-cubren quando el
componente del numerador es pequeño y de pocos grados de libertad —el régimen
exacto de un anidado con pocos operadores. Ver la nota añadida en la limitación
3 del §12.

Con eso, la implementación de la Etapa 1 es directa: el módulo nuevo va aparte,
es determinista, sin sorteos ni semillas, y sustituye al GPQ como origen de los
componentes con intervalo (no de la razón). La estructura ya está preparada:
`interval.js` publica hoy `ratio: {lo, hi}` y deriva de ahí las dos escalas de
la razón; la Etapa 1 no toca esa razón, así que cambiarla en la Etapa 2 no
tocará la presentación.
