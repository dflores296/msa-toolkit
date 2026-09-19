# Los tres motores de cálculo

Contra qué está validado cada motor y qué decide cada uno. Los tres son módulos
puros —sin DOM, sin librerías— y se pueden importar desde Node o desde otra
herramienta tal cual.

| Motor | Archivo | Qué calcula |
|---|---|---|
| Cruzado | `assets/js/anova.js` | Gage R&R por ANOVA de dos factores con efectos aleatorios |
| Anidado | `assets/js/anova-nested.js` | Gage R&R para pruebas destructivas |
| Atributos | `assets/js/attribute.js` | Concordancia y kappa para inspección pasa / no pasa |
| Diseño | `assets/js/design.js` | Identidad de la pieza y enrutado de método |

## Motor cruzado

Para medición normal: cada operador mide **las mismas** piezas, y el modelo de
dos factores con efectos aleatorios puede separar repetibilidad,
reproducibilidad e interacción operador × pieza.

### Contra qué se valida

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

## Motor anidado

Para **pruebas destructivas**: medir la pieza la destruye, así que cada operador
mide sus propias piezas de un lote que se supone homogéneo. El diseño no puede
separar la interacción operador × pieza —la reproducibilidad sale como efecto de
operador— y la aplicación lo dice en pantalla en vez de esconderlo.

La identidad de una pieza es aquí el par **operador + pieza**: numerar 1..n las
piezas de cada operador es válido, y la «1» de uno y la «1» de otro se analizan
como dos objetos físicos distintos.

Por lo mismo, el anidado publica **cinco gráficas** donde el cruzado publica
ocho: allí no hay gráfica de interacción ni agrupaciones por pieza compartida,
porque ninguna pieza la miden dos operadores.

### Contra qué se valida

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

## Motor de atributos

Falta un dataset de atributos con resultados publicados (el candidato es el
ejemplo del manual AIAG MSA 4.ª ed.), y está anotado como deuda. Mientras tanto
el motor **no** se valida contra números inventados, sino contra tres cosas que
no dependen de conseguir ese archivo:

- **Casos resueltos a mano** —cuatro piezas, dos evaluadores, dos réplicas— con
  la cuenta escrita junto a la prueba.
- **Identidades exactas de kappa**: un caso de Fleiss que da 7/15, y dos de
  Cohen que dan 0.75 y 0.40, con las tablas construidas para que el valor salga
  fracción exacta.
- **Propiedades**: renombrar las categorías no cambia nada, el orden de las
  filas tampoco, el acuerdo perfecto da 100 % y kappa 1, kappa cae a cero cuando
  el acuerdo lo explica el desbalance del lote, y el intervalo de
  Clopper-Pearson se comprueba **contra la propia binomial**, sin tablas de por
  medio.

El ejemplo que carga el botón es un caso **construido a mano** para enseñar a
leer las cifras —cada evaluador falla de una manera distinta a propósito—, no un
dataset de validación, y lo dice al cargarlo.

### La categoría de rechazo se elige, no se adivina

Con dos categorías y
estándar, hay que decir cuál significa *pieza no conforme*: de esa elección
depende cuál error es una **fuga** (dejar pasar una mala, le llega al cliente,
umbral 2 %) y cuál una **falsa alarma** (rechazar una buena, se queda en la
planta, umbral 5 %). Mientras no se elija, la efectividad y los dos errores no
se calculan y la página dice por qué; el acuerdo y kappa no dependen de esa
elección y se publican igual. Antes se tomaba por defecto la segunda categoría
en orden de aparición, así que los mismos datos capturados en otro orden de
filas intercambiaban los dos errores.

## Diseño e identidad de la pieza

`assets/js/design.js` decide, **sin DOM**, dos cosas que antes vivían pegadas a
la pantalla: qué identidad tiene una pieza en cada método (en el anidado, el par
`operador|pieza`) y a qué método pertenece un archivo que se importa. Ningún
cambio de método se deduce ya de cómo se llamen las piezas: manda el que el
archivo **declara**, y lo que solo se sospecha se pregunta. `tests/tests-design.js`
cubre los seis escenarios de la auditoría —numeración local y global, cruzado
compartido, importación que conserva el método, reordenar filas y renombrar
piezas— y `tests/prueba-diseno.js` comprueba en un navegador de verdad que la
aplicación cablea ese modelo.
