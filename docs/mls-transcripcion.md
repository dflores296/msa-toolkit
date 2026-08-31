# Transcripción del método MLS desde la documentación de Minitab

**Qué es este documento.** El registro de dónde salió cada fórmula que
implementa `assets/js/mls.js`, qué se leyó literalmente, qué se apartó de lo
impreso y con qué prueba. Existe porque el hallazgo F-07 de la auditoría nació
justamente de atribuir a Minitab un método que no era el suyo; la reparación no
puede consistir en atribuirle ahora unas fórmulas sin poder enseñar de dónde
vienen.

**Fuentes.** Páginas de Minitab, versión es-mx, sección «Métodos y fórmulas».
Del **Estudio R&R cruzado**:

- **Relaciones de la varianza en los intervalos de confianza.** Intervalos de
  las **razones** (parte/total, gage/total, repetibilidad/total…). Es la que
  contiene la maquinaria cuadrática y de la que sale el intervalo del %GRR.
- **Componentes de la varianza en los intervalos de confianza.** Intervalos de
  los **componentes** en unidades absolutas (mm², etc.). De aquí salen la tabla
  de grados de libertad, el mapeo `MSParte = S₁²`, las reglas de truncamiento y
  la definición de `G_qr`/`H_qr`.

Del **Estudio R&R anidado**, su propia página de **Relaciones de la varianza en
los intervalos de confianza**, sección de parte/total.

El método es de **Burdick & Graybill (1992)**, *Confidence Intervals on Variance
Components*, y **Burdick, Borror & Montgomery (2005)**, *Design and Analysis of
Gauge R&R Studies* (ASA-SIAM). Minitab los cita; no reimprime sus derivaciones.

**Cómo se obtuvo.** Las fórmulas de esas páginas son imágenes PNG, no texto ni
MathML, y el contenedor de desarrollo no tiene salida de red hacia
`support.minitab.com`. Se transcribieron desde capturas de pantalla aportadas
por el usuario, ampliando los tramos cortados por el desplazamiento horizontal.
Cada apartado dice si se leyó completo o si quedó algo por confirmar.

---

## 1. Notación (leída verbatim)

```
H_q  = n_q / χ²_{α/2}(n_q) − 1
G_q  = 1 − n_q / χ²_{1−α/2}(n_q)

H_qr = { [1 − F_{α/2}(n_q,n_r)]² − H_q²·F²_{α/2}(n_q,n_r) − G_r² } / F_{α/2}(n_q,n_r)
G_qr = { [F_{1−α/2}(n_q,n_r) − 1]² − G_q²·F²_{1−α/2}(n_q,n_r) − H_r² } / F_{1−α/2}(n_q,n_r)
```

`χ²_α` y `F_α` son el **percentil α·100**. Para límites unilaterales se
reemplaza α/2 por α en H y G.

```
I = número de partes      J = número de operadores      K = número de réplicas

Grados de libertad:  n₁ = I−1    n₂ = J−1    n₃ = (I−1)(J−1)    n₄ = IJ(K−1)
Cuadrados medios:    MSParte = S₁²   MSOperador = S₂²   MSParte*Operador = S₃²
                     MSRéplicas = S₄²        (ver errata 1)

a = I     b = J     c = (IJ − I − J)     d = IJ(K−1)     e = I − 1
```

`e` no se usa en la razón parte/total; aparece en las «dos condiciones de
existencia» de la razón repetibilidad/total, que no se han transcrito porque
esta implementación no las necesita.

> **Corrección a la versión anterior del documento técnico.** La reconstrucción
> que se manejaba antes de tener esta página llevaba las colas de la F
> **intercambiadas** (`G` con `F_α`, `H` con `F_{1−α}`). La estructura algebraica
> era correcta; las colas no. Era exactamente el fallo que ese documento
> señalaba como «causa candidata #1 de límites mal calibrados».

**Invariante de control:** con esta convención `G_q ∈ (0,1)` y `H_q ≥ 0`. Si una
implementación produce `G` fuera de ese rango o `H` negativo, tiene la cola de
la χ² invertida. Se comprueba en `tests/tests-mls.js`.

---

## 2. Razón parte/total, método MLS (leída verbatim)

