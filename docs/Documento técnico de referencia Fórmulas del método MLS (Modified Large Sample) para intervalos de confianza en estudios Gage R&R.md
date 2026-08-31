# Documento técnico de referencia: Fórmulas del método MLS (Modified Large Sample) para intervalos de confianza en estudios Gage R&R

*Preparado como referencia de implementación para el repositorio `msa-toolkit`. Fecha: 31 de agosto de 2026. Este documento distingue explícitamente entre (1) fórmulas confirmadas textualmente en fuente citable accesible, (2) fórmulas reconstruidas por deducción desde la estructura del método, y (3) fórmulas no encontradas en fuente de acceso libre.*

## TL;DR

- **El método MLS que implementa Minitab proviene de Burdick & Graybill (1992) y de Burdick, Borror & Montgomery (2003, 2005).** Su estructura completa está confirmada — componentes de varianza mediante combinación lineal de cuadrados medios; razones mediante ecuación cuadrática `A·x² + B·x + C = 0` con caída al método de Satterthwaite cuando `B²−4AC < 0` — **pero los coeficientes A, B, C explícitos NO están disponibles en ninguna fuente de acceso libre**: viven en las imágenes PNG de Minitab y en texto solo en el libro SIAM 2005 (cap. 3-4) y en Gui, Graybill, Burdick & Ting (1995). Recomendación central para cerrar F-07: **transcribir A, B, C de esas fuentes primarias; no reconstruirlos ni aproximarlos.**
- **Sí están confirmadas verbatim:** la definición de G_q/H_q (Burdick & Graybill 1984, Technometrics 26(2), ec. 2.3), los grados de libertad, el intervalo EXACTO chi-cuadrada para repetibilidad, la regla `gage/total = 1 − parte/total`, la caída a Satterthwaite, el truncamiento a [0,∞) para componentes y [0,1] para razones, y la regla unilateral (reemplazar α/2 por α en H y G).
- **La sub-cobertura de 86-88% de su motor anidado es coherente con la literatura publicada, no necesariamente un bug.** Chiang (2001, Technometrics 43(3):356-367) demostró que tanto MLS como Satterthwaite para razones "can fail by a large margin to maintain the nominal confidence level when used to estimate small values of δ" (es decir, cuando el componente del numerador — reproducibilidad/operador — es pequeño). Este es precisamente el régimen de un estudio anidado con pocos operadores.

## Key Findings

### Estado de verificación por bloque

| Bloque | Estado | Fuente |
|---|---|---|
| Grados de libertad, notación S₁²–S₄² | (1) Confirmado | Minitab methods-and-formulas |
| Estimadores puntuales de componentes | (1) Confirmado | IRJES 2017, ecs. 8-9 (reproduce BBM) |
| Definición G_q, H_q | (1) Confirmado | Burdick & Graybill 1984, ec. 2.3 |
| Repetibilidad = intervalo exacto χ² | (1) Confirmado | Minitab |
| Componentes por combinación lineal MLS | (2) Reconstruido | Graybill-Wang 1980 / Ting et al. |
| Términos cruzados G_qq′, H_qq′ | (3) No verificado verbatim | Solo Burdick & Graybill 1992 (de pago) |
| Razón: estructura cuadrática + L=J·raíz | (1) Confirmado | Minitab (página en-us leída completa) |
| Coeficientes A, B, C explícitos | (3) NO ENCONTRADO | Solo BBM 2005 SIAM / Gui et al. 1995 (de pago) |
| gage/total = 1 − parte/total | (1) Confirmado verbatim | Minitab |
| Caída a Satterthwaite si B²−4AC<0 | (1) Confirmado verbatim | Minitab |
| Truncamiento [0,∞) y [0,1] | (1) Confirmado verbatim | Minitab |
| Regla unilateral α/2 → α | (1) Confirmado verbatim | Minitab |

## Details

### A) Notación y grados de libertad (caso cruzado balanceado)

Modelo de efectos aleatorios cruzado con interacción:

```
Y_ijk = μ + P_i + O_j + (PO)_ij + ε_ijk
i = 1..I (partes), j = 1..J (operadores), k = 1..K (réplicas)
P_i ~ N(0, σ²_P), O_j ~ N(0, σ²_O), (PO)_ij ~ N(0, σ²_PO), ε_ijk ~ N(0, σ²_E), independientes
```

**Grados de libertad (confirmado, Minitab):**

