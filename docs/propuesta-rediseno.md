# Propuesta de rediseño: «el reporte de laboratorio sobre papel»

> **Propuesta, no estado actual.** La aplicación publicada sigue la hoja de
> siempre y el contrato vigente es [`estandar-de-diseno.md`](estandar-de-diseno.md).
> Esta propuesta se puede **ver funcionando** en
> [`propuesta/`](../propuesta/) — la misma app, el mismo motor y el mismo
> HTML, con una hoja de estilo encima — y compararla con la versión actual.

Fecha: 3 de octubre de 2026.

Referencias:

- **Estilo Steep** (documento de estilo entregado como referencia): analítica
  presentada como editorial. Titulares serif de peso regular sobre papel
  blanco, un sistema casi acromático con un único acento durazno
  (`#fbe1d1` / siena `#5d2a1a`), botones píldora, tarjetas planas de radio
  grande y sombra solo en lo que «flota».
- **Skill ui-ux-pro-max** ([nextlevelbuilder/ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)).
  Su generador de sistema de diseño, consultado con «engineering quality
  measurement analysis tool», clasifica el producto como *Data-Dense
  Dashboard* y devuelve la lista de entrega que se usó como criterio de
  aceptación: contraste de texto ≥ 4.5:1, foco visible para teclado,
  `prefers-reduced-motion`, iconos SVG y no emoji, `cursor: pointer` en lo
  clicable, y responsive a 375 / 768 / 1024 / 1440 px.

---

## 1. Por qué

La pantalla de hoy funciona y está muy medida —el estándar de diseño documenta
cada decisión—, pero visualmente es una aplicación de formulario genérica:

| Lo que se ve hoy | Qué cuesta |
|---|---|
| La barra superior se parte en **dos renglones** incluso a 1440 px, con seis botones del mismo peso (Ejemplo, Importar, Exportar, Recalcular, Imprimir y el tema) | El ojo no encuentra la acción que importa; la barra fija se come 110 px de alto |
| El azul corporativo marca botones, insignias de paso, pestañas, enlaces y los mensajes de información | El color deja de significar algo: compite con el semáforo, que es el único color que **codifica** |
| Todos los títulos a 13.5 px / 600, todas las tarjetas con el mismo borde | No hay jerarquía entre «Configuración», «Evaluación del sistema de medición» y «Indicadores complementarios» |
| El dictamen (`27.86 %`) en la misma sans que todo lo demás | El número que se firma no se distingue del resto |

El producto de MSA Toolkit es un **dictamen que alguien firma e imprime**.
Steep convierte un tablero en una revista; aquí se propone convertir el banco
de trabajo en un **reporte de laboratorio**: papel blanco, titulares serif que
se leen como un documento, la cifra que decide en serif grande, y toda la
maquinaria de captura en un plano gris quieto.

## 2. Antes y después

| Antes | Después |
|---|---|
| ![Antes, cruzado](propuesta-rediseno/antes-cruzado-claro.png) | ![Después, cruzado](propuesta-rediseno/despues-cruzado-claro.png) |
| ![Antes, vacío](propuesta-rediseno/antes-vacio.png) | ![Después, vacío](propuesta-rediseno/despues-vacio.png) |
| ![Antes, atributos](propuesta-rediseno/antes-atributos-claro.png) | ![Después, atributos](propuesta-rediseno/despues-atributos-claro.png) |
| ![Antes, oscuro](propuesta-rediseno/antes-cruzado-oscuro.png) | ![Después, oscuro](propuesta-rediseno/despues-cruzado-oscuro.png) |
| ![Antes, teléfono](propuesta-rediseno/antes-movil.png) | ![Después, teléfono](propuesta-rediseno/despues-movil.png) |

Reporte impreso (portada, dictamen y gráficas):

![Antes, impreso](propuesta-rediseno/antes-impreso.png)
![Después, impreso](propuesta-rediseno/despues-impreso.png)

Todas las capturas usan el ejemplo AIAG (en cruzado con LSL = −3 y USL = 3)
a 1440 × 900, salvo la de teléfono (390 px).

## 3. Sistema

### 3.1 Color

Regla madre, heredada de Steep y endurecida para esta herramienta: **en
pantalla solo tiene color lo que codifica algo** (el semáforo AIAG, los
avisos ámbar y rojo) **o la marca, una vez**. Todo lo demás es tinta sobre
papel.

