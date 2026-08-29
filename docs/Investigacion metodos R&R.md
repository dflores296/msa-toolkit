# Universo completo de métodos de Análisis de Sistemas de Medición (MSA / Gage R&R): guía técnica para ampliar tu Excel y construir "Quality Tools – MSA"

> **Cómo leerlo hoy.** Es la investigación de partida, escrita cuando el
> proyecto todavía era un Excel que se quería ampliar. Su contenido técnico
> sigue vigente —es un repaso de la literatura, no del programa—, pero el plan
> de trabajo vivo es [`plan-siguientes-metodos.md`](plan-siguientes-metodos.md).
> De sus recomendaciones, hasta hoy:
>
> - **Hecho:** ANOVA cruzado corregido y validado contra Minitab; diseño
>   anidado para pruebas destructivas (recomendación 8); casos límite
>   explícitos —varianza negativa truncada a cero y avisada, aviso de ndc < 5
>   (recomendación 4); `datasets/` de validación y suite de regresión
>   (recomendación 10).
> - **Lo que sigue:** Attribute Agreement (recomendación 5), y después
>   Promedio-y-Rango (1), Tipo 1 Cg/Cgk (2), Linealidad/Sesgo y Estabilidad (6),
>   EMP de Wheeler (7), intervalos de confianza del %GRR (9) y VDA 5 (11).
> - **Descartado por ahora:** MkDocs Material (recomendación 10). El sitio se
>   sirve como HTML estático sin build, que es lo que permite abrirlo con doble
>   clic y sin dependencias.

## TL;DR
- El ANOVA es solo uno de una docena larga de métodos MSA: existen métodos para datos variables (Promedio y Rango, Rango corto, Tipo 1 Cg/Cgk, Linealidad y Sesgo, Estabilidad, EMP de Wheeler, R&R anidado/expandido, REML/modelos mixtos, intervalos GPQ/MLS y Monte Carlo) y para atributos (Attribute Agreement con Kappa de Cohen/Fleiss y Kendall, Teoría de Detección de Señales, y el método analítico AIAG con curva de desempeño/probit). Tu Excel debería, como mínimo, añadir Promedio-y-Rango, Tipo 1 y Attribute Agreement.
- Los criterios de aceptación son polémicos: AIAG usa %GRR sobre desviación estándar (<10% bueno, 10–30% marginal, >30% inaceptable; ndc≥5), mientras Wheeler (EMP) usa el coeficiente de correlación intraclase (ICC) y —según la síntesis de EMP publicada por SPC for Excel— "un sistema de medición responsable de hasta el 45% de la variación total puede aún ser un monitor de primera clase" ("a measurement system responsible for up to 45% of the total variation can still be a First Class Monitor"). VDA 5 / ISO 22514-7 usan un enfoque de incertidumbre (GUM) referido a tolerancia; el manual VDA 5 recomienda que "el ratio de capacidad para sistemas de medición, QMS_max sea 15% y, para procesos de medición, QMP_max sea 30%" ("QMS_max amounts to 15% and, for measurement processes, QMP_max amounts to 30%").
- Para el repositorio: usa GitHub Pages + MkDocs (tema Material) con despliegue automático vía GitHub Actions; valida tus cálculos contra los datasets publicados del manual AIAG MSA 4ª ed. y contra R (SixSigma, qualityTools, gageRR) y Minitab/JMP, incluyendo casos de varianza negativa y ndc<5 como pruebas de regresión.

## Key Findings
1. **El ANOVA no es el único método, ni siquiera el "mejor" universalmente.** El manual AIAG MSA describe tres métodos numéricos clásicos (Rango, Promedio-y-Rango, ANOVA) más estudios de sesgo, linealidad y estabilidad. Wheeler (EMP), VDA 5/ISO 22514-7 y la literatura estadística (REML, GPQ, bayesiano) aportan enfoques adicionales que resuelven limitaciones reales del ANOVA clásico (varianzas negativas, diseños desbalanceados, falta de intervalos de confianza).
2. **La distinción crítica es la base del porcentaje.** %GRR puede calcularse sobre variación total del estudio (%TV, en desviaciones estándar), sobre tolerancia (%P/T), o sobre varianza (% contribución). Cambiar de desviación estándar a varianza cambia radicalmente los números, y es la raíz del debate AIAG vs. Wheeler.
3. **Para pruebas destructivas se requiere diseño anidado** porque ninguna pieza puede medirse dos veces; la repetibilidad se estima de piezas homogéneas de un mismo lote.
4. **Existe ecosistema open source** (R: SixSigma, qualityTools, gageRR; Python: parcial vía statsmodels/scipy/pingouin) que puedes usar como referencia y validación cruzada.
5. **No existe todavía una MSA 5th edition**: la edición vigente de AIAG sigue siendo la 4ª (2010).

## Details

### 1. MÉTODOS PARA DATOS VARIABLES (continuos)