```
n1 = I − 1            (partes)
n2 = J − 1            (operadores)
n3 = (I − 1)(J − 1)   (interacción parte×operador)
n4 = I·J·(K − 1)      (réplicas / error)
```

**Cuadrados medios:** `S1² = MS_Parte`, `S2² = MS_Operador`, `S3² = MS_Parte×Operador`, `S4² = MS_Error`.

**Esperanzas de los cuadrados medios** (confirmado — Dianda, Pagura & Ballarini, *On Confidence Intervals Construction for Measurement System Capability Indicators*, IRJES 6(1), 2017, ec. 8, que reproduce a Burdick–Borror–Montgomery):

```
E(S1²) = θ_P  = σ²_E + K·σ²_PO + J·K·σ²_P
E(S2²) = θ_O  = σ²_E + K·σ²_PO + I·K·σ²_O
E(S3²) = θ_PO = σ²_E + K·σ²_PO
E(S4²) = θ_E  = σ²_E
```

**Estimadores puntuales** (confirmado, IRJES 2017, ec. 9):

```
σ̂²_E  = S4²
σ̂²_PO = (S3² − S4²) / K
σ̂²_O  = (S2² − S3²) / (I·K)
σ̂²_P  = (S1² − S3²) / (J·K)
```

Nota de implementación: el divisor `J·K` en `σ̂²_P` es la razón por la que Minitab escala el límite de la razón como `L = J × (raíz menor)`: la cuadrática se plantea sobre una variable reescalada y J reintroduce el factor de escala.

**Componentes de interés:**

```
Repetibilidad     = σ²_E
Reproducibilidad  = σ²_O + σ²_PO        (con interacción)
                  = σ²_O               (sin interacción)
Gage total (R&R)  = σ²_E + σ²_O + σ²_PO
Parte a parte     = σ²_P
Total             = σ²_P + σ²_O + σ²_PO + σ²_E
```

### Constantes auxiliares MLS: G_q y H_q (CONFIRMADO verbatim)

La fuente primaria es **Richard K. Burdick & Franklin A. Graybill (1984), "Confidence Intervals on Linear Combinations of Variance Components in the Unbalanced One-Way Classification," *Technometrics* 26(2):131-136, ecuación 2.3.** El texto verbatim del PDF (usa notación **L/H**, no G/H) es:

```
L₁ = 1 − (I−1)/χ²_{I−1; α11}
L₂ = 1 − (N−I)/χ²_{N−I; α21}
H₁ = (I−1)/χ²_{I−1; α12} − 1
H₂ = (N−I)/χ²_{N−I; α22} − 1
```

con la convención `α11 > α12`, `α21 > α22` y `α11 − α12 = α21 − α22 = 1 − α`. **Esto confirma que la convención es de percentil SUPERIOR de la χ².**

Forma general para el término q-ésimo, en la notación F que usa Minitab ("el percentil α·100 de la distribución F"):

```
G_q = 1 − 1/F_{α : n_q, ∞}
H_q = 1/F_{1−α : n_q, ∞} − 1
```

Equivalencia χ² (usando `n_q · F_{p:n_q,∞} = χ²_{p:n_q}`):

```
G_q = 1 − n_q / χ²(cola superior, n_q)
H_q = n_q / χ²(cola inferior, n_q) − 1
```

**⚠️ CONVENCIÓN DE PERCENTIL — punto crítico para su reimplementación.** Burdick & Graybill usan percentil superior; Minitab dice "percentil α·100". Como estas dos notaciones se escriben con subíndices de cola opuestos, la regla de validación robusta en código, independiente de la convención, es:

> **G_q debe quedar en el rango (0, 1) y H_q debe quedar ≥ 0.** Si su implementación produce G_q negativo o mayor que 1, o H_q negativo, la cola de la χ²/F está invertida. Esta es la causa candidata #1 de límites mal calibrados.

### Términos cruzados G_qq′, H_qq′ (RECONSTRUIDO — NO verificado verbatim)

Para combinaciones que involucran **diferencias** de cuadrados medios (necesarias para σ²_P, σ²_O, σ²_PO), la varianza bajo la raíz incorpora términos cruzados de la familia Burdick–Graybill. La forma canónica es:

```
G_qq′ = [ (F_{α:n_q,n_q′} − 1)²  − G_q²·F_{α:n_q,n_q′}²  − H_q′² ] / F_{α:n_q,n_q′}
H_qq′ = [ (1 − F_{1−α:n_q,n_q′})² − H_q²·F_{1−α:n_q,n_q′}² − G_q′² ] / F_{1−α:n_q,n_q′}
```

**ESTADO (3): esta forma es la estándar de la familia, pero NO pudo verificarse verbatim contra ninguna fuente de texto de acceso libre.** La fuente definitiva es **Burdick, R.K. & Graybill, F.A. (1992), *Confidence Intervals on Variance Components*, Marcel Dekker, Nueva York** (la referencia que Minitab y BBM citan explícitamente). No publique estos términos como confirmados sin cotejarlos con ese libro.

### B) Intervalos para componentes de varianza (caso cruzado)

**Repetibilidad — intervalo EXACTO chi-cuadrada (CONFIRMADO, Minitab):** No usa MLS. Como `n4·S4²/σ²_E ~ χ²_{n4}`:

```
L = n4·S4² / χ²_{1−α/2 : n4}
U = n4·S4² / χ²_{α/2 : n4}
```

**Combinaciones lineales POSITIVAS de cuadrados medios (MLS, forma Graybill-Wang — RECONSTRUIDO):** para `θ = Σ_q c_q·S_q²` con todos los `c_q > 0` (caso del Gage total y del Total):

```
θ̂ = Σ_q c_q·S_q²
L  = θ̂ − sqrt( Σ_q G_q²·c_q²·S_q⁴ )
U  = θ̂ + sqrt( Σ_q H_q²·c_q²·S_q⁴ )
```

**Combinaciones con DIFERENCIAS (σ²_P, σ²_O, σ²_PO — MLS con términos cruzados, RECONSTRUIDO):** para `θ = c_q·S_q² − c_q′·S_q′²`, la expresión bajo la raíz incluye además los términos G_qq′ y H_qq′ definidos arriba. La forma algebraica exacta (con los signos y agrupaciones correctos) debe transcribirse de Burdick & Graybill (1992).

**Tres configuraciones (confirmado que existen en Minitab):** (i) con operador y con interacción; (ii) con operador, sin interacción; (iii) sin operador. Confirmación específica sobre qué es exacto vs. MLS:
- **Repetibilidad: siempre EXACTO (chi-cuadrada), nunca MLS.** (Minitab: "Minitab calculates the lower and upper bounds for an exact (1 − α)·100% confidence interval.")
- **Reproducibilidad/Operador, Interacción, Gage total, Parte-a-parte, Total: MLS** ("Minitab uses the modified large-sample (MLS) method... for an approximate (1 − α)·100% confidence interval").
- El Gage total **sin término de interacción** usa MLS (confirmado verbatim). No se localizó afirmación de que ninguna configuración del Gage total sea exacta salvo el caso trivial en que Gage = Repetibilidad (sin operador y sin interacción), donde hereda el intervalo exacto χ² de la repetibilidad.

### C) Intervalos para razones de varianza (el núcleo de F-07)

**Estructura confirmada verbatim** (página en-us de Minitab "Methods and formulas for variance ratios in confidence intervals in Crossed Gage R&R Study", leída completa):

1. "The lower and upper bounds for an approximate (1 − α)·100% confidence interval are calculated by **solving quadratic equations**."
2. "**Lower bound, L, equals J times the smaller solution** to the following equation" `AL² + BL + C = 0`; "**Upper bound, U, equals J times the larger solution**" `AU² + BU + C = 0`.
3. "**If B² − 4AC < 0, there is no solution to the quadratic equation.** In this case, Minitab uses the second method [Satterthwaite] to estimate the confidence intervals."
4. Para la razón repetibilidad/total existen además "**two conditions for the existence of the lower and the upper bounds using the MLS method**"; si no se cumplen, cae a Satterthwaite.

**Razón gage/total → %GRR (CONFIRMADO verbatim):** Minitab la deriva de la razón parte/total:

```
LB( σ²_gage/σ²_total ) = 1 − UB( σ²_parte/σ²_total )
UB( σ²_gage/σ²_total ) = 1 − LB( σ²_parte/σ²_total )
```

Note que el mapeo `1 − x` **intercambia** los papeles de L y U (porque gage = total − parte). Finalmente:

```
%GRR = 100 × sqrt( razón gage/total )
```

