# Estandar de diseno de MSA Toolkit

Fotografia del diseno tal como quedo al terminar los metodos **Gage R&R (ANOVA
cruzado)** y **Gage R&R (ANOVA anidado)**. Sirve como contrato para los metodos
que siguen: cada metodo nuevo se ve, se lee y se comporta como estos, o cambia
este documento primero.

Regla general: **un metodo nuevo no inventa lenguaje visual**. Si necesita algo
que aqui no existe, se agrega aqui y se aplica a todos.

---

## 1. Estructura de la pagina

Banco de trabajo de dos columnas, `.workbench`:

| | Ancho | Contenido |
|---|---|---|
| Izquierda `.col-capture` | `40fr` | Pasos de entrada: configuracion y captura |
| Derecha `.col-results` | `60fr` | Resultados en vivo, `position: sticky` |

- Las pistas se declaran `minmax(0, Nfr)`, nunca `Nfr` a secas: con `1fr` el
  minimo de la pista es el `min-content` del contenido y el lienzo de Chart.js
  lleva un ancho inline grande, asi que la rejilla se niega a encoger.
- Un solo punto de quiebre real: `max-width: 1100px` apila las dos columnas.
- Los resultados se recalculan al escribir. El boton de calcular es un refuerzo,
  no la unica via.

### Pasos numerados

Tres encabezados, uno por seccion: **1 Configuracion**, **2 Captura**,
**3 Resultados en vivo**. Los tres son identicos:

- Insignia `.step`: cuadro de 20x20, radio 6, fondo `--accent`, texto mono 11 px.
- Titulo 13.5 px / 600, a 10 px de la insignia, `align-items: center`
  (no `baseline`: deja la insignia 1.5 px baja).
- Las tarjetas de entrada son `<details class="card">` con `summary.config-summary`:
  se pliegan, y la flecha va a la derecha (`::after`), nunca a los dos lados.
- Un indicador de estado (`.status-pill`) vive **dentro** del encabezado, para
  que siga visible con la tarjeta plegada.

### Selector de metodo

La barra superior lleva un selector segmentado con los metodos disponibles
(`.method-switch`), con la misma caja que el interruptor de tema. No es un menu
que se oculta: con pocas entradas conviene verlas todas, y esconderlas oculta
tambien que el producto tiene mas de un metodo.

- Los metodos que aun no existen **se muestran deshabilitados**, con un tooltip
  que dice que vienen y para que sirven. Se ve el plan sin prometer que ya esta.
- Cada metodo tiene su direccion (`#cruzado`): el enlace abre el metodo correcto
  y recargar no lo pierde. Una direccion desconocida cae en el metodo por
  defecto, no en una pantalla vacia.
- El metodo activo se anuncia en la insignia de la barra y encabeza el reporte
  impreso.
- Cuando la lista pase de unas ocho entradas o aparezcan familias distintas
  (MSA, cartas de control, capacidad), el paso siguiente es un desplegable
  agrupado anclado en la barra, no un cajon lateral.

### Un metodo no se lleva su propia pantalla

Cruzado y anidado comparten el HTML entero: los mismos pasos, las mismas
tarjetas, las mismas pestanas. **Lo que cambia se marca en el HTML**, con
`data-methods="cruzado"` (o la lista de metodos donde el elemento aplica), y
`applyMethod` lo muestra u oculta. Sin atributo, el elemento vale para todos.

- Un campo que no aplica **se oculta, no se deshabilita**: un `<select>` gris
  que nunca se puede usar es ruido que el lector tiene que descartar cada vez.
  En el anidado se van Alfa, Interaccion y Denominador de F, porque sin
  interaccion estimable no hay nada que probar, agrupar ni elegir.
- Lo mismo con las graficas: **el motor no publica la serie** que su diseno no
  puede calcular, y el dibujante omite la grafica si el dato no viene. La
  condicion se escribe `if (ch.interaction)`, no `if (metodo === 'anidado')`:
  quien decide es el modelo, no la pantalla.
- Al cambiar de metodo hay que **destruir las graficas anteriores**. Una que el
  metodo nuevo no dibuja se quedaria en pantalla con los datos del anterior.
- `[hidden] { display: none !important; }` va en la hoja, una sola vez. La
  regla del navegador es `[hidden]{display:none}` a secas, y cualquier regla de
  componente de esta hoja (`label.field` es flex, `.grid` es grid) le gana por
  especificidad: sin la regla global, ocultar un campo no hace nada.

### Cambiar de metodo no pierde la captura

La rejilla de captura es la misma (operadores x piezas x replicas), asi que las
mediciones se conservan **por su lugar en la rejilla**, no por el nombre de la
pieza. Lo que cambia es el significado y los nombres, y eso se dice en un aviso
de la tarjeta: que se conservo, cuanto, y que supone ahora el metodo nuevo.

