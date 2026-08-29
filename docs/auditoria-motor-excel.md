# Auditoría del motor de cálculo `Gage R&R Study.xlsm`

Revisión del código VBA del libro actual, los errores encontrados, su efecto
numérico y cómo quedan corregidos en `assets/js/anova.js`.

**Método del libro:** Gage R&R por ANOVA de dos factores cruzado con efectos
aleatorios (piezas × operadores, con réplicas). Es el método correcto para un
estudio no destructivo. El diseño del método no está mal; la implementación sí
tiene errores.

**Cómo se verificó cada hallazgo.** Se extrajo el VBA del `.xlsm`, se
reimplementó fielmente en `tests/legacy-vba.js` (incluidos sus errores) y se
comprobó que reproduce **dígito por dígito** las hojas `SS_Calculos` y
`Varianza` del libro:

| Cantidad | Reimplementación | Hoja del libro |
|---|---|---|
| SC Parte | 0.0019037000 | 0.0019037000 |
| SC Operador | 1.2500e-6 | 1.2500e-6 |
| SC Interacción | 1.5000e-6 | 1.5000e-6 |
| SC Repetibilidad | 3.0000e-6 | 3.0000e-6 |
| % Contribución Gage R&R | 0.2595 % | 0.2595 % |
| % Study Variation Gage R&R | 5.0946 % | 5.0946 % |
| NDC | 27 | 27 |

Sobre esa base, cada error se demuestra contra el dataset del apéndice del
manual **AIAG MSA 4.ª ed.** (10 piezas × 3 operadores × 3 réplicas), el mismo
que Minitab distribuye como `gageaiag.mtw` y para el que existen resultados
publicados.

---

## Resumen: 12 hallazgos

| # | Hallazgo | Gravedad | Efecto |
|---|---|---|---|
| 1 | `SS_Parte` sin el factor de réplicas | **Alta** | Tabla ANOVA incorrecta |
| 2 | `SS_Operador` sin el factor de réplicas | **Alta** | Tabla ANOVA incorrecta |
| 3 | Divisores incorrectos en los componentes de varianza | **Alta** | Sesga %GRR |
| 4 | `Var_Interacción` sin dividir entre r | **Alta** | Sobreestima la interacción r veces |
| 5 | Medias redondeadas a 6 decimales antes de calcular | **Alta** | Destruye precisión en escalas pequeñas |
| 6 | No existe prueba F ni agrupamiento de la interacción | **Alta** | Modelo distinto al de Minitab/AIAG |
| 7 | No se calcula `SS_Total` real; la descomposición no cierra | Media | Ningún control de consistencia |
| 8 | Nombres de pieza destruidos por `Val(Replace(pieza,"Parte",""))` | Media | Etiquetas y orden erróneos |
| 9 | Constantes D3/D4/A2 sólo hasta 10 réplicas, con caída silenciosa | Media | Límites de control erróneos |
| 10 | Resultados escritos con `Round(x, 3)` | Media | Tablas que muestran "0.000" |
| 11 | Cancelar el diálogo de LSL/USL produce tolerancia 0 | Media | %Tolerance basura |
| 12 | Diseño desbalanceado no detectado | Media | Resultados sin sentido, sin aviso |

---

## Detalle

### 1 y 2 — Las sumas de cuadrados no incluyen el número de réplicas

`CalcularSumasDeCuadrados.bas`:

```vba
SS_Parte    = SS_Parte    + nOperadores * (media_pieza - promedioGlobal) ^ 2
SS_Operador = SS_Operador + nPartes     * (media_operador - promedioGlobal) ^ 2
```

La forma correcta para un diseño cruzado balanceado es

```
SC_Parte    = o · r · Σ (x̄_i·· − x̄)²
SC_Operador = p · r · Σ (x̄_·j· − x̄)²
```

Falta el factor `r` (réplicas) en ambas. Con `r = 3`, `SC_Parte` sale **tres
veces menor** de lo que debe.