El truncamiento a [0,1] de la razón se aplica **antes** de sacar la raíz cuadrada. Esta cadena — la razón publica `{lo, hi}` y las escalas se derivan de ahí — coincide exactamente con la arquitectura de su `interval.js`.

Las otras razones que necesita (gage/parte, parte/total, repetibilidad/total, reproducibilidad/total, operador/total, interacción/total) siguen todas la misma plantilla cuadrática con caída a Satterthwaite. La razón parte/total sin operador se define como `1 − (razón repetibilidad/total)`.

**⚠️ Coeficientes A, B, C explícitos: NO ENCONTRADOS en fuente de acceso libre (estado 3).** En las páginas de Minitab son imágenes PNG (`Part_Total_variance_CI_..._methodformula_N.png`, etc.), no texto ni MathML. No se localizaron en ninguna tesis, apunte, apéndice SAS/Excel, ni en el código abierto de los paquetes R `SixSigma` (`ss.rr` calcula componentes pero **no** implementa estos intervalos de razón) ni en la documentación de `gagerr` de MATLAB. Las únicas fuentes que los contienen en texto son, todas de pago:
- **Burdick, Borror & Montgomery (2005), *Design and Analysis of Gauge R&R Studies*, ASA-SIAM Series No. 17, cap. 3-4 ("Two-Factor Crossed Random Model"), DOI 10.1137/1.9780898718379.**
- **Gui, R., Graybill, F.A., Burdick, R.K. & Ting, N. (1995), "Confidence intervals on ratios of linear combinations for non-disjoint sets of expected mean squares," *Journal of Statistical Planning and Inference* 48:215-227, DOI 10.1016/0378-3758(94)00152-L** — el paper que deriva la cuadrática general de razones que BBM aplican.
- **Cappelleri & Ting (2003), *Statistics in Medicine* 22:1861-1877, Apéndice A** — adaptación de Gui et al.; un artículo de 2025 en *Statistics in Medicine* (DOI 10.1002/sim.70106) declina reimprimir estas expresiones por ser "quite elaborate", confirmando que no son triviales.

**Recomendación honesta para F-07: no publique A, B, C reconstruidos.** Transcríbalos verbatim de BBM 2005 (cap. 3) o Gui et al. 1995 y cítelos con número de ecuación/página. Esto es precisamente el tipo de atribución que el hallazgo de auditoría exige.

### D) Caso anidado (nested)

Modelo con partes anidadas dentro de operadores: solo hay operador (σ²_O), parte(operador) (σ²_P(O)) y repetibilidad (σ²_E). Estimadores confirmados (IRJES 2017, caso destructivo anidado con p partes, o operadores, r réplicas):

```
σ̂²_E    = MS_E
σ̂²_P(O) = (MS_P(O) − MS_E) / r
σ̂²_O    = (MS_O − MS_P(O)) / (p·r)
```

Grados de libertad del modelo anidado: operador `o−1`, parte(operador) `o(p−1)`, error `po(r−1)`. La mecánica MLS es idéntica a la cruzada: repetibilidad exacta (χ²); operador, parte(operador), gage y total por combinación lineal MLS; razones por cuadrática con caída a Satterthwaite. La regla `gage/total = 1 − parte/total` también está confirmada verbatim para el caso anidado en Minitab.

**Diagnóstico de la sub-cobertura 86-88% frente al 90% nominal.** Esto es esperable y está documentado, no es forzosamente un defecto de su motor:
- **Chiang (2001), *Technometrics* 43(3):356-367**, y su continuación (**Chiang 2002, *Communications in Statistics — Simulation and Computation* 31**): tanto MLS como Satterthwaite para la razón "can fail by a large margin to maintain the nominal confidence level when used to estimate small values of δ". En un anidado con pocos operadores (p. ej. J=3 → 2 g.l. para operador), el componente del numerador (reproducibilidad) es pequeño y de pocos grados de libertad, exactamente el régimen donde la cobertura real cae por debajo del nominal.
- Antes de concluir que hay un bug, verifique que (a) la caída a Satterthwaite se dispara cuando `B²−4AC < 0` y cuando las dos condiciones de existencia MLS fallan; y (b) el truncamiento a [0,1] no esté "comiéndose" masa de probabilidad de forma asimétrica en muestras pequeñas (ver sección E).

### E) Truncamiento y reglas de borde (CONFIRMADO verbatim, Minitab)