#### 1.1 Método de Rango y Promedio (Average and Range / X̄ & R)
Es el método manual clásico del AIAG, apto para calcularse en Excel sin álgebra matricial. Descompone la variación en repetibilidad (equipo, EV), reproducibilidad (operador, AV), GRR, variación de pieza (PV) y variación total (TV).

Diseño típico: 10 piezas × 3 operadores × 3 ensayos.

Fórmulas explícitas (constantes AIAG; nótese que la 3ª ed. usaba 5.15σ y la 4ª ed. usa 6σ):
- **EV (repetibilidad)** = R̄ × K1, donde R̄ es el rango promedio (promedio de los rangos de cada operador-pieza), y K1 = 1/d2 (o 5.15/d2 en versiones antiguas). Para 2 ensayos K1 = 0.8862; para 3 ensayos K1 = 0.5908.
- **AV (reproducibilidad)** = √[(X̄DIFF × K2)² − (EV²/(n·r))], donde X̄DIFF es el rango de los promedios de operador, n = nº de piezas, r = nº de ensayos. K2 depende del nº de operadores: 2 operadores = 0.7071; 3 operadores = 0.5231. Si el término bajo la raíz es negativo, AV se fija en 0.
- **GRR** = √(EV² + AV²).
- **PV** = Rp × K3, donde Rp es el rango de los promedios de pieza y K3 depende del nº de piezas (2=0.7071; 3=0.5231; 4=0.4467; 5=0.4030; 6=0.3742; 7=0.3534; 8=0.3375; 9=0.3249; 10=0.3146).
- **TV** = √(GRR² + PV²).
- **ndc (número de categorías distintas)** = 1.41 × (PV/GRR), truncado a entero; equivalente a √2 × (σ_part/σ_GRR). AIAG exige ndc ≥ 5.
- Las constantes Kn se derivan de d2 y d2* (la constante d2* de la tabla de Duncan, 1974, corrige d2 cuando el número de subgrupos g es pequeño). d2 se usa cuando g es grande (>20 rangos); d2* cuando g es pequeño (caso típico de GRR).

Los porcentajes: %EV = 100·(EV/TV), %AV = 100·(AV/TV), %GRR = 100·(GRR/TV), %PV = 100·(PV/TV). Nota: estos porcentajes NO suman 100 porque se basan en desviaciones estándar, no en varianzas.

Advertencia técnica clave: EV, AV y GRR aquí son desviaciones estándar, no varianzas. Esta es "el inicio de los problemas asociados al método de rango y promedio" según SPC for Excel, porque induce a sumar cantidades que no son aditivas linealmente (por eso GRR = √(EV²+AV²), nunca EV+AV).

#### 1.2 Método ANOVA (con y sin interacción operador×pieza)
El ANOVA de dos factores con efectos aleatorios es el método preferido cuando hay computadora, porque (a) separa la interacción operador×pieza, y (b) trabaja con varianzas, que sí son aditivas.

Tabla de sumas de cuadrados (diseño cruzado, p piezas, o operadores, r réplicas):
- SS_Part = o·r·Σ(x̄_i·· − x̄)²
- SS_Op = p·r·Σ(x̄_·j· − x̄)²
- SS_Rep (equipo/error) = Σ(x_ijk − x̄_ij·)²
- SS_Part×Op = SS_Total − SS_Part − SS_Op − SS_Rep
- SS_Total = Σ(x_ijk − x̄)²

Grados de libertad: Part = p−1; Op = o−1; Part×Op = (p−1)(o−1); Rep = po(r−1); Total = por−1.
Cuadrados medios: MS = SS/df.

Componentes de varianza (a partir de los cuadrados medios esperados, EMS):
- σ²_repetibilidad = MS_Rep
- σ²_interacción = (MS_Part×Op − MS_Rep)/r
- σ²_operador = (MS_Op − MS_Part×Op)/(p·r)
- σ²_pieza = (MS_Part − MS_Part×Op)/(o·r)
- σ²_GRR = σ²_repetibilidad + σ²_operador + σ²_interacción
- σ²_total = σ²_GRR + σ²_pieza

**Prueba F para la interacción (criterio α = 0.25 de AIAG):** se calcula F = MS_Part×Op / MS_Rep. Si el p-valor de la interacción es mayor que 0.25, el término de interacción se elimina ("pooling") y se combina con la repetibilidad (el error), recalculando el modelo sin interacción. Si p ≤ 0.25 la interacción se conserva. AIAG eligió α = 0.25 (no el 0.05 habitual) para ser conservador respecto a agrupar la interacción en el error; como explica el foro Elsmar Cove, "el 0.25 usado por AIAG permite un 25% de probabilidad de aceptar la interacción como significativa cuando en realidad no lo es". Nota importante: en el propio ejemplo del manual AIAG (p. 127, 4ª ed.) las pruebas F de los efectos principales usan MS_Rep (repetibilidad) como término de error, mientras Minitab/Montgomery usan MS_interacción; por eso el paquete SixSigma de R añadió el argumento `errorTerm` para replicar ambos comportamientos.