### Límite inferior = (−B − √(B²−4AC)) / 2A

```
A = a²(1−G₁²)S₁⁴ + b²(1−H₂²)S₂⁴ + c²(1−H₃²)S₃⁴ + d²(1−H₄²)S₄⁴
  + ab(2+G₁₂)S₁²S₂² + ac(2+G₁₃)S₁²S₃² + ad(2+G₁₄)S₁²S₄²
  + 2bc·S₂²S₃² + 2bd·S₂²S₄² + 2cd·S₃²S₄²

B = −2a(1−G₁²)S₁⁴ + 2c(1−H₃²)S₃⁴ − b(2+G₁₂)S₁²S₂² + a(2+G₁₃)S₁²S₃²
  − c(2+G₁₃)S₁²S₃² − d(2+G₁₄)S₁²S₄² + 2b·S₂²S₃² + 2d·S₃²S₄²

C = (1−G₁²)S₁⁴ + (1−H₃²)S₃⁴ − (2+G₁₃)S₁²S₃²
```

### Límite superior = (−B + √(B²−4AC)) / 2A

```
A = a²(1−H₁²)S₁⁴ + b²(1−G₂²)S₂⁴ + c²(1−G₃²)S₃⁴ + d²(1−G₄²)S₄⁴
  + ab(2+H₁₂)S₁²S₂² + ac(2+H₁₃)S₁²S₃² + ad(2+H₁₄)S₁²S₄²
  + bc(2−0.5H*₂₃)S₂²S₃² + bd(2−0.5H*₂₄)S₂²S₄² + cd(2−0.5H*₃₄)S₃²S₄²

B = −2a(1−H₁²)S₁⁴ + 2c(1−G₃²)S₃⁴ − b(2+H₁₂)S₁²S₂² + a(2+H₁₃)S₁²S₃²
  − c(2+H₁₃)S₁²S₃² − d(2+H₁₄)S₁²S₄² + b(2−0.5H*₂₃)S₂²S₃² + d(2−0.5H*₃₄)S₃²S₄²

C = (1−H₁²)S₁⁴ + (1−G₃²)S₃⁴ − (2+H₁₃)S₁²S₃²
```

«Si B²−4AC < 0, no hay solución para la ecuación cuadrática. En este caso,
Minitab utiliza el segundo método.»

**Nota sobre la simetría.** El límite superior **no** es el inferior con G y H
intercambiadas: coincide en los términos que tocan el índice 1, y difiere en los
que no (`2bc` frente a `bc(2−0.5H*₂₃)`). Deducir uno del otro habría producido
fórmulas incorrectas. Es la razón de que esta transcripción se hiciera término a
término y no por simetría.

**Variante sin término de interacción.** Es la misma fórmula con `d = 0` y
`S₄² = 0`: los diez términos de `A` se reducen a los seis que Minitab imprime
para esa variante. `mls.js` no tiene dos caminos de código porque no hay dos
fórmulas.

---

## 3. Aproximación de Satterthwaite, el «segundo método» (leída verbatim)

```
L = γ̂₂ / (γ̂₃·F_{1−α/2}(m₁,m₃))
    × ( γ̂₁/γ̂₂ − χ²_{1−α/2}(m₁)/m₁
        + F_{1−α/2}(m₁,m₂)·[ χ²_{1−α/2}(m₁)/m₁ − F_{1−α/2}(m₁,m₂) ] / (γ̂₁/γ̂₂) )

U = lo mismo con α/2 en los tres cuantiles.
```

```
γ̂₁ = I·S₁²      m₁ = n₁
γ̂₂ = I·S₃²      m₂ = n₃

con interacción:  γ̂₃ = I·S₁² + J·S₂² + (IJ−I−J)S₃² + IJ(K−1)S₄²
sin interacción:  γ̂₃ = I·S₁² + J·S₂² + (IJK−I−J)S₃²

m₃ = γ̂₃² / ( (a·S₁²)²/n₁ + (b·S₂²)²/n₂ + (c·S₃²)²/n₃ + (d·S₄²)²/n₄ )
```

Aquí **no hay multiplicador**: `L` y `U` son ya la razón.