> "For all variance components, lower and upper bounds for variance components must not be negative values. If the bounds calculated using the formulas are negative, then they are set to zero.
> For all ratios between 0 and 1, lower and upper bounds should also be between 0 and 1. If the bounds are outside the range, they are set to 0 or 1 accordingly."

Impacto sobre la cobertura: no se localizó un estudio que cuantifique directamente el efecto del recorte, pero el recorte a [0,1] es una operación **conservadora en un extremo y anticonservadora en el otro**; en muestras pequeñas con componente pequeño, recortar el límite inferior a 0 puede reducir la cobertura efectiva del intervalo de razón. Considérelo como un contribuyente plausible a la sub-cobertura observada.

### F) Cobertura y validación (qué esperar para validar su implementación)

- **Burdick & Larsen (1997), "Confidence Intervals on Measures of Variability in R&R Studies," *Journal of Quality Technology* 29(3):261-273, DOI 10.1080/00224065.1997.11979768.** Compararon cinco métodos (MLS, Satterthwaite, AIAG, REML y Milliken-Johnson) para cinco medidas de variabilidad. Conclusión: **MLS mantiene el coeficiente de confianza declarado mejor que los otros, a costa de intervalos más anchos.** Es la base de la elección de Minitab de MLS como método principal.
- **Evidencia cuantitativa de la fragilidad de Satterthwaite** (Burdick & Graybill 1984, Technometrics 26(2):134): de 108 condiciones simuladas, los intervalos de Satterthwaite (equal-tail y shortest) quedaron significativamente por debajo del nivel declarado en **40 y 52 casos respectivamente**, frente a solo **4/216 (3.7%) y 1/216 (0.9%)** para los intervalos tipo Graybill-Wang (el ancestro directo del MLS). Esto justifica por qué MLS es preferible y por qué la caída a Satterthwaite debe verse como un último recurso, no como equivalente.
- **Chiang (2001), *Technometrics* 43(3):356-367 y Chiang (2002):** MLS y Satterthwaite para razones fallan por amplio margen cuando δ (el valor de la razón) es pequeño. Régimen crítico para %GRR bajo o para anidados con pocos operadores.
- **Hamada & Weerahandi (2000), "Measurement System Assessment via Generalized Inference," *Journal of Quality Technology* 32(3):241-253, DOI 10.1080/00224065.2000.11980000:** método GCI/generalizado (el enfoque GPQ que usted tenía antes). Su cobertura es generalmente ≥ nominal cuando hay suficientes partes y operadores. Nota práctica del estudio argentino (IRJES 2017): se recomienda diseñar el experimento con **al menos 4 grados de libertad por fuente de variación**; con o=3 operadores (2 g.l.) los intervalos son anchos e inestables — esto vale igual para MLS y explica parte de su problema en 5×3×2.
- **Plan de validación sugerido:** simule 5×3×2 y 10×3×3, 10.000–100.000 réplicas Monte Carlo, y verifique cobertura empírica frente a 90% nominal. Espere: cobertura ≥ nominal (posiblemente conservadora/ancha) para componentes y para la mayoría de razones bajo MLS; sub-cobertura esperada (no bug) para razones cuando el numerador es pequeño y de pocos g.l. Compare MLS vs. su antiguo GPQ: el GPQ suele dar cobertura ligeramente conservadora y más estable en el extremo superior, pero es más costoso.

### G) Límites unilaterales (CONFIRMADO verbatim, Minitab)

> "To calculate the one-sided confidence bounds, replace α/2 with α in H and G."

Interpretación: los intervalos bilaterales usan las constantes G_q y H_q evaluadas con percentiles a nivel α/2 en cada cola. Para un límite unilateral (superior o inferior) a nivel de confianza 1−α, se recalculan G_q y H_q usando α en lugar de α/2 en los percentiles de la F/χ². Esto aplica de forma consistente tanto a los intervalos exactos (repetibilidad), como a los MLS (componentes y razones) y a la caída Satterthwaite.

## Recommendations

**Etapa 1 — reimplementar y validar los componentes (bajo riesgo, alto valor).**
1. Repetibilidad: intervalo exacto χ² con las fórmulas de la sección B. Es determinista y verificable contra Minitab con cualquier dataset; úselo como test de regresión ancla.
2. G_q, H_q: implemente con la validación de rango `G_q ∈ (0,1)`, `H_q ≥ 0` como aserción en tiempo de ejecución. Esto detecta de inmediato la inversión de cola, la causa candidata #1 de mal calibrado.
3. Gage total y Total (combinaciones positivas): use la forma Graybill-Wang reconstruida de la sección B y valídela numéricamente contra Minitab en 3-4 datasets. Márquela como "reconstruida, validada numéricamente" en el repo.