Sobre el dataset AIAG:

| | Libro Excel | Correcto / Minitab |
|---|---|---|
| SC Parte | 29.4540 | **88.3619** |
| SC Operador | 1.0558 | **3.1673** |
| SC Interacción | 0.3590 | 0.3590 |
| SC Repetibilidad | 2.7589 | 2.7589 |
| **Suma** | **33.6276** | **94.6471** = SC Total |

La tabla ANOVA que imprime el libro está sencillamente mal, y como nunca se
calcula `SC_Total` de forma independiente (hallazgo 7), nada lo detecta.

### 3 — Divisores incorrectos en los componentes de varianza

`CalculoVarianza.bas`:

```vba
Var_Pieza    = Max(0, (MS_Pieza - MS_Interaccion) / nOperadores)
Var_Operador = Max(0, (MS_Operador - MS_Interaccion) / nPiezas)
```

Los cuadrados medios esperados exigen dividir entre `o · r` y `p · r`:

```
σ²_pieza    = (CM_Parte    − CM_Interacción) / (o · r)
σ²_operador = (CM_Operador − CM_Interacción) / (p · r)
```

Este error se **cancela parcialmente** con los hallazgos 1 y 2 (ambos pierden
un factor `r`), lo que explica por qué el libro produce resultados que a veces
parecen razonables. La cancelación no es exacta: el término que se resta queda
`r` veces sobredimensionado, así que el sesgo sobrevive.

### 4 — La varianza de interacción no se divide entre las réplicas

```vba
Var_Interaccion = Max(0, MS_Interaccion - MS_Repetibilidad)
```

Correcto:

```
σ²_interacción = (CM_Interacción − CM_Repetibilidad) / r
```

Aquí no hay cancelación posible: la interacción se **sobreestima `r` veces**.
Es el error de mayor impacto práctico, porque la interacción entra en el Gage
R&R total. En simulaciones con interacción moderada el %Study Variation se
infla entre **10 % y 56 % en términos relativos**, y en cerca del **13 % de los
casos** el error es tan grande que la varianza pieza-a-pieza se trunca a cero y
el libro reporta un Gage R&R del 100 % con Part-to-Part = 0, algo físicamente
imposible.

Casos simulados en que el veredicto AIAG cambia:

| %SV correcto | Veredicto correcto | %SV del Excel | Veredicto del Excel |
|---|---|---|---|
| 22.87 % | Marginal | 31.09 % | **Inaceptable** |
| 19.25 % | Marginal | 31.08 % | **Inaceptable** |
| 25.53 % | Marginal | 40.71 % | **Inaceptable** |
| 28.17 % | Marginal | 34.75 % | **Inaceptable** |

Es decir: **el libro puede hacer que rechaces un instrumento que en realidad
es aceptable.**

### 5 — Redondeo intermedio de las medias

`CalculoMedias.bas` escribe las medias con `Round(suma / cuenta, 6)`, y
`CalcularSumasDeCuadrados.bas` lee esas celdas ya redondeadas.

En tus datos reales las mediciones valen ~0.24 y la varianza total es ~1.06e-4,
con una varianza del gage de ~2.7e-7. Redondear las medias a 1e-6 introduce un
error del mismo orden de magnitud que la cantidad que se quiere estimar.
Además, `Round()` de VBA es redondeo bancario (half-to-even), no el habitual.

El motor nuevo no redondea nada hasta el momento de presentar.

### 6 — No hay prueba F ni agrupamiento del término de interacción

El libro **siempre** conserva la interacción. Minitab y el manual AIAG hacen
otra cosa: contrastan `F = CM_Interacción / CM_Repetibilidad` y, si el p-valor
supera α (AIAG usa **0.25**; Minitab por defecto 0.05), eliminan el término y
lo agrupan con la repetibilidad, recalculando el modelo reducido.

En el dataset AIAG, `F = 0.434` con `p = 0.9741`: Minitab usa el modelo **sin**
interacción. El libro reporta un modelo distinto y por eso jamás coincidirá con
Minitab, aun corrigiendo la aritmética.