| Rol | Hoy | Propuesta (claro) | Propuesta (oscuro) |
|---|---|---|---|
| Canvas | `#f6f7f9` | `#ffffff` Paper | `#121315` |
| Banda del panel de resultados | `#f0f2f5` | `#fafafb` Fog | `#161719` |
| Tarjeta de captura | blanca + borde | `#f2f2f3` Mist, sin borde | `#222326` |
| Tarjeta de resultado | blanca + borde | `#ffffff` + hairline `#ececec` | `#1a1b1e` + `#2a2b2f` |
| Tinta | `#1c2430` | `#17191c` | `#ececed` |
| Tinta suave | `#5a6673` | `#5f636c` | `#a6a9b1` |
| Tinta tenue | `#8b959f` | `#6a6d75` | `#8d9098` |
| Acción primaria | azul `#0b5cad` | **tinta** `#17191c`, texto blanco | `#ececed`, texto tinta |
| Información e interpretación | azul claro con borde | Mist con tinta, sin borde | Mist oscuro |
| Acento de marca | — | `#fbe1d1` / `#5d2a1a` | `#3a2419` / `#f3c9b1` |
| Semáforo `--sem-*` | `#2e9e63` `#e0a63a` `#d1453b` | **sin cambio** | **sin cambio** |

Contraste medido (WCAG, texto normal):

| Par | Claro | Oscuro |
|---|---|---|
| Tinta sobre papel | 17.6 | 14.6 |
| Tinta suave sobre papel / Mist | 6.0 / 5.4 | 7.3 / 6.7 |
| Tinta tenue sobre papel / Mist | 5.2 / 4.6 | 5.4 / 4.9 |
| Siena sobre durazno | 9.3 | 9.5 |
| Ámbar sobre su fondo | 4.6 | 6.7 |

El *Slate* de Steep (`#777b86`) da 4.3:1 sobre blanco: se oscureció hasta
pasar 4.5:1 también sobre Mist, que es donde viven los rótulos de la captura.

**El durazno no se acerca al semáforo.** `#fbe1d1` y el fondo ámbar de los
avisos (`--warn-soft`) son vecinos en el círculo cromático; juntos, el
acento de marca se leería como una advertencia. Por eso el durazno vive en un
solo sitio —el estado vacío de resultados— y desaparece en cuanto hay un
dictamen en pantalla.

### 3.2 Tipografía

| Familia | Sustituye a | Dónde | Por qué |
|---|---|---|---|
| **Source Serif 4** (variable, OFL) | Signifier | Marca, títulos de paso y de tarjeta, la cifra que decide, títulos de gráfica, portada impresa | Serif de texto con números de caja alta tabulares; peso **400 siempre**, como pide Steep |
| **Inter** (variable, OFL) | Söhne | Todo lo demás: UI, cuerpo, tablas, celdas | Admite los medios pesos de Söhne (430, 480, 520, 560) y cifras tabulares, así que las tablas dejan la monoespaciada sin perder alineación |

| Elemento | Hoy | Propuesta |
|---|---|---|
| Marca | 16 px / 700 sans | 22 px serif, «MSA *Toolkit*» |
| Título de paso | 13.5 px / 600 | 21 px serif, numeral en cursiva tenue |
| «Resultados en vivo» | 13.5 px / 600 | 26 px serif |
| Título de tarjeta | 13.5 px / 600 | 22 px serif |
| Cifra que decide (`.lead-v`) | 30 px / 600 sans | **50 px serif 400**, tracking −0.025em |
| Cifras de apoyo | 17–21 px / 600 | 23–27 px serif 400 |
| Cuerpo | 15 px | 14.5 px / 430 |
| Celdas numéricas | monoespaciada 12 px | Inter 13 px `tabular-nums` |

Las fuentes van **autoalojadas** en `assets/fonts/` (subconjunto latino,
≈150 kB en total, licencia en `assets/fonts/OFL.txt`): la app funciona sin
conexión y eso no se negocia. Si no cargan, el respaldo es `ui-serif, Georgia`
y el stack de sistema de hoy.

### 3.3 Forma y elevación

| | Hoy | Propuesta |
|---|---|---|
| Botones | radio 6 | píldora (999 px) |
| Tarjeta de captura | radio 10, borde | radio 20, sin borde ni sombra |
| Tarjeta de resultado | radio 10, borde | radio 24, hairline |
| Campos | radio 6 | radio 10 |
| Celdas de la rejilla de captura | radio 6 | radio 8 |
| Mensajes | radio 8 | radio 14 |
| Sombra | ninguna | **solo el dictamen** («Evaluación del sistema de medición / de clasificación») |

Steep pide radios de 16 px o más en todo; en una rejilla de 90 celdas de 30 px
de alto eso las vuelve píldoras y se pierde la lectura de tabla. Es la
desviación consciente más visible respecto a la referencia.

### 3.4 Componentes