> Nunca se pierden datos en silencio, y nunca se cambia el significado de un
> dato sin decirlo.

Cuando el metodo destino no admite los nombres de pieza que traia el anterior
-el anidado no acepta que dos operadores compartan pieza- se renumeran y el
aviso lo dice, en vez de mostrar un error de nombre repetido que el usuario no
provoco.

### Espaciado

| Elemento | Valor |
|---|---|
| Separacion entre tarjetas de una columna | 14 px (captura) / 18 px (resultados) |
| Relleno de tarjeta | 14 px 16 px (12 px 16 px si es `details`) |
| Radio de tarjeta | 10 px |
| Rejilla de campos | `gap: 14px 16px` |
| Rejilla de graficas | `gap: 14px` |

---

## 2. Rejillas que responden al contenedor, no a la ventana

**Prohibido** un numero fijo de columnas en formularios y tarjetas. La captura
vive en el 40 % del ancho: un `repeat(4, 1fr)` produce campos de 120 px donde no
cabe ni el rotulo ni el marcador de posicion, y los breakpoints por ventana no
se enteran.

```css
.grid.cols-4 { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
.grid.cols-3 { grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); }
.grid.cols-2 { grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); }
```

- `auto-fill`, no `auto-fit`: una fila con un solo campo debe ocupar **una**
  columna, no todo el ancho.
- **Una lista larga de campos iguales tambien es una rejilla.** Los nombres de
  pieza del anidado son operadores x piezas: con el estudio que sugiere AIAG son
  treinta. En una columna serian treinta filas seguidas, asi que el bloque toma
  el ancho de la tarjeta y los campos se acomodan en las columnas que quepan.
  Si van agrupados, el encabezado del grupo ocupa la fila entera
  (`grid-column: 1 / -1`).
- `.grid { align-items: end }` y `label.field` como columna flex: los campos
  quedan alineados aunque un rotulo ocupe dos lineas.
- Ningun rotulo, marcador de posicion o texto de `<select>` puede quedar
  cortado. Si no cabe, sube el minimo de la columna; no encojas la fuente.

### Tarjetas que se alinean entre si

Las tarjetas de resumen (`.verdicts`) se alinean **entre ellas**, no solo por
dentro: cada una ocupa tres filas de la rejilla madre con
`grid-template-rows: subgrid` y `grid-row: span 3`, asi que titulo, valor y
etiqueta quedan al mismo nivel aunque un titulo ocupe dos lineas. Respaldo con
`@supports not (grid-template-rows: subgrid)`.

Esta es la regla general: **si varias cajas hermanas muestran lo mismo, sus
partes se alinean horizontalmente**.

---

## 3. Color

Dos temas, claro y oscuro, con tokens en `:root` y `:root[data-theme="dark"]`.
Todo color de interfaz sale de un token; ninguno se escribe literal en el CSS de
componentes.

### El semaforo no cambia con el tema

Excepcion deliberada, y la mas importante: `--sem-ok`, `--sem-warn` y
`--sem-bad` se definen **fuera** del bloque de tema.

> El color de una barra o de un umbral **codifica el nivel de alerta**
> (bueno / marginal / malo). Es informacion, no estetica. Un usuario no puede
> ver ambar en un tema y cafe en el otro para el mismo dato.

Los tonos elegidos son legibles sobre fondo claro y oscuro:
`--sem-ok #2e9e63`, `--sem-warn #e0a63a`, `--sem-bad #d1453b`.

Al imprimir se fuerza `print-color-adjust: exact`: si el semaforo se va en
blanco y negro, el reporte pierde el dato.

---

## 4. Graficas

Sobre Chart.js, servido desde el repositorio (la app funciona sin conexion).
Nada de paquetes extra: lo que falte se resuelve con un plugin propio
(`thresholdLines`, `boxWhiskers`, `operatorBands` son los tres que existen).

### Ejes

- **Un eje se titula con lo que mide**: `Pieza`, `Operador`. Sin excepciones.
- Las etiquetas del eje x llevan **el dato minimo que identifica el punto**. Si
  todos los nombres comparten prefijo (`Pieza 1`, `Pieza 2`), se recorta y queda
  `1`, `2` (`shortPartLabels`). El nombre completo vive en el tooltip.
- Nunca se mete una segunda dimension en el rotulo (`Operador A - Pieza 1`):
  eso obliga a girar el eje 60 grados y aplasta la grafica. La segunda dimension
  se marca **por bloques**: linea punteada entre grupos y el nombre del grupo
  arriba (`operatorBands`).
- Con etiquetas cortas, `maxRotation: 0` y `autoSkip: false`: se ven todas las
  marcas o el lector duda de que punto es cual.

### Umbrales y referencias