**Varianzas negativas:** cuando MS_interacción < MS_Rep, la fórmula produce σ²_interacción negativa. La convención AIAG/software es fijarla en cero. Esto es matemáticamente insatisfactorio y es una de las razones para preferir REML (ver 1.10).

Los porcentajes ANOVA se reportan típicamente sobre varianza (% contribución, que sí suma 100%) y sobre desviación estándar (%Study Var = √(componente/total)·100). ndc = 1.41·(σ_pieza/σ_GRR).

#### 1.3 Método de Rango (short-form GRR)
Método rápido que da únicamente el GRR combinado sin separar repetibilidad de reproducibilidad. Se usan típicamente 5 piezas y 2 operadores; cada operador mide cada pieza una vez. Se calcula el rango entre operadores para cada pieza, se promedia (R̄), y GRR = R̄/d2 (con d2 para m=2). Sirve como verificación rápida "pasa/no pasa" pero no diagnostica la fuente del problema.

#### 1.4 Estudio Tipo 1 (Type 1 Gage Study)
Es el primer estudio que debe hacerse: evalúa solo el gage (un operador, una pieza patrón/master con valor de referencia conocido, típicamente 25–50 mediciones repetidas). Evalúa repetibilidad y sesgo contra la tolerancia.
- **Cg** = (K·T/100)/(L·σ), donde K es el porcentaje de tolerancia usado (por defecto 20%), T la tolerancia, L el número de desviaciones que representan medio spread (típicamente 3, para 6σ), y σ la desviación estándar de las mediciones repetidas. Equivale a Cg = 0.2·T/(6σ) con los valores por defecto.
- **Cgk** = (K·T/200 − |X̄m − Xref|)/(L·σ) = (0.1·T − |sesgo|)/(3σ) con defaults. Cgk incorpora el sesgo (distancia entre el promedio medido X̄m y el valor de referencia Xref).
- **Sesgo (bias)** = X̄m − Xref, contrastado con un test t (H0: sesgo=0), gl = n−1.
- Criterio: Cg y Cgk ≥ 1.33 para gage capaz.
- %EV(repetibilidad) y %EV(repetibilidad y sesgo) son los recíprocos aproximados, con umbral típico 15% (o 10%).
- Regla de resolución (run chart de Minitab): las mediciones deben caer dentro de ±10% de la tolerancia (banda del 20%).

#### 1.5 Estudio de Linealidad y Sesgo
Evalúa si el sesgo es constante a lo largo del rango de medición. Se toman varias piezas patrón que cubren el rango (mínimo y máximo del proceso), se mide cada una múltiples veces, y se regresan los sesgos (y = bias) contra los valores de referencia (x). La pendiente de la recta cuantifica la linealidad (|pendiente|·rango = linealidad); el intercepto informa del sesgo. Un R² alto de la recta indica que el modelo lineal describe bien el error. Se hacen pruebas t sobre pendiente e intercepto.

#### 1.6 Estudio de Estabilidad (Stability)
Se monitorea el sistema de medición a lo largo del tiempo midiendo periódicamente el mismo patrón/master y graficando en cartas de control (X̄-R o individuales I-mR, típicamente 20–25 puntos en días/semanas). Estabilidad = ausencia de señales fuera de control (deriva, tendencias, saltos). Es la dimensión temporal que los estudios GRR puntuales no capturan.

#### 1.7 Método EMP (Evaluating the Measurement Process) de Donald Wheeler
Wheeler critica el %GRR de AIAG y propone caracterizar el sistema mediante el **coeficiente de correlación intraclase (ICC)**: ρ = σ²_pieza/σ²_total (proporción de varianza total debida al producto). Entonces 1−ρ = σ²_error/σ²_total.

**Cuatro clases de monitor** (umbrales exactos de ICC y su %GRR equivalente sobre desviación estándar σ_e/σ_x; tabla reproducida por SPC for Excel a partir de *EMP III* de Wheeler):
- **Primera clase (First Class):** ICC 0.8–1.0 → %GRR 0–45%. Reducción de señal <10%; >99% de detectar un salto de ±3 errores estándar en 10 subgrupos con Regla 1; puede rastrear mejoras hasta Cp80. SPC for Excel lo describe textualmente: "The First Class Monitor has ρ values between 0.8 and 1.0. This corresponds to a %GRR from 0 to 45%. This means that a measurement system responsible for up to 45% of the total variation can still be a First Class Monitor."
- **Segunda clase (Second Class):** ICC 0.5–0.8 → %GRR ~45–71%. Reducción de señal 10–30%; >88% de detección con Regla 1; rastrea hasta Cp50.
- **Tercera clase (Third Class):** ICC 0.2–0.5 → %GRR ~71–89%. Reducción 30–55%; >91% de detección usando las cuatro reglas Western Electric; rastrea hasta Cp20.
- **Cuarta clase (Fourth Class):** ICC 0.0–0.2 → %GRR ~89–100%. Reducción >55%; capacidad de detección "rápidamente desvaneciente"; incapaz de rastrear.

