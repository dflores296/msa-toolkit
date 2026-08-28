# Gage R&R App — especificación para Claude Code

## 1. Qué hace tu Excel actual (ya lo revisé)

Tu archivo implementa un estudio **Gage R&R por método ANOVA cruzado**, prácticamente un clon del "Gage R&R Study (ANOVA Method)" de Minitab. El flujo de las macros es:

1. **Configuración** (`frmConfiguracionEstudio`): formulario para definir # de operadores, # de piezas y # de réplicas (mínimo 2), con nombres editables.
2. **Captura de datos** (`MSA_Datos`): tabla `Corrida | Operador | Parte | Medición` generada automáticamente y llenada a mano.
3. **Validación** (`ValidarDatos`): revisa que no haya celdas vacías o no numéricas antes de calcular.
4. **Promedios** (`CalculoMedias`): calcula medias por pieza (`MP_Calculos`), por operador (`MO_Calculos`) y por combinación operador×pieza (`MPO_Calculos`).
5. **ANOVA** (`CalcularSumasDeCuadrados`): tabla de sumas de cuadrados, grados de libertad y cuadrados medios para Parte, Operador, Interacción Operador×Parte y Repetibilidad.
6. **Varianza** (`CalculoVarianza` → `GenerarTablasAPA_GageANOVA`): pide LSL/USL, calcula componentes de varianza, %Contribución, StDev, Study Variation (6σ), %Study Variation, %Tolerance y NDC (número de categorías distintas).
7. **Gráficas** (`Graficos`, `CrearGraficos`): Componentes de Variación, R por operador (con límites D3/D4), X-barra por operador (con límite A2), promedio por pieza, interacción Operador×Parte, y Study Variation vs Tolerance — el "six-pack" típico de Minitab.

## 2. Stack recomendado

**HTML + CSS + JavaScript puro (vanilla), sin backend, sin build.**

Por qué:
- GitHub Pages solo sirve archivos estáticos — un sitio 100% cliente evita configurar Actions/build (Vite, webpack, etc.) y se publica con un solo push.
- Los cálculos son matemática pura (sumas, promedios, raíces) — no necesitas un framework para eso.
- Es un proyecto de una sola persona manteniéndolo: menos dependencias = menos cosas que se rompan con el tiempo.
- Para las gráficas, usa **Chart.js** cargado desde CDN (`cdn.jsdelivr.net` o `cdnjs.cloudflare.com`) — reemplaza fácilmente las gráficas de barras, líneas y control charts que hace VBA.

Si más adelante quieres algo más "app": Alpine.js (ligero, sin build) es buen siguiente paso. No recomiendo React/Vue para esto — es más complejidad de la que el proyecto necesita.

## 3. Estructura de pantallas

1. **Configuración del estudio**: inputs para # operadores, # piezas, # réplicas (≥2), nombres editables (igual que el UserForm de Excel).
2. **Captura de datos**: tabla generada automáticamente (Operador × Pieza × Réplica) con inputs numéricos para cada medición. Botón "Calcular".
3. **Resultados**:
   - Tabla 1: Componentes de varianza (Fuente, Varianza, %Contribución).
   - Tabla 2: Evaluación del sistema de medición (Fuente, StDev, Study Variation, %Study Variation, %Tolerance).
   - Nota con NDC.
   - Inputs de LSL/USL antes de calcular %Tolerance.
   - Las 5-6 gráficas descritas abajo.
4. Botón para exportar/importar los datos capturados como CSV o JSON (bonus — reemplaza el copy-paste manual en Excel).

## 4. Fórmulas exactas (tal cual las usa tu Excel — replicar sin modificar)

Con `n` = réplicas, `nOp` = # operadores, `nPz` = # piezas, `nTot` = nOp × nPz × n:

**Sumas de cuadrados:**
```
SS_Parte        = nOp * Σ(media_pieza_i - media_global)²
SS_Operador     = nPz * Σ(media_operador_j - media_global)²
SS_Interaccion  = n   * Σ(media_ij - media_operador_j - media_pieza_i + media_global)²
SS_Repetibilidad= Σ(medicion - media_ij)²   [sobre cada medición individual]

gl_Parte = nPz - 1
gl_Operador = nOp - 1
gl_Interaccion = (nOp - 1) * (nPz - 1)
gl_Repetibilidad = nTot - nOp*nPz

MS_x = SS_x / gl_x   (para cada fuente)
```