- **Barra superior → cabecera de publicación.** A la izquierda la marca y,
  debajo, una línea de fecha con el estudio citado y su tamaño
  («Gage R&R · Crossed ANOVA · 3 operadores x 10 piezas…»). Al centro el
  selector de método en un riel píldora. A la derecha: Ejemplo AIAG, Importar
  y Exportar como **botones de texto**; el tema como dos iconos SVG (sol y
  luna) con nombre accesible; y al final **el par de Steep**, Recalcular
  (fantasma) + Imprimir / PDF (relleno). Cabe en **un renglón desde 1200 px**:
  lo que cede es la línea del estudio, con puntos suspensivos.
- **Pasos.** La insignia azul monoespaciada se sustituye por el numeral en
  cursiva serif tenue junto al título serif. Sigue alineada al centro (§1 del
  estándar) y la flecha de plegar pasa a un chevron dibujado con CSS.
- **El dictamen flota.** Es la única tarjeta con sombra —el «artefacto
  flotante» de Steep— sobre la banda Fog. La cifra que decide sube a 50 px
  serif; la escala, los umbrales, el carril del intervalo y sus medidas
  enteras **no cambian**.
- **Tablas como libro.** Se conservan las reglas superior e inferior en tinta
  (estilo *booktabs*), los encabezados pasan a versalitas espaciadas y las
  cifras a Inter tabular.
- **Información en tinta.** `.msg.info`, `.interp` y `.note` pasan de azul a
  Mist con tinta. Ámbar y rojo siguen siendo los únicos mensajes con color, y
  por eso se leen.
- **Estado vacío editorial.** Antes de calcular, el panel de resultados
  muestra el único durazno de la pantalla: «Antes de confiar en una medición,
  mide *al que mide*», con Cargar ejemplo AIAG (relleno siena) e Importar CSV
  (fantasma). Hoy ese hueco es una línea de texto gris.
- **Gráficas.** La paleta de series pasa de siete colores saturados a tinta,
  terracota, acero, ocre, ciruela, verde agua y gris (variante clara para el
  tema oscuro). Los umbrales siguen siendo los del semáforo. Títulos de
  gráfica en serif.
- **Foco y movimiento.** Foco visible de 2 px en tinta con anillo suave en
  los campos; transiciones de 160 ms en botones y pestañas, desactivadas con
  `prefers-reduced-motion`.

### 3.5 Teléfono

La barra fija se comía dos tercios de la pantalla (238 px de 844). En la
propuesta, por debajo de 760 px la barra **se desplaza con la página**, la
marca ocupa su propio renglón y el selector de método va al final, a todo el
ancho. Sigue siendo alta; el paso siguiente (fase 2) es agrupar Ejemplo,
Importar y Exportar en un menú «Archivo».

### 3.6 Reporte impreso

Es donde el estilo rinde más: la portada con título serif de 26 pt, metadatos
en Inter, las secciones con título serif y regla en tinta, y las gráficas en
la paleta nueva. Se mantienen `print-color-adjust: exact` para el semáforo y
todas las reglas del §7 del estándar; la hoja nueva devuelve a papel blanco
las bandas y bordes que la pantalla añade.

## 4. Lo que NO cambia

La propuesta es una capa de presentación. Por diseño no toca:

- **Ningún número.** El motor, los datasets y las 230 pruebas son los mismos;
  la maqueta corre los mismos archivos de `assets/js/`.
- **El semáforo** (`--sem-*`), sus umbrales y su independencia del tema.
- **El carril del intervalo** y todas sus medidas enteras y pares.
- **La estructura**: banco de dos columnas 40/60, pasos numerados, tarjetas
  plegables, pestañas con Gráficas primero, `data-methods`, rejillas
  `auto-fill`.
- **La redacción** de la interfaz, salvo el estado vacío y la línea del estudio.
- **El orden y las reglas del reporte impreso.**

## 5. Desviaciones conscientes de Steep

| Steep dice | Aquí | Por qué |
|---|---|---|
| 97 % acromático, ningún color fuera del par durazno/siena | Semáforo, ámbar y rojo se quedan | Codifican información (§3 del estándar). Es la excepción más importante |
| Radio ≥ 16 px en todo | 8 px en celdas de captura, 10 px en campos | Densidad: 90+ celdas |
| Display de 64–90 px | Máximo 50 px (la cifra que decide) | Es una herramienta, no una portada; 90 px no caben en el 60 % de la pantalla |
| Solo tema claro | Tema oscuro «papel de noche» | El estándar exige dos temas |
| Cada botón relleno con su fantasma al lado | Solo en la barra y en el estado vacío | En la captura los botones ya van en pareja por consecuencia (Regenerar / Reiniciar) |
| Botón destructivo no existe | Rojo sólido, ahora píldora | §3 del estándar: un botón pesa lo que pesa su consecuencia |