**Control de coherencia.** Si todos los cuantiles valen 1, el paréntesis colapsa
a `γ̂₁/γ̂₂ − 1` y `L` queda en `(γ̂₁−γ̂₂)/γ̂₃`, que es el estimador puntual de
parte/total. Comprobado en las pruebas.

---

## 4. Reglas derivadas (leídas verbatim)

```
LI( gage/total ) = 1 − LS( parte/total )
LS( gage/total ) = 1 − LI( parte/total )

%Contribution   = 100 · razón
%StudyVariation = 100 · √razón
```

Truncamiento, de la sección «Notación común y reglas»: los bordes de los
componentes no pueden ser negativos y se fijan en cero; los de las razones deben
quedar en [0,1] y se fijan en 0 o 1 según corresponda. El truncamiento va
**antes** de la raíz cuadrada.

---

## 4 bis. El modelo anidado

Minitab lo publica en páginas propias. Escrito término a término parece otra
fórmula; no lo es. **Es la misma plantilla con los papeles repartidos de otro
modo**, y `mls.js` la implementa una sola vez.

```
S₁² = MSOperador     S₂² = MSPieza(Operador)     S₃² = MSRepetibilidad
```

El **pivote es S₂**, no S₁: la varianza de pieza sale de `S₂² − S₃²`. Por eso los
subíndices de la página anidada son `G₂₁`, `G₂₃`, `H*₁₃` — el pivote va primero,
y `G_qr` no es simétrico.

### Límite inferior (verbatim)

```
A = a²(1−G₂²)S₂⁴ + (1−H₁²)S₁⁴ + b²(1−H₃²)S₃⁴
  + a(2+G₂₁)S₂²S₁² + ab(2+G₂₃)S₂²S₃² + 2b·S₁²S₃²

B = −2a(1−G₂²)S₂⁴ + 2b(1−H₃²)S₃⁴ − (2+G₂₁)S₂²S₁²
  + a(2+G₂₃)S₂²S₃² − b(2+G₂₃)S₂²S₃² + 2·S₁²S₃²

C = (1−G₂²)S₂⁴ + (1−H₃²)S₃⁴ − (2+G₂₃)S₂²S₃²
```

### Límite superior (verbatim)

```
A = a²(1−H₂²)S₂⁴ + (1−G₁²)S₁⁴ + b²(1−G₃²)S₃⁴
  + a(2+H₂₁)S₂²S₁² + ab(2+H₂₃)S₂²S₃² + b(2−H*₁₃)S₁²S₃²

B = −2a(1−H₂²)S₂⁴ + 2b(1−G₃²)S₃⁴ − (2+H₂₁)S₂²S₁²
  + a(2+H₂₃)S₂²S₃² − b(2+H₂₃)S₂²S₃² + (2−H*₁₃)S₁²S₃²

C = (1−H₂²)S₂⁴ + (1−G₃²)S₃⁴ − (2+H₂₃)S₂²S₃²
```

Aquí `H*` va **sin el 0.5**, igual que en la variante cruzada sin interacción.

### Segundo método (verbatim)

```
γ̂₁ = I·S₂²      m₁ = n₂
γ̂₂ = I·S₃²      m₂ = n₃
γ̂₃ = S₁² + (I−1)S₂² + (IK−1)S₃²        ← ver errata 10
m₃ = γ̂₃² / ( S₁⁴/n₁ + (I−1)²S₂⁴/n₂ + (IK−1)²S₃⁴/n₃ )
```

### `a` y `b` no están publicados

La notación de la página anidada define `H_q`, `G_q`, `H_qr`, `G_qr`, `I`, `J` y
`K`, y **nada más**: ni `a`, ni `b`. Se derivan del `γ̂₃` impreso en su propio
segundo método, que es la misma combinación lineal que la cuadrática necesita:

```
a = I − 1        b = I(K−1)        (el coeficiente de S₁² es 1)
multiplicador = I
```

Con eso `W = S₁² + (I−1)S₂² + I(K−1)S₃² = I·K·σ²_total`, y `I·D/W` reproduce la
razón puntual. Verificado contra los valores esperados de los cuadrados medios y
en el límite sin incertidumbre. La página no imprime multiplicador — mismo caso
que la variante cruzada con interacción (errata 4).

