# F-07 — Cabos sueltos para trabajar en escritorio

**Para qué sirve.** F-07 está cerrada: el intervalo del %GRR sale por MLS en los
tres modelos, con fórmulas transcritas de Minitab y validación medida. Quedan
cinco cosas que **no se pudieron hacer desde el contenedor** y que hay que
rematar en local. Ninguna bloquea el uso; la primera es la que convierte
«validado internamente» en «verificado contra la fuente».

Estado al 1 de septiembre de 2026: `develop` en `91032f5` y **`main` ya
fusionado** en `6da89cc`, con toda la auditoría dentro. 224 pruebas de motor y
160 comprobaciones de navegador en verde.

---

## 1 · Cotejo contra Minitab · **lo primero**

Es la única validación que falta y la más barata. Todo lo demás que se midió es
interno o contra el GPQ; nada se ha comparado con el programa cuyas fórmulas se
transcribieron.

**Casos 1 y 2 — cruzado.** El dataset es el archivo de ejemplo del propio
Minitab: `gageaiag.mtw` (Archivo → Abrir hoja de trabajo → Datos de muestra).
*Estadísticas → Herramientas de calidad → Estudio de gage → Estudio R&R del
sistema de medición (cruzado)*. En **Opciones**, intervalos de confianza al
**95 %**. Córrelo dos veces: con el ANOVA por omisión (α = 0.25, descarta la
interacción) y forzando la interacción.

**Caso 3 — anidado.** Exporta `datasets/aiag-msa4-anidado.json` a CSV (o usa el
que se generó en la sesión) y corre *Estudio R&R del sistema de medición
(anidado)*, también al 95 %.

Contra esto:

| caso | %StudyVar punto | IC 95 % | %Contrib punto | IC 95 % |
|---|---|---|---|---|
| 1 · cruzado, sin interacción | 27.86 % | **[14.72, 81.35]** | 7.76 % | [2.17, 66.18] |
| 2 · cruzado, interacción forzada | 28.75 % | **[14.53, 81.30]** | 8.27 % | [2.11, 66.10] |
| 3 · anidado | 20.21 % | **[0.00, 80.76]** | 4.08 % | [0.00, 65.23] |

**Cómo leer el resultado.** Si coinciden, las diez erratas corregidas quedan
confirmadas por el propio programa cuyo texto se corrigió. Si no coinciden, la
diferencia dice dónde mirar:

| dónde falla | primer sospechoso |
|---|---|
| sólo el **límite inferior** del %GRR | `H*` (elegido por cobertura, no por fuente) o el multiplicador |
| sólo el **límite superior** | la selección de raíz de la cuadrática |
| **los dos**, y en los tres casos | los coeficientes `a, b, c, d` o la convención de percentil de `G`/`H` |
| **sólo el anidado** | `a = I−1`, `b = I(K−1)`, que son **derivados**, no leídos |

Si la salida trae además el intervalo de los **componentes en unidades
absolutas**, guárdalo: valida de paso la errata del signo en σ²_Total.

**Qué actualizar con el resultado**, sea cual sea: la sección 7 de
[`mls-transcripcion.md`](mls-transcripcion.md) y el recuadro de F-07 en
[`auditoria-2026-08-31.md`](auditoria-2026-08-31.md). Los valores de regresión
viven en `tests/tests-mls.js`, prueba «AIAG, valor de regresión del intervalo».

---

## 2 · `H*_qr`, la constante que Minitab usa y no define

No aparece en ninguna de las tres páginas de notación. Está resuelta
**empíricamente**: `H* = 0`, elegida por tasa de fallo por cola entre tres
candidatos, y rotulada como tal en `mls.js`.

Se cierra de verdad con **Burdick & Graybill (1992)**, *Confidence Intervals on
Variance Components*, o **Burdick, Borror & Montgomery (2005)** cap. 3-4. Si
consigues cualquiera de los dos: copia la definición, ponla en `H_STAR` como
cuarto candidato y vuelve a correr `node tests/mls-cobertura.js`. Si la cobertura
mejora, cambia el valor por omisión; si empeora, deja `zero` y anótalo.

Alcance del hueco, que es lo que lo hace tolerable: **sólo mueve el límite
inferior del %GRR**. El superior —el que decidiría un rechazo— no lo toca, y hay
una prueba que falla si algún día lo hiciera.

---

## 3 · Las «dos condiciones de existencia» de repetibilidad/total

La sección de esa razón menciona dos condiciones que, si no se cumplen, mandan
el cálculo a Satterthwaite aunque la cuadrática tenga solución. Son imágenes que
no se capturaron. **La razón parte/total no las usa**, así que no afectan al
%GRR; completarían la transcripción. Ahí es donde debe vivir la `e = I − 1` que
la tabla de notación publica y que no se usa en ninguna parte.

---

## 4 · Intervalo de % Tolerance

Sigue sin intervalo, y no es olvido: su denominador es la tolerancia de
especificación, no `V_Total`, así que **no es una transformación de la razón** y
no se puede derivar del intervalo que ya existe. Necesita su propia referencia
publicada. La interfaz imprime «Pendiente de referencia validada».

---

## 5 · La anchura del anidado

En el anidado el MLS sale unos **15 pp más ancho** que el GPQ y su límite
inferior toca el cero a menudo — de ahí el `[0.00, 80.76]` del caso 3. La
cobertura medida lo respalda (95.0-96.2 % al 95 % nominal, con las dos colas
cerca del 2.5 %), y es coherente con lo que la literatura dice del MLS con pocos
operadores. **No hay indicio de error**, pero es lo que más ganaría con el
cotejo del punto 1.

Relacionado: la **limitación 3** de la auditoría (sub-cobertura del anidado)
mejora con MLS pero no desaparece — el 10×3×3 pasa de 89.5 % a 90.0 % y el
5×3×2 de 87.3 % a 88.3 %, contra 90 % nominal. Cambiar de método no era la causa
entera. Queda como limitación registrada, no como hallazgo abierto.

---

## Para correr las pruebas en local

```bash
node tests/run-node.js            # 224 pruebas de motor, sin dependencias

npm i playwright@1.56.0           # esa version: es la que casa con el Chromium
npx playwright install chromium   # (en local, si no lo tienes ya)
node tests/prueba-impresion.js    # 75
node tests/prueba-diseno.js       # 50
node tests/prueba-frescura.js     # 35

node tests/mls-cobertura.js       # evidencia regenerable de H* y de la cobertura
node tests/evidencia-f07.js       # el informe largo de F-07
node tests/regresion-visual.js <rev> [metodo]   # que un cambio no movio la pantalla
```

---

## Y lo que no es F-07

Cerrar F-07 no cierra la auditoría: quedan **quince hallazgos pendientes**, dos
de ellos P1 — **F-14** (inyección de fórmulas en el CSV exportado) y **F-15**
(«validado contra AIAG» afirmado para los tres métodos, cuando sólo el cruzado
lo está). La lista completa, en
[`auditoria-2026-08-31.md`](auditoria-2026-08-31.md).

Y si hay que deshacer algo de F-07, el mapa de commits y los puntos de retorno
están en [`f07-commits.md`](f07-commits.md). Resumen de la advertencia: no uses
`git revert` sobre un commit intermedio.