Conversión ICC→%GRR (σ_e/σ_x): ρ=1.0→0%; 0.9→32%; 0.8→45%; 0.7→55%; 0.6→63%; 0.5→71%; 0.4→77%; 0.3→84%; 0.2→89%; 0.1→95%; 0.0→100%.

El punto central de Wheeler: un sistema que AIAG rechazaría (p. ej. %GRR = 32% sobre desviación estándar, ICC ≈ 0.90) es en realidad un monitor de primera clase perfectamente utilizable para control de proceso. Wheeler también introduce el **error probable (PE) = 0.675·σ_e**, que define el 50% central de la distribución de mediciones repetidas y sirve para fijar el incremento de medición óptimo (la resolución debería estar entre 0.2·PE y 2·PE) y ajustar especificaciones ("watershed specifications"). Fuente principal: Wheeler, *EMP III: Evaluating the Measurement Process & Using Imperfect Data* (SPC Press, 2006).

#### 1.8 Gage R&R Expandido (Expanded) y modelos Anidados (Nested) vs Cruzados (Crossed)
- **Cruzado (Crossed):** todos los operadores miden todas las piezas (las mismas piezas se remiden). Es el diseño estándar no destructivo; permite estimar la interacción operador×pieza.
- **Anidado (Nested):** cada operador mide un conjunto distinto de piezas (las piezas están "anidadas" dentro del operador). Obligatorio cuando las piezas no pueden remedirse (destructivo). No puede estimar la interacción operador×pieza. Descomposición: SS_Total = SS_Operator + SS_Part(Operator) + SS_Repeatability.
- **Expandido (Expanded):** generaliza el GRR para incluir factores adicionales (p. ej. estación, dispositivo, día, ubicación) más allá de operador y pieza, con modelos lineales generales; útil cuando hay más fuentes de variación que se quieren cuantificar por separado. Minitab grafica interacciones adicionales además de operador×pieza.

#### 1.9 MSA para pruebas destructivas
Cuando la medición destruye o altera la pieza (ensayos de tracción/rotura, dureza, fuerza de apertura, tear resistance, análisis químico), un diseño cruzado es imposible porque ninguna pieza se puede medir dos veces. Se usa un diseño **anidado** apoyado en el supuesto de **homogeneidad del lote**: se asume que las piezas de un mismo lote/batch son "idénticas" de modo que las réplicas dentro del lote estiman la repetibilidad. Si cada operador puede medir piezas de cada lote, todavía puede usarse cruzado; si no (insuficientes piezas por lote), debe usarse anidado. Riesgo: si el supuesto de homogeneidad falla, la variación pieza-a-pieza dentro del lote enmascara (se confunde con) la variación del sistema de medición. Todos los estudios R&R no replicables son anidados: las piezas están anidadas dentro del operador.

#### 1.10 GLM, modelos de efectos mixtos y REML
- El ANOVA clásico por igualación de cuadrados medios (method of moments) solo funciona bien en diseños balanceados y puede producir componentes de varianza negativos.
- **REML (Restricted/Residual Maximum Likelihood)** estima los componentes de varianza maximizando la verosimilitud de contrastes de error ortogonales a los efectos fijos. Ventajas para GRR: (a) evita naturalmente las varianzas negativas (puede restringirlas a ≥0), (b) maneja diseños desbalanceados (datos faltantes, réplicas desiguales), (c) para diseños balanceados reproduce exactamente las estimaciones ANOVA (no se pierde nada), (d) proporciona intervalos de confianza (vía Satterthwaite). Es el método por defecto recomendado por JMP y usado por SigmaXL/Minitab cuando el diseño es desbalanceado o no jerárquico. Desventaja: más costoso computacionalmente (irrelevante hoy) y con pocos grupos puede fijar componentes en cero (indicador de estructura de efectos aleatorios demasiado rica). REML es "la opción segura por defecto" para componentes de varianza; ML subestima la varianza (sesgo a la baja).
- Los **GLM** permiten modelar factores fijos y aleatorios (modelo mixto) y son la base del R&R expandido.

#### 1.11 Intervalos de confianza para el %GRR: MLS y GPQ
El %GRR es una estimación puntual con incertidumbre considerable (sobre todo con 10 piezas / 3 operadores). Métodos para cuantificarla:
- **MLS (Modified Large Sample):** método de Burdick, Borror y Montgomery para construir intervalos de confianza aproximados sobre funciones de componentes de varianza (como %GRR), con buena cobertura en muestras moderadas.
- **GPQ (Generalized Pivotal Quantities):** introducidas por Tsui y Weerahandi (1989, 1993); construyen intervalos de confianza generalizados para proporciones de varianza total en modelos mixtos con más de dos componentes, incluso en diseños desbalanceados. Se implementan por simulación (p. ej. el paquete AOV1R en R genera GPQ para σ²_between, σ²_within y σ²_total).
- **Enfoques bayesianos:** modelos jerárquicos con distribuciones a priori sobre los componentes de varianza; útiles cuando hay heterocedasticidad o pocos niveles, y dan distribuciones posteriores completas del %GRR/ICC.