El motor nuevo implementa la prueba F, agrupa según α (0.25 por defecto) y
permite forzar el modelo manualmente.

### 7 — La descomposición del ANOVA nunca se comprueba

La fila "Total" de `SS_Calculos` es `=SUM(C2:C5)`, la suma de las cuatro
componentes. Nunca se calcula `SC_Total = Σ(x − x̄)²` de forma independiente,
así que la identidad

```
SC_Total = SC_Parte + SC_Operador + SC_Interacción + SC_Repetibilidad
```

no se verifica jamás. Es exactamente el control que habría delatado los
hallazgos 1 y 2 el primer día.

El motor nuevo calcula `SC_Total` aparte, compara, y avisa si el error relativo
supera 1e-9. La suite de pruebas lo verifica sobre 200 diseños aleatorios.

### 8 — Los nombres de pieza se destruyen

`Graficos.bas`, en la carta R y en la carta X-barra:

```vba
numPieza = Val(Replace(pieza, "Parte", ""))
...
pieza = "Parte " & clavesArray(n, 2)
```

Se asume que toda pieza se llama literalmente `Parte N`. Si nombras tus piezas
`P1`, `Muestra A`, o con un número de serie, `Val()` devuelve 0 para todas: el
orden se vuelve arbitrario y **todas las etiquetas quedan como "Parte 0"**. El
nombre real que escribiste en el formulario se pierde.

El motor nuevo conserva los nombres tal cual y respeta el orden de aparición.

> **Postdata (28-08-2026).** Este hallazgo volvió, en otra capa. El motor
> siempre respetó los nombres, pero la **interfaz** los perdía en el método
> anidado: `renderNameInputs()` vaciaba `state.partsByOperator` antes de
> leerlo, así que cada redibujado los devolvía a `Pieza 1..N`. La consecuencia
> grave no eran las etiquetas sino las mediciones: importar un archivo anidado
> con nombres propios (`Lote-A-04`) reconstruía la tabla con los nombres por
> defecto, el llenado posterior buscaba celdas que ya no existían y las 90
> mediciones se perdían **en silencio**. Corregido en `assets/js/app.js`.
>
> Vale la pena dejarlo escrito junto al hallazgo original: el defecto del VBA
> era de cálculo y estaba en el motor; este era de estado y estaba en la
> pantalla. Ninguna de las 80 pruebas lo vio, porque ninguna toca el DOM. Un
> motor correcto no garantiza que el nombre que escribió el usuario sobreviva
> el viaje hasta la tabla.

### 9 — Constantes de carta de control incompletas

```vba
Case Else: D3 = 0: D4 = 3.267    ' carta R
Case Else: A2 = 1.023            ' carta X-barra
```

Con más de 10 réplicas el código cae **silenciosamente** a las constantes de
n = 2 (carta R) o n = 3 (carta X-barra), y dibuja límites de control
completamente equivocados sin decir nada. Además, `replicas` se toma del
**último** grupo recorrido, sin comprobar que todos coincidan.

El motor nuevo tabula de 2 a 25 réplicas y, fuera de rango, omite las cartas
con un aviso explícito en lugar de inventar límites.

### 10 — Los resultados se guardan redondeados a 3 decimales

`CalculoVarianza.bas`:

```vba
wsVar.Cells(fila, 2).Value = Round(desv(i), 3)
wsVar.Cells(fila, 3).Value = Round(study(i), 3)
```

No es formato de celda: es el **valor** el que se redondea. Por eso la Tabla 2
de tu libro muestra `0.000` en casi toda la columna StDev — la información ya
no está ahí. Lo mismo ocurre en las gráficas, que guardan `Round(valor, 4)`.

El motor nuevo guarda precisión completa y sólo redondea al presentar,
eligiendo los decimales según la escala de los datos.

### 11 — Cancelar el diálogo de LSL/USL no cancela