## 6. Qué cambiaría en el estándar de diseño

Si se adopta, [`estandar-de-diseno.md`](estandar-de-diseno.md) cambia en:

| Sección | Cambio |
|---|---|
| §1 Pasos numerados | La insignia `.step` deja de ser un cuadro de color: numeral serif en cursiva, `--ink-faint`, del tamaño del título |
| §1 Espaciado | Radios 20 / 24 / 10 / 8 y relleno de tarjeta 20–28 px (tabla de §3.3) |
| §1 Selector de método | Riel píldora; la regla de familias y rótulos no cambia |
| §2 El bloque de resultado | Cifra que decide en serif 50 px / 400; las de apoyo en serif 23–27 px |
| §3 Color | Acción primaria en tinta; información en Mist; nuevo token de marca con la regla «una vez por pantalla y nunca junto al semáforo» |
| §3 nuevo | Tipografía: dos familias autoalojadas, serif solo a 400 |
| §4 Gráficas | Paleta de series nueva vía `--chart-series` |
| §5 Redacción | Sin cambios |

Las secciones 6 a 10 no cambian.

## 7. Cómo está hecha la maqueta

| Archivo | Qué |
|---|---|
| [`assets/css/propuesta.css`](../assets/css/propuesta.css) | La propuesta entera: tokens claro/oscuro y componentes. Se carga **después** de `style.css` y solo en la maqueta |
| [`propuesta/index.html`](../propuesta/index.html) | **Generado**, no copiado: `node tools/build-propuesta.js` lo arma desde `index.html`, cambia las rutas, añade la hoja y reescribe la barra y el estado vacío. Si `index.html` cambia y una sustitución deja de encontrar su texto, el script falla y dice cuál. `--check` dice si está al día |
| `assets/fonts/` | Inter y Source Serif 4, woff2 latino, con su licencia OFL |
| [`assets/js/charts.js`](../assets/js/charts.js) | Único cambio en código de producción: lee la paleta de `--chart-series` si la hoja la define. Sin el token queda la paleta de siempre, y `tests/regresion-visual.js` confirma que cruzado y anidado se ven **idénticos** a la revisión anterior, gráficas y reporte impreso incluidos |

Limitación conocida: abierta con doble clic (`file://`), Firefox no carga
fuentes de una carpeta superior y la maqueta cae a las fuentes de sistema.
Servida por GitHub Pages o por cualquier servidor local se ve completa.

## 8. Adopción por fases

1. **Fase 1 — tokens y tipografía.** Pasar a `style.css` los tokens, las dos
   familias y la serif en títulos y cifras. Es el 80 % del cambio visible y no
   toca HTML. Correr `tests/regresion-visual.js` en los tres métodos: el
   cambio de pantalla y de reporte impreso es esperado; el de los valores, no.
2. **Fase 2 — barra y estado vacío.** Mover a `index.html` la cabecera de
   publicación, los botones de texto, los iconos de tema y el estado vacío.
   Agrupar Ejemplo / Importar / Exportar en un menú «Archivo» en teléfono.
3. **Fase 3 — estándar.** Reescribir las secciones de la tabla del §6 de este
   documento en `estandar-de-diseno.md`, regenerar `docs/portada.png` y
   retirar la maqueta (`propuesta/`, `propuesta.css` y el generador).

## 9. Verificación hecha

- `node tests/run-node.js`: 230/230.
- `node tests/regresion-visual.js HEAD cruzado` y `… anidado`: sin
  diferencias en producción tras el gancho de `charts.js` (atributos no se
  puede recorrer con esa herramienta: su guion llena campos de variables).
- Capturas con Playwright de producción y maqueta en los tres métodos, claro
  y oscuro, a 1440, 1280 y 390 px, y el reporte a PDF: sin desplazamiento
  horizontal, barra en un renglón a 1280 y 1440 px, sin errores de consola,
  ningún rótulo ni opción de `<select>` recortado.
- Contraste de todos los pares de tokens de texto ≥ 4.5:1 (tabla de §3.1).
- De paso aparecieron dos recortes **que ya tiene producción** (§2 del
  estándar: ningún texto de `<select>` cortado): a 1280 px las celdas de
  atributos muestran «No p…», y la opción «CM repetibilidad (ejemplo AIAG
  p.127)» del denominador de F no cabe a ningún ancho. La propuesta los
  corrige —la celda pide 86 px y la tabla se desplaza en su `.table-scroll`;
  el denominador, solo en su fila, la ocupa entera— y conviene llevar esa
  corrección a `style.css` aunque el rediseño no se adopte.