#### 1.12 Simulación Monte Carlo para incertidumbre
Método propagación-por-simulación (Suplemento 1 del GUM, JCGM 101): se define un modelo de medición, se asignan distribuciones a cada fuente de incertidumbre (repetibilidad, calibración, temperatura, resolución, etc.) y se muestrea repetidamente (10 000+ iteraciones) para obtener la distribución del mensurando y su incertidumbre expandida. Es la forma natural de integrar MSA con el enfoque GUM/VDA 5 cuando el modelo no es lineal o las distribuciones no son normales.

### 2. MÉTODOS PARA DATOS POR ATRIBUTOS (discretos / pasa-no pasa)

#### 2.1 Attribute Agreement Analysis
Evalúa sistemas de medición categóricos (pasa/no pasa, clasificación de defectos). Mide concordancia: dentro del evaluador (repetibilidad), entre evaluadores (reproducibilidad) y contra el estándar conocido (exactitud). Requiere que cada evaluador clasifique cada ítem varias veces (típico: 2–3 ensayos), incluyendo casos límite.

#### 2.2 Kappa de Cohen y Kappa de Fleiss
Fórmula común: κ = (p_o − p_e)/(1 − p_e), donde p_o es la concordancia observada y p_e la concordancia esperada por azar.
- **Cohen's kappa:** dos evaluadores (o dos ensayos), evaluadores fijos/elegidos específicamente. Requiere en Minitab exactamente 2 ensayos (within) o 2 evaluadores (between).
- **Fleiss' kappa:** generalización a más de 2 evaluadores/ensayos; asume evaluadores elegidos al azar de un grupo. Es el que Minitab calcula por defecto.
- Interpretación: κ=1 concordancia perfecta; κ=0 igual que el azar; κ<0 peor que el azar. Según la documentación oficial de Minitab, "The AIAG suggests that a kappa value of at least 0.75 indicates good agreement. However, larger kappa values, such as 0.90, are preferred." Escala común (Landis-Koch): <0.20 pobre, 0.21–0.40 débil, 0.41–0.60 moderada, 0.61–0.80 sustancial, 0.81–1.0 casi perfecta.

#### 2.3 Teoría de Detección de Señales (Signal Detection Theory)
Método AIAG para estimar el %GRR de gages de atributos usando piezas con valor de referencia continuo conocido. Se identifican las dos zonas de transición ("región II" o "área gris") donde las piezas a veces se aceptan y a veces se rechazan; d = ancho promedio de esas regiones II. Entonces GRR ≈ d, y %GRR = d/tolerancia (cuando Cp<1 se usa la tolerancia como TV). En el ejemplo del manual AIAG 4ª ed. (p. 144), según la reproducción en el foro Elsmar Cove: "d = 0.0237915... Because the example's CP is 0.5... less than 1, so the tolerance is used as TV... Thus, GRR%=0.02374/0.1=23.74% about 24%." Nota: AIAG indica que este método (y el de análisis por hipótesis/crosstab) debe usarse con consentimiento del cliente.

#### 2.4 Método analítico por atributos de AIAG (curva de desempeño / probit)
Para gages de atributos afectados por sesgo y repetibilidad. Se toman ≥8 piezas con valores de referencia conocidos, equidistantes cubriendo el rango, y se mide cada una un número fijo de veces (exactamente 20 en el método AIAG; ≥15 para el método de regresión), registrando el número de aceptaciones. Se regresa la probabilidad de aceptación (transformada probit, Φ⁻¹) contra el valor de referencia para obtener la **curva de desempeño del gage (GPC)**:
- **Sesgo (bias)** = diferencia entre el valor de referencia con 50% de aceptación y el límite; se contrasta con test t.
- **Repetibilidad** se obtiene de la pendiente de la recta probit; AIAG divide la repetibilidad preliminar por el factor de ajuste 1.08 (corrige la sobreestimación). gl = nº ensayos−1 (método AIAG) o nº puntos−2 (regresión).
- Ejemplo publicado (TIBCO/Statistica, replicando datos AIAG 2002 vol. III): repetibilidad ajustada ≈ 0.0079 y sesgo ≈ 0.0024, t ≈ 9.6 (se rechaza sesgo=0).

Este es el método "preferido" por AIAG para atributos (no requiere consentimiento del cliente, a diferencia del crosstab/kappa).

#### 2.5 Coeficiente de concordancia de Kendall
Para datos **ordinales** (p. ej. severidad de defecto 1–5), donde el orden importa. El coeficiente de concordancia de Kendall (W) mide la asociación entre evaluaciones ordinales de múltiples evaluadores; va de 0 a 1. Minitab también calcula el coeficiente de correlación de Kendall (entre evaluador y estándar). Cuando las categorías son ordinales, Kendall es más apropiado que kappa (que ignora el orden), como señala la propia documentación de Minitab.

### 3. CRITERIOS DE ACEPTACIÓN Y CONTROVERSIAS

