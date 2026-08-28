# MSA Toolkit

Herramientas de análisis de sistemas de medición (MSA) que corren enteramente en
el navegador. Sin backend, sin instalación, sin licencias. Pensado para
reemplazar el libro de Excel con macros que se usaba para los estudios Gage R&R.

**Método disponible hoy:** Gage R&R por **ANOVA cruzado** (crossed, dos factores
con efectos aleatorios). Es el mismo método del libro original, con el motor de
cálculo corregido y validado.

## Cómo se usa

1. **Configuración** — número de operadores, piezas y réplicas, con nombres
   editables.
2. **Captura** — se genera la tabla; escribes las mediciones o pegas un bloque
   copiado de Excel directamente en la primera celda.
3. **Resultados** — tabla ANOVA, componentes de varianza, evaluación del sistema
   de medición y las seis gráficas. LSL/USL son opcionales.

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

37 pruebas de regresión. Para correrlas:

```bash
node tests/run-node.js      # en terminal
```

o abre `tests/index.html` en el navegador, que además muestra lado a lado los
resultados del motor corregido y los del motor VBA original.

## Qué se corrigió respecto del Excel

El libro `Gage_RR_Study.xlsm` tenía **12 defectos** en el motor de cálculo. Los
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
assets/js/charts.js      las seis gráficas (Chart.js)
assets/js/app.js         interfaz y flujo
tests/                   suite de regresión + reimplementación del VBA original
datasets/                casos de validación con resultados publicados
docs/                    auditoría del motor de Excel
```

`assets/js/anova.js` no depende del DOM ni de ninguna librería: se puede
importar desde Node o desde otra herramienta tal cual.

## Publicar en GitHub Pages

El sitio es 100 % estático, sin paso de compilación:

1. Fusiona esta rama en `main`.
2. En GitHub: **Settings → Pages → Source: Deploy from a branch**, rama `main`,
   carpeta `/ (root)`.
3. Queda publicado en `https://dflores296.github.io/msa-toolkit/`.

## Hoja de ruta

Los siguientes métodos MSA se irán añadiendo uno por uno, cada uno con sus
propias pruebas de regresión y datasets de validación:

- Promedio y Rango (X̄ & R) con constantes K1/K2/K3
- Estudio Tipo 1 (Cg / Cgk) sobre patrón
- Linealidad y sesgo
- Estabilidad (cartas I-mR del patrón)
- Gage R&R anidado (pruebas destructivas)
- Attribute Agreement (Kappa de Cohen/Fleiss, Kendall)
- Intervalos de confianza para el %GRR (MLS / GPQ)

## Licencia

MIT — ver [LICENSE](LICENSE).