```vba
LSL = Application.InputBox(...)
If Not IsNumeric(LSL) Then Exit Sub
```

`LSL` está declarada `As Double`. Al cancelar, `InputBox` devuelve `False`, que
se convierte a `0` al asignarse a un `Double`. `IsNumeric(0)` es siempre `True`,
así que la guarda nunca dispara y el estudio continúa con LSL = 0.

En el motor nuevo LSL/USL son campos opcionales del formulario: si faltan,
simplemente se omite la columna %Tolerance con un aviso.

### 12 — Diseños desbalanceados pasan sin aviso

```vba
nReplicas = nMediciones / (nOperadores * nPartes)
```

`nReplicas` es `Long`: si el diseño está incompleto, la división no entera se
redondea y el cálculo sigue con un número de réplicas inventado. `ValidarDatos`
comprueba celdas vacías, pero no que la matriz operador × pieza esté completa
ni que todas las celdas tengan el mismo número de réplicas.

El motor nuevo rechaza el cálculo, nombra las combinaciones faltantes y explica
que un diseño desbalanceado requiere REML.

---

## Lo que además faltaba (no son errores, son huecos)

- **%GRR en una sola base.** El libro reporta %Contribución y %Study Variation,
  pero mezcla las lecturas. Añadido: las tres bases juntas (varianza, desviación
  estándar y P/T), más %Proceso opcional con σ histórica.
- **Sin intervalo de confianza ni contexto de tamaño de muestra.** Con 10 piezas
  el %GRR tiene un intervalo enorme. Añadidos avisos cuando el estudio es
  pequeño (menos de 40 mediciones, menos de 10 piezas, menos de 3 operadores).
- **NDC sin interpretación.** Añadido el aviso de NDC < 5 explicando que puede
  deberse a piezas poco representativas y no al instrumento.
- **Sin lectura EMP.** Añadido el ICC y la clase de monitor de Wheeler como
  lectura complementaria al criterio AIAG.
- **Sin pruebas de regresión.** Añadida una suite de 37 pruebas contra los
  valores publicados de Minitab (`tests/`).
- **Componentes negativos silenciosos.** Se truncaban a 0 sin decirlo. Ahora se
  reportan como aviso, porque son la señal de que convendría un estimador REML.

---

## Validación del motor nuevo

`tests/index.html` (o `node tests/run-node.js`) contrasta el motor contra los
valores publicados por Minitab para el dataset AIAG:

| Cantidad | Motor nuevo | Minitab publicado |
|---|---|---|
| SC Parte / Operador / Interacción / Repetibilidad | 88.3619 / 3.1673 / 0.3590 / 2.7589 | idem |
| SC Total | 94.6471 | 94.6471 |
| F interacción, p | 0.434, 0.9741 | 0.434, 0.974 |
| F Parte, F Operador (modelo con interacción) | 492.291, 79.406 | 492.291, 79.406 |
| Modelo elegido (α = 0.25) | sin interacción | sin interacción |
| CM repetibilidad agrupada (gl 78) | 0.03997 | 0.03997 |
| % Contribución Gage R&R | 7.76 % | 7.76 % |
| % Study Variation Gage R&R | 27.86 % | 27.86 % |
| % Study Variation pieza a pieza | 96.04 % | 96.03 % |
| NDC | 4 | 4 |

Más pruebas de propiedades: la descomposición cierra en 200 diseños aleatorios,
invariancia ante traslación y escala, independencia del orden de las filas,
y validación de entradas mal formadas.

---

## Nota sobre el documento `Instrucciones recomendadas Claude Code.md`

Ese documento indica *"replicar las fórmulas EXACTAMENTE como están ahí, no las
reinterpretes"*, y transcribe las fórmulas del VBA **con los errores 1, 2, 3
y 4 incluidos**. Seguirlo al pie de la letra habría reproducido los mismos
errores en la web. Las fórmulas implementadas aquí son las correctas del ANOVA
de efectos aleatorios, verificadas contra Minitab.