**Criterios AIAG:**
- %GRR < 10%: aceptable.
- %GRR 10–30%: marginal (aceptable según aplicación, criticidad, costo).
- %GRR > 30%: inaceptable.
- ndc ≥ 5.
Estos %GRR de AIAG se basan en **desviación estándar** (%Study Var). En base **varianza** (% contribución) los umbrales equivalentes son mucho menores: como precisa T. Olsen en el blog de Minitab ("Gauging Gage"), en %Contribution "<1 percent is excellent and >9 percent is poor" (es decir, ~1% excelente y ~9% pobre).

**Tres bases distintas del porcentaje:**
- **%TV (sobre variación total del estudio):** GRR/TV. Depende de las piezas elegidas; si las piezas no cubren la variación real del proceso, %TV se infla artificialmente.
- **%P/T (Precision-to-Tolerance):** (6·σ_GRR)/(USL−LSL) [ó 5.15·σ_GRR en versiones antiguas]. Mide utilidad para clasificar producto contra especificación. Independiente de las piezas, pero depende de la tolerancia.
- **% sobre variación del proceso:** usa una σ_proceso histórica en lugar de la del estudio.

**Desviación estándar vs varianza:** los % basados en desviación estándar NO suman 100 y sobreestiman visualmente el impacto del sistema de medición; los basados en varianza SÍ suman 100 y son aditivos. Wheeler argumenta que usar ratios de desviación estándar es el error más significativo de AIAG. AIAG reporta ambas; el % contribución (varianza) es el que suma 100.

**Debate AIAG vs Wheeler/EMP:** Wheeler sostiene que (a) deben usarse varianzas, no desviaciones estándar; (b) el ICC (relativo a variación del proceso), no el %GRR sobre tolerancia, es la métrica correcta para juzgar utilidad; (c) los umbrales 10/30% son arbitrarios y rechazan sistemas útiles; (d) el ndc subestima la capacidad real. La postura intermedia recomendable: usar ANOVA/REML para los cálculos, reportar % contribución (varianza) y complementar con las clases de monitor EMP e intervalos de confianza.

### 4. ESTÁNDARES Y NORMAS

- **AIAG MSA 4ª edición (2010):** manual de referencia de la industria automotriz norteamericana (Chrysler/Ford/GM). Es la edición vigente; **no existe una 5ª edición de MSA** (a diferencia de FMEA, que se fusionó en el AIAG & VDA FMEA Handbook de 2019). Los "Core Tools" actuales de AIAG listan MSA-4 como la versión actual del manual MSA.
- **VDA Band 5 "Prüfprozesseignung" (3ª ed. 2021):** norma alemana automotriz. Integra MSA con incertidumbre de medición según GUM y se alinea con ISO 22514-7. Usa índices referidos a tolerancia: **Q_MS** = 2·U_MS/T (capacidad del sistema de medición, U_MS = incertidumbre expandida del instrumento) y **Q_MP** = 2·U_MP/T (capacidad del proceso de medición, U_MP añade influencias reales: temperatura, forma/inhomogeneidad de la pieza, operador). El manual VDA 5 recomienda que "the capability ratio for measuring systems, QMS_max amounts to 15% and, for measurement processes, QMP_max amounts to 30%". La tolerancia mínima se obtiene invirtiendo: TOL_MIN = 2·U / Q_max (p. ej. U_MS/0.15 y U_MP/0.30). Trabaja a ~95% de confianza (k=2), frente al 99.73% (±3σ) de AIAG. Regla previa: resolución del instrumento ≤ 5% de la tolerancia.
  - Procedimientos ("Verfahren", derivados del Bosch "Heft 10 – Fähigkeit von Mess- und Prüfprozessen"): **Verfahren 1** = Cg/Cgk con master (bias + repetibilidad, ≥25–50 mediciones); **Verfahren 2** = GRR cruzado con operadores (repetibilidad + reproducibilidad); **Verfahren 3** = R&R sin influencia de operador (medición automatizada/óptica); **Verfahren 4** = linealidad; **Verfahren 5** = estabilidad (cartas de control en el tiempo); **Verfahren 6** = evaluación global/resto de capacidad sobre piezas reales (la menos estandarizada); **Verfahren 7** = atributos (tablas cruzadas, kappa). La empresa hermana VDA 5.2 cubre procesos de apriete/par.