Nótese que `J` no aparece en `γ̂₃`: la combinación vale `I·K·σ²_total`
independientemente del número de operadores. Es correcto y sirve de control.

---

## 5. Erratas detectadas en la fuente

Cada una con la comprobación que la demuestra. Ninguna se «arregló por
parecido»: o hay álgebra que la decide, o se dejó como está y se anotó.

| # | Dónde | Qué dice | Qué debe decir | Cómo se sabe |
|---|---|---|---|---|
| 1 | Notación, tabla de términos | `MSRéplicas = S₃⁴` | `MSRéplicas = S₄²` | Choca con `MSParte*Operador = S₃²` dos líneas antes, y con el uso de `S₄²` con `n₄` en todas las fórmulas |
| 2 | IC de la varianza total | `σ̂²_Total = [I·S₁² + J·S₂² + (IJ−I−J)S₃² **−** IJ(K−1)S₄²] / IJK` | `+ IJ(K−1)S₄²` | Con `+` reproduce σ²_total exactamente contra los valores esperados de los cuadrados medios; con `−` da otra cosa. Y el `γ̂₃` del segundo método, en la misma página, lleva `+` |
| 3 | Multiplicador de parte/total | «L es igual a **J** veces la solución más pequeña» | **I** veces | Con `G,H → 0` la cuadrática tiene raíz doble `D/W`; sólo `I·D/W` reproduce `σ²_parte/σ²_total`. Con `J` no. El mismo texto **sí** es correcto en la sección de reproducibilidad/operador, donde `J` es el multiplicador legítimo: es un copiar y pegar entre secciones. La página en-us dice «J times» igual, así que cotejar el inglés no lo habría cazado |
| 4 | Parte/total, variante con interacción | No imprime multiplicador: da `(−B ± √(B²−4AC))/2A` a secas | Le falta el factor `I` | Mismo argumento que la 3 |
| 5 | Coeficiente `c` | La tabla publica sólo `c = (IJ − I − J)` | Sin interacción, `c = (IJK − I − J)` | Lo confirma el `γ̂₃` impreso de la variante sin interacción. Ojo: `c` es un coeficiente de combinación lineal, **no** unos grados de libertad — sin interacción `n₃ = IJK−I−J+1`, que es otro número |
| 6 | `C` del límite superior | Con interacción `(2+H₁₃)`; sin interacción `2(1+H₁₃)` | `(2+H₁₃)` en las dos | `2(1+H₁₃) ≠ (2+H₁₃)`. Se toma la forma simétrica de `C` del límite inferior, que lleva `(2+G₁₃)`. **El límite asintótico no discrimina** entre las dos lecturas (ambas tienden a 2), así que esto es una decisión razonada, no una demostración |
| 7 | Término cruzado del límite superior | Con interacción `(2 − 0.5H*₂₃)`; sin interacción `(2 − H*₂₃)` | Sin resolver | Ocupan el mismo lugar estructural. Se implementa cada variante como está impresa. Con `H* = 0`, que es la elección por omisión, el punto es irrelevante |
| 8 | Encabezado «Con término Operador» | `parte/total = 1 − (repetibilidad/total)` | Debería decir «**Sin** término Operador» | Esa identidad exige `σ²_total = σ²_parte + σ²_repetibilidad`, es decir sin operador y sin interacción. Con operador, `1 − repetibilidad/total` da `(parte+operador+interacción)/total` |
| 9 | Reglas «1 − (…)» | `LI = 1 − (LI de …)`, `LS = 1 − (LS de …)` | Los límites se **intercambian** | `1 − x` es decreciente: tomado al pie de la letra devuelve un intervalo invertido |

**10. Anidado, `γ̂₃` del segundo método.** La página imprime
`γ̂₃ = S₁² + (I−1)S₂² + (IK−1)S₃²`. Con `(IK−1)` la combinación **no** vale
`I·K·σ²_total`: el coeficiente de σ²_E sale `I + IK − 1` en vez de `IK`. Debe
ser **`I(K−1)`**, y entonces la identidad es exacta. Es otra confusión entre `I`
y `1`, que en esa tipografía se parecen — la misma familia que la errata 3.
Verificado numéricamente en `tests/tests-mls.js`.

### Y una que no es errata de la fuente, sino de cómo leerla