- Un umbral **no es una serie**: no aparece en la leyenda. Se dibuja con un
  plugin, cruza toda el area de trazado y lleva su rotulo fuera, a la derecha.
- Va con el color de su nivel (verde el 10 %, ambar el 30 %) y se traza **antes**
  que las barras, para que la barra sobresalga donde se traslapan.
- En los medidores HTML el mismo caso se resuelve al reves: la marca punteada va
  por encima de la barra y sobresale 5 px arriba y abajo de la pista.

### Tooltips

Toda grafica responde al cursor. Si el dato mostrado no es el crudo (una caja,
una barra flotante), el tooltip da el resumen legible — los cinco numeros de la
caja, no el par `[q1, q3]` — y la dimension que el eje ya no repite.

### Graficas que un metodo no tiene

No se dibuja un lienzo vacio ni una grafica con una nota de "no aplica": la
grafica **no aparece**. El hueco lo cierra la rejilla sola. Lo que si tiene que
aparecer es la razon, una vez y donde se explica el metodo (Notas de
interpretacion), no repetida en cada tarjeta.

### Pie de grafica

Una sola oracion que dice **que buscar**, no que es la grafica:

> Puntos fuera de limites indican inconsistencia al repetir la medicion.

Cada pie se sostiene solo: no supone que el lector venga de la grafica anterior
("Aqui SI se buscan..." es incorrecto), ni explica la teoria — eso va en Notas.

---

## 5. Redaccion

Aplica a avisos, errores, pies, rotulos y ayudas.

1. **Hallazgo primero, accion despues.** `NDC = 4 (menor que 5): el sistema no
   separa las piezas. Revisa la resolucion del instrumento y las piezas elegidas.`
2. **Sin tranquilizantes ni rodeos.** Fuera "es el comportamiento normal, no
   falta ningun dato", "antes de culpar al gage".
3. **Un mensaje no supone orden de lectura.**
4. **Cifra concreta antes que adjetivo**: "menos de 10 %", no "bajo".
5. **Sin acentos** en los textos de interfaz y en los comentarios de codigo, por
   consistencia con el resto del proyecto. Los `.md` si los llevan.
6. La explicacion larga vive en **Notas de interpretacion** o en un tooltip,
   nunca en un rotulo.

### Tooltips explicativos

- Toda tarjeta de resultado y todo parametro de calculo tiene `title`.
- Contenido: que mide, contra que se compara y de donde sale. En los parametros,
  ademas, **que cambia y que no** si lo mueves.
- `cursor: help` para que se note que hay algo que leer.

---

## 6. Validacion de entradas

- Un valor fuera de rango **se senala**, no se recorta en silencio. `clamp` sin
  aviso es un error: el campo decia 1 y el estudio se armaba con 2.
- Tres cosas a la vez: campo en rojo (`.invalid` + `aria-invalid`), motivo en el
  mensaje de la tarjeta, y la accion que depende de el deshabilitada.
- Los limites se leen de los atributos `min`/`max` del propio input; no se
  repiten en el JS.
- El mensaje nombra el campo y su rango: `Operadores: un numero entero entre 2 y 20.`

---

## 7. Reporte impreso

Se imprime **un reporte, no la pantalla**. Orden fijo:

1. Portada: nombre del estudio, fecha y parametros (tamano, especificacion,
   multiplicador, alfa, modelo, metricas clave).
2. Avisos, tarjetas de veredicto y evaluacion.
3. Tablas.
4. Graficas, dos por fila.
5. Notas.
6. Anexo con los datos capturados, como texto.

Reglas que no se negocian:

- Los paneles ocultos se revelan **antes** de imprimir y las graficas se
  redibujan: un lienzo que nunca estuvo visible se dibujo en 0x0 y sale en blanco.
- Si el tema activo es oscuro, se imprime en claro y se restaura despues. Los
  lienzos son mapas de bits; el CSS no los aclara.
- **El contenedor de la grafica crece con la imagen** (`height: auto`). Imponerle
  un alto saca el lienzo de su caja y los rotulos terminan encima del pie.
- La legibilidad manda sobre el numero de hojas. Apretar margenes y bajar la
  altura de las graficas ahorra papel y arruina el reporte.
- Se imprime con `beforeprint` tambien, para que Ctrl+P de el mismo resultado
  que el boton.

---

## 8. Importacion y exportacion

- **Un solo formato de intercambio.** Hoy: CSV con `operador, pieza, replica,
  medicion`. Lo que exporta la pagina es exactamente lo que acepta al importar.
- Sin campos extra "por si acaso": cada columna que se agrega es una columna que
  alguien tiene que llenar.
- El importador tolera lo razonable: separador `,` o `;`, alias de nombre de
  columna, lineas de comentario `#`, y usa la columna de replica cuando viene.