**Etapa 2 — razones (el núcleo de F-07).**
4. **No publique A, B, C hasta transcribirlos verbatim** de Burdick, Borror & Montgomery (2005), *Design and Analysis of Gauge R&R Studies*, cap. 3, o de Gui et al. (1995), JSPI 48:215-227. Cítelos con número de ecuación. Mientras tanto, deje el cálculo de razones marcado como "pendiente de fuente primaria" en lugar de arriesgar otra atribución incorrecta.
5. Implemente la lógica de control de flujo ya confirmada: intentar MLS → si `B²−4AC < 0` o si fallan las dos condiciones de existencia (para repetibilidad/total) → caer a Satterthwaite. Registre en un log cuál rama se usó, para auditoría.
6. Derive `gage/total`, `%GRR` y las escalas desde la razón parte/total con `1 − x` (recordando el intercambio L↔U) y aplique el truncamiento [0,1] **antes** de la raíz cuadrada.

**Etapa 3 — validación de cobertura.**
7. Ejecute la simulación de la sección F. **Umbral de decisión:** si la cobertura del anidado sube a ≥ 89-90% tras corregir la convención de cola (Etapa 1, punto 2) y la lógica de caída (punto 5), el problema era de implementación. Si persiste en 86-88% **solo** cuando el componente del numerador es pequeño y de pocos g.l., entonces es la limitación conocida del método (Chiang) y debe **documentarse**, no "corregirse" — considere ofrecer GPQ como método alternativo para ese régimen, tal como Minitab documenta MLS + Satterthwaite.
8. Documente en el README/CHANGELOG el estado de verificación de cada fórmula (tabla de Key Findings) para cerrar formalmente F-07: esto convierte "fórmulas mal atribuidas" en "fórmulas con procedencia y estado de verificación explícitos".

**Benchmarks que cambiarían las recomendaciones:**
- Si al transcribir A, B, C del libro SIAM 2005 descubre que difieren de su reconstrucción → su motor de razones tenía un bug real; re-valide todo.
- Si la cobertura de componentes (no razones) también está bajo el nominal → el problema está en G_q/H_q o en los g.l., no en la cuadrática.
- Si consigue acceso institucional a Chiang (2001) o a BBM 2005, priorice extraer (a) los coeficientes A/B/C exactos y (b) las tablas de cobertura simulada para 5×3×2 y 10×3×3, que le darían los valores nominales-vs-reales exactos contra los cuales calibrar.

## Caveats

- **Coeficientes A, B, C de las cuadráticas de razones y términos cruzados G_qq′/H_qq′: NO verificados verbatim en fuente accesible.** Están tras muro de pago (SIAM 2005, Gui et al. 1995, Burdick & Graybill 1992). No deben publicarse como confirmados; márquense como "pendientes de transcripción de fuente primaria". Esta es la brecha central del documento y es deliberado no rellenarla con reconstrucciones no verificadas, dado el hallazgo de auditoría abierto.
- **Convención de percentil de G/H:** confirmada como "percentil superior" en Burdick & Graybill 1984, pero Minitab la enuncia como "percentil α·100"; ambas son consistentes si se leen con cuidado de las colas. Valide en código con las aserciones de rango.
- Las páginas de Minitab consultadas son de la versión en-us (idénticas en estructura a las es-mx que devuelven 403 desde su contenedor); las fórmulas efectivas son imágenes PNG en ambas.
- La forma de Graybill-Wang para combinaciones lineales (sección B) es la base teórica reconocida del MLS y es matemáticamente correcta para combinaciones positivas, pero la implementación exacta de Minitab para diferencias de cuadrados medios (con términos cruzados) puede diferir en detalles de agrupación; valídela numéricamente.
- No se localizó un estudio que cuantifique directamente el impacto del truncamiento a [0,1] sobre la cobertura; se ofrece como hipótesis plausible, no como hecho establecido.
- Los estudios de cobertura citados (Burdick & Larsen 1997, Chiang 2001/2002) tratan el caso cruzado clásico; la extrapolación al anidado es razonable pero no idéntica — de ahí el valor de su propia simulación en la Etapa 3.