**La descripción «la solución más pequeña / más grande» no generaliza.** El
texto describe los límites así, pero además imprime las dos fórmulas cerradas.
Las dos descripciones coinciden **sólo si A > 0**, y `A` se vuelve negativa en
cuanto hay pocos operadores: con `J = 3` son 2 grados de libertad, `H₂` pasa de
38 y el término `b²(1−H₂²)S₂⁴` arrastra `A` por debajo de cero. Medido sobre el
conjunto AIAG de 10×3×3, con el GPQ como tercero independiente:

```
min/max          %GRR [ 0.0, 100.0]   <- inservible, todo contra los topes
fórmula impresa  %GRR [14.7,  81.4]
GPQ              %GRR [14.9,  81.7]
```

Se implementa la fórmula. El texto describe el caso `A > 0`.

---

## 6. La constante no publicada: `H*`

`H*_qr` aparece en el límite superior de parte/total y **no está definida en
ninguna de las dos páginas de notación de Minitab**. Las dos definen `H_q`,
`G_q`, `H_qr` y `G_qr`, y nada más. Tampoco aparece en el documento técnico de
referencia. Es una laguna documental real, no un descuido de la transcripción.

**Dónde cae el hueco, que es lo que decide su gravedad:**

```
%GRR superior = 100·√( 1 − LI(parte/total) )   ← sólo G y G_qr. Sin H*.
%GRR inferior = 100·√( 1 − LS(parte/total) )   ← depende de H*.
```

El límite **superior** del %GRR, que es el que decidiría si un gage se rechaza,
sale del límite **inferior** de parte/total, enteramente publicado. El hueco
afecta sólo al límite inferior, que es informativo.

**Cómo se eligió.** Por cobertura medida, no por parecido tipográfico. Como `H*`
sólo mueve un extremo, la cobertura global no distingue entre candidatos: lo que
discrimina es la tasa de fallo **por debajo**, que al 95 % bilateral debe valer
2.50 %. Un candidato muy por debajo regala anchura; uno por encima miente sobre
su propia confianza. Con 3 000 estudios por caso (`node tests/mls-cobertura.js`):

| caso | razón real | `H*=0` | `H*=H_qr` | `H*=H_q·H_r` |
|---|---|---|---|---|
| 10×3×3 con interacción | 8.00 % | **2.70 %** | 5.53 % | 0.17 % |
| 10×3×3 sin interacción | 6.76 % | **2.60 %** | 5.23 % | 0.10 % |
| 5×3×2 estudio chico | 2.16 % | **3.17 %** | 5.50 % | 0.03 % |
| 25×4×3 estudio grande | 2.54 % | **2.63 %** | 3.10 % | 0.27 % |
| 10×3×3 gage malo | 26.20 % | **2.37 %** | 7.37 % | 0.10 % |
| 25×4×3 gage pésimo | 53.92 % | **3.20 %** | 4.30 % | 0.03 % |

`H* = 0` es el único que se mantiene cerca del 2.50 % nominal. `H_qr` es
claramente anticonservador — hasta 7.37 % donde debería haber 2.50 %, o sea un
intervalo que dice 95 % y entrega bastante menos. El producto `H_q·H_r` es tan
conservador que el límite inferior deja de informar de nada.

**Con `H* = 0` el término degenera en el mismo `2bc` pelado que lleva el límite
inferior**, que es además la lectura que no inventa una corrección desconocida,
y vuelve irrelevante la errata 7.

Esto queda **abierto**: si algún día se consigue Burdick & Graybill (1992) o
BBM (2005) cap. 3-4, hay que cotejar `H*_qr` y rehacer la medición. La elección
actual es empírica y está rotulada como tal en `mls.js` y en la interfaz.

---

## 7. Validación de la implementación

Cuatro comprobaciones independientes, en `tests/tests-mls.js` y
`tests/mls-cobertura.js`:

1. **Límite sin incertidumbre.** Con grados de libertad enormes, `G,H → 0`, la
   cuadrática degenera en raíz doble y el intervalo colapsa sobre el estimador
   puntual. Es la prueba que fijó el multiplicador `I`.