**Componentes de varianza:**
```
Var_Parte        = max(0, (MS_Parte - MS_Interaccion) / nOp)
Var_Operador     = max(0, (MS_Operador - MS_Interaccion) / nPz)
Var_Interaccion  = max(0, MS_Interaccion - MS_Repetibilidad)
Var_Repetibilidad= MS_Repetibilidad

SD_x = sqrt(Var_x)
SD_Reproducibilidad = sqrt(Var_Operador + Var_Interaccion)
SD_TotalGage         = sqrt(Var_Repetibilidad + Var_Operador + Var_Interaccion)
SD_Study              = sqrt(Var_Repetibilidad + Var_Operador + Var_Interaccion + Var_Parte)

StudyVariation_x = SD_x * 6

%Contribucion_x   = Var_x / Var_Total          (Var_Total = suma de las 4 componentes)
%StudyVariation_x = StudyVariation_x / StudyVariation_Study
%Tolerance_x      = StudyVariation_x / (USL - LSL)

NDC = floor(1.41 * SD_Parte / SD_TotalGage)
```

Fuentes a mostrar en la Tabla 1: Total Gage R&R, Repeatability, Reproducibility, Operator, Operator by Part, Part-to-Part, Total Variation.
Fuentes a mostrar en la Tabla 2: Total Gage, Repeatability, Reproducibility, Operator, Operator by Part, Part-to-Part, Study Variation.

**Constantes de control (idénticas a las del VBA, según # de réplicas):**

| réplicas | D3 | D4 | A2 |
|---|---|---|---|
| 2 | 0 | 3.267 | 1.880 |
| 3 | 0 | 2.574 | 1.023 |
| 4 | 0 | 2.282 | 0.729 |
| 5 | 0 | 2.114 | 0.577 |
| 6 | 0 | 2.004 | 0.483 |
| 7 | 0.076 | 1.924 | 0.419 |
| 8 | 0.136 | 1.864 | 0.373 |
| 9 | 0.184 | 1.816 | 0.337 |
| 10 | 0.223 | 1.777 | 0.308 |

R chart: `LCS = D4 * R̄`, `LCI = D3 * R̄` (R̄ = rango promedio por combinación operador-pieza).
X-barra chart: `LCS = X̄ + A2*R̄`, `LCI = X̄ - A2*R̄`.

## 5. Gráficas a construir (con Chart.js)

1. **Componentes de Variación**: barras agrupadas — %Contribución, %Study Variation, %Tolerance para Total Gage R&R, Repeatability, Reproducibility, Part-to-Part.
2. **R Chart por operador-pieza**: línea con puntos, con líneas horizontales de LCS/LCI/R̄.
3. **X-barra Chart por operador**: línea con puntos, con líneas horizontales de LCS/LCI/X̄.
4. **Promedio de medición por pieza**: línea simple.
5. **Interacción Operador × Pieza**: una línea por operador, eje X = pieza.
6. (Opcional) Study Variation vs Tolerance: barras comparando %Study Variation y %Tolerance por fuente.

## 6. Publicar en GitHub Pages

1. Crear repo público nuevo (`gh repo create gage-rr-app --public --source=. --push` si usas GitHub CLI, o manualmente en github.com).
2. Todo el sitio va en la raíz del repo (o en `/docs`): `index.html`, `style.css`, `app.js` (o módulos separados).
3. En GitHub: Settings → Pages → Source: rama `main`, carpeta `/ (root)` (o `/docs`).
4. Queda publicado en `https://<tu-usuario>.github.io/gage-rr-app/` — sin builds, sin Actions.

---

## Prompt listo para pegar en Claude Code

```
Quiero que construyas una web app estática (HTML + CSS + JavaScript vanilla,
sin framework, sin build step) que replique un estudio Gage R&R por método
ANOVA cruzado, hoy hecho en un Excel con macros VBA porque en mi trabajo nos
quitaron la licencia de Minitab.

Especificación completa (pantallas, fórmulas exactas, constantes D3/D4/A2 y
gráficas requeridas) está en el archivo instrucciones_claude_code.md que te
voy a pasar — replica las fórmulas EXACTAMENTE como están ahí, no las
reinterpretes.

Requisitos:
- HTML + CSS + JS puro, Chart.js vía CDN para las gráficas.
- Todo corre en el navegador, sin backend.
- Formulario de configuración (# operadores, # piezas, # réplicas, nombres
  editables) -> genera tabla de captura de datos -> validación -> botón
  calcular -> tablas de resultados + gráficas, igual que el flujo del Excel.
- Inputs de LSL/USL antes de calcular %Tolerance.
- Exportar/importar los datos capturados como CSV o JSON.
- Diseño limpio y responsive, una sola página.
- Al terminar: inicializa un repo git, prepara el proyecto para publicarse
  en GitHub Pages (todo estático, sin build), y dime los pasos exactos para
  crear el repo en GitHub y activar Pages.
```

Adjunta este archivo `.md` al enviarle el mensaje a Claude Code (o pega su contenido directo en el chat) para que tenga las fórmulas exactas y no tenga que adivinarlas.