- **ISO 22514-7 (Capability of measurement processes):** versión internacional del enfoque VDA 5; conecta MSA con incertidumbre GUM y define índices de capacidad de proceso de medición. VDA 5 e ISO 22514-7 son esencialmente equivalentes.
- **ISO/IEC Guide 98-3 (GUM):** marco para expresar la incertidumbre de medición (incertidumbre estándar combinada u_c, factor de cobertura k, incertidumbre expandida U). Es la base metrológica de VDA 5/ISO 22514-7. Su Suplemento 1 (JCGM 101) cubre Monte Carlo.
- **ISO 5725:** exactitud (accuracy = trueness + precision). Define veracidad (trueness, relacionada con sesgo) y precisión (repetibilidad + reproducibilidad), con vocabulario y modelos que subyacen a MSA.
- **Integración:** VDA 5 e ISO 22514-7 son el "puente" que traduce el GUM (abstracto, metrológico) al lenguaje práctico de la MSA de planta; muchos resultados de Verfahren 1 y 2 se reutilizan directamente en el presupuesto de incertidumbre. ISO 5725 aporta el vocabulario de exactitud/precisión. AIAG MSA es el enfoque pragmático estadístico; VDA 5/ISO 22514-7/GUM el enfoque metrológico de incertidumbre. Diferencia clave para implementar: AIAG compara la variación del sistema con la variación total o la tolerancia; VDA 5 compara la incertidumbre expandida (k=2) con la tolerancia.

### 5. IMPLEMENTACIÓN PRÁCTICA

**Errores comunes en Excel y cómo detectarlos:**
- Confundir constantes: hay dos familias de K1/K2/K3 (una basada en 1/d2, otra en 5.15/d2). Verifícalas contra el ejemplo del manual AIAG.
- Sumar desviaciones estándar como si fueran varianzas (GRR = EV + AV es incorrecto; debe ser √(EV²+AV²)).
- Usar d2 en vez de d2* (Duncan) cuando g es pequeño.
- No manejar el caso AV negativa (fijar en 0) ni la varianza de interacción negativa (fijar en 0).
- ndc < 5 por piezas demasiado parecidas: síntoma de que las piezas no cubren la variación del proceso, no necesariamente de un mal gage. QI Macros y otras plantillas marcan una advertencia "NDC < 5"; la alternativa es usar el método de tolerancia (spec tolerance).
- Elegir mal entre cruzado y anidado.
- Aplicar la prueba F con el término de error equivocado (repetibilidad vs interacción).

**Validación cruzada con software:**
- **Minitab:** publica sus fórmulas (methods and formulas) para GRR cruzado, anidado, Tipo 1, atributos y expandido; usa α=0.25 por defecto para eliminar interacción; usa REML para diseños desbalanceados vía la asistente.
- **JMP:** recomienda EMP como práctica estándar; usa REML por defecto para componentes de varianza (con IC vía Satterthwaite).
- **R:** el paquete **SixSigma** (`ss.rr`) replica el ejemplo del apéndice AIAG (con `errorTerm` y `alphaLim` configurables); **qualityTools** (`gageRRDesign`/`gageRR`) da tablas ANOVA con y sin interacción; **gageRR** (CRAN, Jonah Warren, v0.1.0) implementa métodos ANOVA y Promedio-y-Rango con validación explícita contra el manual AIAG 4ª ed. y las fórmulas de Minitab (incluye app Shiny). Requieren estudio balanceado.
- **Python:** no hay un paquete MSA maduro y estándar; se construye con `statsmodels` (ANOVA/mixedlm para REML), `scipy.stats` (F, t), `sklearn.metrics.cohen_kappa_score` (kappa) y `pingouin` (ICC). pyMSA existe pero es de alcance limitado.

**Tamaños de muestra y potencia:**
- Estándar AIAG: 10 piezas × 3 operadores × 3 ensayos = 90 mediciones. Regla práctica: n×p×r ≥ 90 fiable; 40–90 adecuado con menos confianza; <40 insuficiente.
- Las simulaciones de Minitab ("Gauging Gage Part 1: Is 10 Parts Enough?", por T. Olsen, dataset gageaiag.mtw) muestran que 10 piezas dan intervalos de confianza muy amplios para el %GRR; textualmente, "the 95% CI of (2.14, 66.18) is a red flag that you really shouldn't be very confident that you have an acceptable measurement system". La misma serie concluye que **2–3 operadores no bastan para estimar la reproducibilidad con precisión**. Para estrechar el intervalo del componente pieza-a-pieza se necesitan más piezas; para reproducibilidad, más operadores.
- Las piezas deben cubrir el rango real de variación del proceso (no elegir piezas casi idénticas, o el %GRR se infla).

**Librerías open source de referencia:** R SixSigma, qualityTools, gageRR (y AOV1R para GPQ); Python statsmodels, scipy, pingouin (ICC), pyMSA.

