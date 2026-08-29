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
  aplicación lo dice en pantalla en vez de esconderlo.

Se cambia de método desde el selector de la barra, y cada uno tiene su dirección
(`#cruzado`, `#anidado`). Cambiar de método conserva las mediciones capturadas.

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

80 pruebas de regresión entre los dos motores. Para correrlas:

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

Los siguientes métodos MSA se irán añadiendo uno por uno, cada uno con sus
propias pruebas de regresión y datasets de validación. El plan de trabajo —con
el modelo de cada uno, qué se reutiliza y cómo se agrega— está en
**[`docs/plan-siguientes-metodos.md`](docs/plan-siguientes-metodos.md)**:

- Attribute Agreement (Kappa de Cohen/Fleiss, Kendall) — el que sigue
- Promedio y Rango (X̄ & R) con constantes K1/K2/K3
- Estudio Tipo 1 (Cg / Cgk) sobre patrón
- Linealidad y sesgo
- Estabilidad (cartas I-mR del patrón)
- Intervalos de confianza para el %GRR (MLS / GPQ)

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