2. **Concordancia con un tercero independiente.** El GPQ es otro método
   publicado, con otra matemática. Anchuras medianas del intervalo del %GRR
   sobre los mismos estudios:

   | diseño | MLS | GPQ |
   |---|---|---|
   | 10×3×3 con interacción | 43.3 pp | 43.5 pp |
   | 10×3×3 sin interacción | 40.9 pp | 40.4 pp |
   | 10×4×3 | 29.9 pp | 30.8 pp |
   | 10×5×3 | 26.6 pp | 27.2 pp |
   | 25×4×4 | 21.9 pp | 21.2 pp |

   Ningún intervalo tocando los topes de truncamiento. Ésta es la prueba que
   cazó la regla de selección de raíz.
3. **Cobertura.** Al 95 % nominal, la cobertura medida queda en torno al 96 %
   (conservadora, como se espera del MLS), con las tasas de fallo por cola de la
   tabla anterior.
4. **Invariantes de rango** de `G` y `H`, que delatan una cola de χ² invertida.

**El modelo anidado**, medido aparte (2 500 estudios por caso, 95 % nominal):

| diseño | razón real | cobertura | fallo abajo | fallo arriba | ancho MLS | ancho GPQ |
|---|---|---|---|---|---|---|
| 5×3×3 | 6.76 % | 95.1 % | 2.20 % | 2.68 % | 91.3 pp | 75.2 pp |
| 10×3×3 | 6.76 % | 94.4 % | 2.96 % | 2.60 % | 82.9 pp | 67.9 pp |
| 5×3×2 | 2.16 % | 95.0 % | 2.56 % | 2.44 % | 91.4 pp | 82.5 pp |
| 10×4×3 | 16.67 % | 95.3 % | 2.96 % | 1.76 % | 58.3 pp | 49.0 pp |
| 8×3×3 gage malo | 29.82 % | 96.2 % | 3.04 % | 0.80 % | 63.8 pp | 54.4 pp |

Cobertura en el nominal con las dos colas repartidas, que es el respaldo de los
coeficientes derivados `a = I−1`, `b = I(K−1)`: unos coeficientes equivocados
sesgarían la cobertura, y no lo hacen. A diferencia del cruzado, aquí el MLS no
reproduce al GPQ — es más ancho—, así que la concordancia no sirve de prueba y
la carga la lleva la cobertura.

**Sobre la limitación 3 de la auditoría** (sub-cobertura del anidado, 86-88 %
frente al 90 % nominal): con MLS, en la misma corrida de
`tests/evidencia-f07.js cobertura`, el anidado 10×3×3 pasa de 89.5 % a 90.0 % y
el 5×3×2 de 87.3 % a 88.3 %. Mejora, pero **no la resuelve**: el 5×3×2 sigue por
debajo del nominal. Cambiar de método no era la causa entera.

**Lo que estas validaciones no dicen.** Todas simulan datos con el mismo modelo
que el método asume: normales, balanceados, efectos aleatorios independientes.
Validan la aritmética del intervalo, no su comportamiento fuera del modelo. Y
ninguna es una comparación contra una salida real de Minitab, que sigue siendo
la prueba que faltaría para cerrar el asunto del todo.

---

## 8. Lo que queda pendiente

- **`H*_qr`**: Minitab lo usa y no lo define en ninguna de las tres páginas.
  Resuelto por cobertura medida y rotulado como elección empírica.
- **Un cotejo contra una corrida real de Minitab.** Es la validación que sigue
  faltando: las cuatro comprobaciones de arriba son internas o contra el GPQ,
  ninguna contra el programa cuyas fórmulas se transcribieron. Basta una corrida
  del ejemplo AIAG con intervalos al 95 %, y otra de un estudio anidado.
- **Las «dos condiciones de existencia»** de la razón repetibilidad/total, que
  esta implementación no necesita pero completarían la transcripción.
- **El intervalo de %Tolerance**, cuyo denominador no es `V_Total` y por tanto no
  se deriva de esta razón.
- **La anchura del anidado.** El MLS anidado sale unos 15 pp más ancho que el
  GPQ y su límite inferior toca el cero a menudo. La cobertura medida lo
  respalda (95.0-96.2 % al 95 % nominal, con las dos colas cerca del 2.5 %), así
  que no hay indicio de error, pero es el punto que más ganaría con el cotejo
  contra Minitab.
