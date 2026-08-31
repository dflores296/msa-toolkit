# F-07 — Validación del intervalo de confianza del %GRR

**Estado: `C` — método válido, pero la política de veredicto debe modificarse.**
Ver §13. **F-07 no se cierra con este documento.**

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

## 3. El nivel de confianza del 90 %

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

**Lo que estas dos referencias NO cubren:** el intervalo de **%Study Variation**,
que es una **razón**, y es el que dictamina. §4.1 valida un componente; §4.2
valida σ²_grr. **La razón no está validada contra ninguna referencia externa.**
Esa es la brecha principal de este informe.

---

## 5. Cobertura por escenario

400 estudios por escenario, 1 200 sorteos GPQ cada uno, confianza nominal 90 %,
semilla base 20260907. `EE` = error estándar binomial de la cobertura.

| Escenario | %GRR real | Cobertura | EE | nulos | trunc. | ACEP | INAC | NOCONC | acept. mala | rech. malo |
|---|---|---|---|---|---|---|---|---|---|---|
| cruzado excelente (lejos de 10) | 5.4 | 91.3 | ±1.4 | 0 | 19 % | 176 | 0 | 224 | 0 | 0 |
| cruzado **justo en 10 %** | 10.0 | 90.3 | ±1.5 | 0 | 11 % | 7 | 0 | 392 | 0 | 0 |
| cruzado medio (20 %) | 19.9 | 90.5 | ±1.5 | 0 | 17 % | 0 | 1 | 348 | 0 | 0 |
| cruzado **justo en 30 %** | 29.8 | 91.3 | ±1.4 | 0 | 16 % | 0 | 29 | 368 | 0 | 0 |
| cruzado malo (55 %) | 54.6 | 90.5 | ±1.5 | 0 | 10 % | 0 | 327 | 73 | 0 | 0 |
| cruzado **con interacción** | 29.5 | 91.8 | ±1.4 | 0 | 25 % | 0 | 28 | 369 | 0 | 0 |
| cruzado **σ_op = 0 exacto** | 19.6 | 90.8 | ±1.4 | 0 | **67 %** | 0 | 1 | 262 | 0 | 0 |
| cruzado σ_op ≈ 0 | 19.6 | **93.8** | ±1.2 | 0 | **64 %** | 0 | 0 | 298 | 0 | 0 |
| cruzado chico 5×3×2 | 14.7 | 91.0 | ±1.4 | 0 | 39 % | 0 | 0 | **400** | 0 | 0 |
| cruzado 2 operadores | 28.5 | **94.0** | ±1.2 | 0 | 37 % | 0 | 13 | 385 | 0 | 0 |
| cruzado 5 operadores | 28.5 | 90.5 | ±1.5 | 0 | 6 % | 0 | 22 | 367 | 0 | 0 |
| cruzado grande 25×4×4 | 28.5 | 90.3 | ±1.5 | 0 | 3 % | 0 | 16 | 361 | 0 | 0 |
| **anidado** 10×3×3 | 28.5 | 89.5 | ±1.5 | 0 | 60 % | 0 | 30 | 365 | 0 | 0 |
| **anidado** 5×3×2 | 14.7 | **87.3** | ±1.7 | 0 | 58 % | 0 | 0 | **400** | 0 | 0 |
| **anidado** malo | 54.6 | 90.0 | ±1.5 | 0 | 40 % | 0 | 388 | 12 | 0 | 0 |

ACEP+INAC+NOCONC no suma 400: falta la banda marginal (10–30 %).
Procedimiento: normales independientes, σ_pieza = 1, σ_op y σ_rep fijados para
el %GRR objetivo; interacción sólo en el escenario marcado; anidados generados
con piezas propias por operador.

**Lecturas:**

- Cobertura entre **87.3 % y 94.0 %** contra un nominal de 90 %. Nada se desploma.
- **Anidado 5×3×2: 87.3 % ± 1.7**, 1.6 EE por debajo del nominal. Es el escenario
  más débil y merece más simulaciones antes de darlo por bueno.
- **Conservador donde hay poca información:** 2 operadores (94.0 %) y σ_op ≈ 0
  (93.8 %). Coherente con el truncado.
- **Tasa de truncado hasta 67 %.** En dos de cada tres estudios de esos
  escenarios al menos un componente se truncó a cero. No aparece en la interfaz.
- **Aceptación incorrecta y rechazo incorrecto: 0 en 6 000 estudios.** Es el
  resultado de seguridad más fuerte del informe.
- **Precio:** el 5×3×2 y el anidado 5×3×2 son **100 % no concluyentes**, y hasta
  el gage claramente malo concluye sólo el 82 %.

---

## 6. Regla del mínimo de 60 mediciones

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

## 8. Política de veredicto — documentada y, en un punto, incorrecta

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

1. **El intervalo de %StudyVar —el que dictamina— no está validado contra
   ninguna referencia externa.** Lo validado es un componente aislado (exacto) y
   σ²_grr (MLS). La razón, no.
2. **Error Monte Carlo de ≈ 1 punto porcentual** en el límite superior con
   `DRAWS = 4000`, no declarado y sin criterio de convergencia.
3. **La política de veredicto no resuelve el desacuerdo entre métricas** ni
   define un veredicto global (§8).
4. **El piso de 60 mediciones mide la cosa equivocada** (§6).
5. **`V_grr ≈ 0` no está probado ni acotado.**
6. **Tasas de truncado de hasta 67 % no se muestran** al usuario.
7. **La semilla no es canónica** (§10).
8. **Sin pruebas cerca de los umbrales de %Contribution** (1 % y 9 %).
9. **Anidado 5×3×2: cobertura 87.3 %**, el escenario más débil.
10. **La cobertura se midió con datos generados por el mismo modelo que el método
    asume** (normales, balanceados, independientes). No dice nada sobre
    robustez a la no-normalidad.

---

## 13. Decisiones que requieren aprobación antes de tocar código

| # | Decisión | Mi recomendación |
|---|---|---|
| 1 | Retirar la afirmación sobre Minitab de `interval.js`, reporte y auditoría | **Hacerlo ya.** Es una corrección de veracidad, no una decisión. |
| 2 | Marcar el intervalo como **«En validación»** en pantalla y reporte | **Hacerlo ya**, junto con 1. |
| 3 | Nivel de confianza: ¿selector 90/95/99? ¿predeterminado? | Selector, con **95 %** predeterminado. |
| 4 | Sustituir el piso de 60 por criterios de grados de libertad | Sí, con la tabla de §6. |
| 5 | Veredicto global y jerarquía entre métricas | Diseñar antes de tocar nada. |
| 6 | ¿Debe %Contribution tener tarjeta propia, siendo la misma información que %StudyVar? | Merece discusión: hoy duplica. |
| 7 | Semilla canónica con versión de algoritmo | Sí. |
| 8 | Declarar sorteos y error Monte Carlo en el reporte | Sí. |
| 9 | Mostrar la tasa de truncado | Sí, como advertencia metodológica. |
| 10 | ¿Se acepta un método sin validación externa de la razón para **dictaminar**? | **No.** Mientras tanto, el intervalo se publica como información y **el veredicto vuelve al criterio puntual AIAG**, con el intervalo al lado. |

**Clasificación final: `C` — el método es válido y la implementación concuerda
con dos referencias independientes, pero la política de veredicto debe
modificarse antes de usarse para liberar o rechazar instrumentos.**

Si se exige validación externa del intervalo de la **razón** antes de cualquier
uso decisorio, la clasificación es **`B`**.