**Estructura del repositorio GitHub + GitHub Pages ("Quality Tools – MSA"):**
- Generador de sitio: **MkDocs con tema Material** (Markdown + un único `mkdocs.yml`), desplegado a la rama `gh-pages` vía **GitHub Actions** (`mkdocs gh-deploy` o workflow CI en `.github/workflows/ci.yml`). Habilita GitHub Pages apuntando a la rama `gh-pages` en Settings. Alternativas: Jekyll (nativo de GitHub Pages), Quarto (bueno para mezclar código R/Python y prosa).
- Estructura sugerida: `docs/` (index.md, un .md por método), `docs/assets/` (imágenes/fórmulas), `src/` o `quality_tools/` (código), `tests/` (pruebas de regresión), `datasets/` (datasets de validación con resultados publicados), `examples/` (notebooks), `README.md`, `mkdocs.yml`, `.github/workflows/ci.yml`, `LICENSE`, `CONTRIBUTING.md`.
- Documentación: combina descripción técnica (fórmulas con MathJax/KaTeX, habilitando la extensión `pymdownx.arithmatex`) con ejemplos guiados y datasets de validación conocidos. Usa `mkdocs build --strict` en CI para detectar enlaces rotos.
- **Datasets de validación con resultados publicados** (imprescindibles como pruebas de regresión): el ejemplo del apéndice del manual AIAG MSA 4ª ed. (10 piezas/3 operadores/3 ensayos, el mismo que usa Minitab en gageaiag.mtw); el dataset que replica SixSigma (`ss.rr`); los ejemplos de "methods and formulas" de Minitab; el ejemplo de atributos AIAG (p. 144, %GRR≈24%). Documenta el resultado esperado (%GRR, ndc, componentes) para cada uno en una tabla "esperado vs. obtenido".

## Recommendations

**Etapa 1 — Ampliar tu Excel (corto plazo):**
1. Añade el **método Promedio-y-Rango** junto a tu ANOVA, con una tabla de constantes K1/K2/K3/d2/d2* verificada contra el manual AIAG. Reporta EV, AV, GRR, PV, TV, ndc, %TV y %P/T.
2. Añade el **Estudio Tipo 1 (Cg/Cgk)** como paso previo obligatorio antes de cualquier GRR.
3. Reporta el %GRR en **las tres bases** (varianza/% contribución que suma 100, desviación estándar/%Study Var, y %P/T) para evitar malinterpretaciones.
4. Implementa el manejo explícito de casos límite: AV negativa → 0, varianza de interacción negativa → 0, y advertencia ndc < 5.

**Etapa 2 — Métodos avanzados y atributos (medio plazo):**
5. Añade **Attribute Agreement Analysis** (Kappa de Cohen/Fleiss + Kendall para ordinales) si inspeccionas pasa/no pasa.
6. Añade **Linealidad/Sesgo** y **Estabilidad** (cartas I-mR del patrón).
7. Incorpora la **clasificación EMP de Wheeler (ICC y clases de monitor)** como lectura complementaria al %GRR AIAG; ayuda a no rechazar sistemas útiles.
8. Para pruebas destructivas, implementa el **diseño anidado**.

**Etapa 3 — Rigor estadístico y repositorio (largo plazo):**
9. Migra los cálculos críticos a **REML** (vía R o Python) para evitar varianzas negativas y manejar desbalanceo, y añade **intervalos de confianza** para el %GRR (MLS o GPQ).
10. Construye el repositorio con **MkDocs Material + GitHub Actions**, con `datasets/` de validación publicados y `tests/` que comparen tu implementación contra R (SixSigma/gageRR) y contra los resultados del manual AIAG. Incluye una tabla de "resultado esperado vs. obtenido" para cada dataset.
11. Si trabajas con clientes alemanes/europeos, añade el enfoque **VDA 5 / ISO 22514-7** (Q_MS/Q_MP con incertidumbre GUM).

**Benchmarks que cambian las decisiones:**
- Si %GRR (desviación estándar) > 30% Y el ICC EMP < 0.5, el sistema es genuinamente inadecuado: prioriza mejora del gage.
- Si %GRR marginal (10–30%) pero ICC ≥ 0.8 (primera clase), el sistema sirve para control de proceso aunque no para clasificación fina.
- Si ndc < 5 con piezas que sí cubren el proceso, mejora el gage; si las piezas eran demasiado parecidas, repite con piezas representativas.
- En % contribución (varianza), <1% excelente y >9% pobre (Minitab); úsalo como métrica aditiva junto al %Study Var.

## Caveats
- Las constantes K1/K2/K3 aparecen en dos convenciones (1/d2 vs 5.15/d2, y la 4ª ed. usa 6σ en vez de 5.15σ); verifica siempre cuál usa tu fuente antes de comparar resultados.
- La numeración VDA "Verfahren 1–7" no está fijada por una única norma mundial; proviene principalmente del Bosch Heft 10 y varía ligeramente entre guías corporativas. La definición de Verfahren 6 es la menos documentada de forma consistente.
- Los %GRR equivalentes a las clases EMP (45%, 71%, 89%) están expresados sobre desviación estándar (σ_e/σ_x); no confundir con los umbrales de varianza (~1%/9%).
- El método de Detección de Señales y el crosstab/kappa requieren consentimiento del cliente según AIAG; el método analítico (probit) no.
- Python carece de un paquete MSA de referencia maduro; se recomienda validar cualquier implementación Python contra R o Minitab.
- No se pudo acceder al texto normativo completo de AIAG MSA 4ª ed. ni de VDA 5 (documentos de pago); las fórmulas provienen de fuentes técnicas secundarias confiables (Minitab, SPC for Excel, paquetes R en CRAN, foros técnicos como Elsmar Cove, y artículos revisados) que las reproducen. Confirma los valores exactos contra los manuales originales antes de certificación/auditoría.