- El nombre del estudio da nombre al archivo exportado.
- **Una importacion nunca pierde mediciones en silencio.** Si una celda del
  archivo no encuentra su lugar en la tabla, se dice. El patron
  `var inp = ...; if (inp) inp.value = ...` es comodo y es una trampa: se traga
  el fallo y deja la tabla vacia sin una sola queja. Cuando el usuario ve
  noventa celdas en blanco despues de importar, ya perdio la confianza en el
  programa, y no tiene como saber por que.
- **Los nombres vienen del estado, y el estado no se destruye antes de leerlo.**
  Redibujar la lista de nombres es *conservar* lo que el usuario escribio, no
  regenerarlo. Un `state.x = []` antes del bucle que lee `state.x` deja los
  defaults y se ve inofensivo, porque los defaults son plausibles. El orden es:
  primero se resuelven los nombres, despues se arma la tabla que depende de
  ellos.
- Un round-trip exportar -> importar de un estudio recien creado **no** prueba
  esto: sus nombres son los que el programa pone solo, asi que coinciden con
  cualquier default y esconden el fallo. Se prueba con nombres reales
  (`Lote-A-04`), que es como los escribe una planta.

---

## 9. Motor y pruebas

- El calculo vive en `assets/js/` sin dependencias y corre igual en el navegador
  y en Node.
- Todo metodo nuevo llega con: dataset publicado de validacion, pruebas de
  regresion contra valores publicados, y pruebas de propiedad (invarianza ante
  traslacion, escalado, orden de las filas).
- Ningun cambio de presentacion toca los numeros. Si una prueba verifica una
  frase literal de un mensaje, se ajusta la prueba, no el mensaje.
- **Compartir pantalla obliga a comprobarlo.** Como los metodos comparten el
  HTML, tocar la pantalla toca a todos, y la suite de motor no lo ve: el
  calculo puede seguir dando los mismos numeros mientras la pantalla los
  muestra mal, se come una grafica o rompe el reporte. Antes de dar por bueno
  un cambio de presentacion se corre `tests/regresion-visual.js` para cada
  metodo, contra la revision anterior. Compara lo que la pagina publica -y lo
  que **se ve**, no lo que hay en el DOM: los bloques de los otros metodos
  estan ahi, ocultos-, incluido el reporte impreso pixel a pixel. Necesita
  Playwright, que no es dependencia del proyecto: es herramienta de escritorio,
  no requisito para usar la aplicacion.
- **Lo que la regresion visual todavia no ve.** Su recorrido carga el dataset de
  ejemplo, cuyos nombres de pieza son los que el programa pone solo. Eso deja
  fuera toda una familia de fallos: los que solo aparecen con nombres escritos
  por el usuario. Ademas compara **dos revisiones del repo**, asi que un defecto
  presente en las dos coincide y pasa por bueno; sirve para no mover lo que ya
  estaba bien, no para encontrar lo que nunca estuvo bien. Al recorrido le falta
  renombrar un par de piezas antes de calcular.
- **Ninguna suite toca el DOM.** Las de motor corren en Node sin navegador. Un
  cambio en `app.js` puede dejar las 80 pruebas en verde y romper la pantalla:
  se comprueba a mano, en el navegador, con y sin el cambio.
- Las URLs de `assets/` llevan `?v=` y se sube en cada cambio publicado.

---

## 10. Lista de verificacion para un metodo nuevo

- [ ] Entra en el banco de dos columnas, con sus pasos numerados y tarjetas plegables.
- [ ] Comparte el HTML de los demas metodos; lo propio va con `data-methods`.
- [ ] Lo que no aplica se oculta, no se deshabilita, y las graficas que no
      corresponden no se dibujan porque el motor no publica su serie.
- [ ] Cambiar de metodo conserva la captura por posicion y lo avisa.
- [ ] Sus rejillas usan `auto-fill` con minimo en px.
- [ ] Sus tarjetas de resumen se alinean con `subgrid`.
- [ ] Sus colores de nivel salen de `--sem-*` y no cambian con el tema.
- [ ] Cada grafica: eje titulado, etiquetas cortas, umbrales como anotacion,
      tooltip y un pie que dice que buscar.
- [ ] Cada tarjeta y cada parametro con tooltip explicativo.
- [ ] Entradas invalidas: rojo, motivo y accion bloqueada.
- [ ] Mensajes con hallazgo y accion, sin relleno.
- [ ] Aparece en el reporte impreso, en el orden establecido.
- [ ] Exporta e importa con el formato unico, y se prueba el viaje completo con
      **nombres propios**, no con los que pone el programa.
- [ ] Ninguna medicion se pierde callada: lo que no encuentra su lugar se avisa.
- [ ] Dataset de validacion y pruebas verdes.
