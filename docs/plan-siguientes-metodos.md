# Plan de los siguientes metodos

Documento de continuidad. Sirve para retomar el proyecto en otra sesion sin
volver a levantar el contexto desde cero.

---

## Estado al cerrar esta etapa

**Gage R&R (ANOVA cruzado): terminado.** Motor, interfaz, ocho graficas, reporte
impreso, importacion y exportacion, validacion de entradas y tooltips.

**Gage R&R (ANOVA anidado): terminado.** Motor propio, interfaz compartida con
el cruzado, cinco graficas, reporte impreso e importacion con deteccion del
diseno.

**Attribute Agreement (atributos): terminado.** Motor propio, captura por
categorias con estandar opcional, cuatro concordancias con intervalo exacto de
Clopper-Pearson, kappa de Fleiss y de Cohen, efectividad con error de fuga y
falsa alarma, tres graficas, reporte impreso y su vista de resultados propia.

106 pruebas verdes (`node tests/run-node.js`), entre las tres suites.

**Con esto se cierra el alcance planeado.** Los tres metodos que se usan en
planta -mediciones normales, pruebas destructivas e inspeccion por atributos-
estan hechos. Lo que sigue en este documento queda como registro de lo que se
evaluo y se decidio no hacer, no como trabajo pendiente.

**Correccion posterior (28-08-2026).** Se encontro y arreglo un fallo de la
interfaz del anidado: `renderNameInputs()` vaciaba `state.partsByOperator`
antes de leerlo, asi que los nombres de pieza volvian a `Pieza 1..N` en cada
redibujado. Lo grave era la importacion: un archivo anidado con nombres propios
perdia **todas** las mediciones sin decir nada. Las 80 pruebas seguian en verde,
porque ninguna toca el DOM. Ver la postdata al hallazgo 8 de
`docs/auditoria-motor-excel.md` y las reglas que quedaron en las secciones 8 y 9
del estandar.

Piezas que ya existen y que los metodos nuevos **reutilizan tal cual**:

| Pieza | Archivo | Reutilizable |
|---|---|---|
| Distribucion F, cuartiles, resumen de caja | `assets/js/stats.js` | Completa |
| Motor ANOVA cruzado | `assets/js/anova.js` | El armado de la tabla ANOVA y la clasificacion AIAG (`assess`) |
| Graficas y sus tres plugins | `assets/js/charts.js` | `thresholdLines`, `boxWhiskers`, `operatorBands`, cartas de control, caja, rangos |
| Interfaz, captura, reporte impreso | `assets/js/app.js` | Flujo completo: pasos, validacion, tablas, impresion, CSV |
| Motor ANOVA anidado | `assets/js/anova-nested.js` | El patron de motor por metodo, y como reutiliza lo del cruzado |
| Arnes de pruebas | `tests/harness.js` | `test`, `near`, `assert`, `report`; una suite nueva solo lo importa |
| Estandar de diseno | `docs/estandar-de-diseno.md` | **Obligatorio** para todo lo que sigue |

Los tres metodos que se usan en planta son **cruzado** (hecho), **anidado**
(hecho) y **atributos** (hecho). El alcance se cierra aqui.

---

## 1. Gage R&R anidado (pruebas destructivas) — HECHO

**Por que.** El cruzado exige que cada operador mida *la misma pieza* varias
veces. Si la pieza se destruye al medirla, eso es imposible. En el anidado cada
operador recibe **piezas distintas** de un lote que se supone homogeneo.

**Consecuencia estadistica que hay que decir en la interfaz:** el diseno **no
puede separar la interaccion operador x pieza**. La reproducibilidad sale como
efecto de operador y nada mas. No es una limitacion del programa, es del diseno.

### Modelo

Piezas anidadas dentro de operador:

```
SC_Total = SC_Operador + SC_Pieza(Operador) + SC_Repetibilidad
gl_Operador       = p - 1                 (p operadores)
gl_Pieza(Operador)= p(n - 1)              (n piezas por operador)
gl_Repetibilidad  = pn(r - 1)             (r replicas por pieza)
```

Componentes:

```
Var_Repetibilidad  = CM_Rep
Var_Pieza          = (CM_Pieza(Op) - CM_Rep) / r
Var_Reproducibilidad = (CM_Op - CM_Pieza(Op)) / (n r)
Var_GRR = Var_Repetibilidad + Var_Reproducibilidad
```

Truncar a cero los negativos y avisar, igual que hoy.

### Como quedo

- **Motor aparte**, `assets/js/anova-nested.js`, no una bandera en `anova.js`:
  el motor cruzado ya estaba validado y no convenia tocarlo. De el se reutilizan
  tal cual `assess` y `resolveTolerance` (ahora exportados) y las constantes de
  carta: no dependen del diseno, y duplicarlos arriesgaba que un metodo
  clasificara distinto que el otro.
- **Captura**: cada operador trae sus piezas, agrupadas bajo su nombre. Ningun
  nombre de pieza puede repetirse, ni siquiera entre operadores, y el mensaje lo
  dice con esas palabras. Una pieza compartida no es un descuido de nombres: es
  un estudio cruzado capturado en el metodo equivocado, asi que el error manda
  al otro metodo.
- **Graficas**: cinco. Se fueron la de interaccion, el promedio por pieza y los
  rangos por pieza. La regla que quedo es mejor que "segun el metodo": el motor
  no publica la serie que su diseno no puede calcular, y el dibujante omite la
  grafica si el dato no viene.
- **Avisos fijos**: la homogeneidad del lote y la ausencia de interaccion salen
  siempre, como supuesto y como limitacion, nunca como resultado.
- **Cambiar de metodo vacia la captura**, preguntando antes. (Al cerrar el
  anidado esto se conservaba por posicion; con el tercer metodo se cambio para
  los tres. Ver el estandar de diseno.) Importar detecta el diseno del archivo
  y cambia de metodo solo.

### Deuda: el dataset publicado

Queda **pendiente** un dataset destructivo publicado con resultados. Los
candidatos son `CeramicComponent.MTW` de Minitab (3 operadores, resultados
publicados: GRR 5.62 % de contribucion, 23.71 % de study variation,
p(Operador) = 0.773) y el ejemplo de destructivas del manual AIAG MSA 4a ed.
Ninguno de los dos se pudo bajar: los sitios que los publican estan bloqueados
por la politica de salida de la sesion en que se hizo este trabajo.

Mientras tanto el motor **no** se valida contra numeros inventados. Se apoya en
una identidad exacta del ANOVA balanceado: si se anidan las piezas dentro del
operador,

```
SC_Operador(anidado)      = SC_Operador(cruzado)
SC_Pieza(Operador)        = SC_Pieza + SC_Interaccion
SC_Repetibilidad(anidado) = SC_Repetibilidad(cruzado)
gl_Pieza(Operador) = o(n-1) = gl_Pieza + gl_Interaccion
```

(el termino cruzado se anula porque, para una pieza fija, los residuos de
interaccion suman cero sobre los operadores). Asi que las mismas mediciones del
apendice AIAG, con las piezas renumeradas 1 a 30, quedan ancladas en los numeros
publicados por Minitab. Se suma un caso construido a mano con los tres cuadrados
medios exactos. Ver `tests/tests-nested.js` y `datasets/aiag-msa4-anidado.json`.

**Cuando se consiga el dataset publicado**: agregarlo a `datasets/`, escribir su
prueba de regresion contra los valores publicados y quitar esta seccion. La
identidad se queda: es una buena prueba por si sola.

---

## 2. Attribute Agreement (atributos) — HECHO

**Por que.** Pasa / no pasa, calibres, inspeccion visual. No hay varianza que
descomponer: se mide **acuerdo**, no dispersion.

### Como quedo

Motor propio en `assets/js/attribute.js`, con su suite en
`tests/tests-attribute.js`. No comparte nada con el ANOVA salvo el estilo: sin
DOM, sin dependencias, corre en Node.

**Las cuatro concordancias**, que son las de Minitab. En las cuatro la unidad es
la pieza y el criterio es "todas las decisiones coinciden": dos aciertos y un
fallo valen cero, no dos tercios. Es la convencion de AIAG y es a proposito.

| Concordancia | Que responde |
|---|---|
| Dentro del evaluador | se repite a si mismo (repetibilidad del atributo) |
| Evaluador contra el estandar | ademas de repetirse, acierta |
| Entre evaluadores | todos ven lo mismo (reproducibilidad) |
| Todos contra el estandar | todos coinciden y ademas aciertan |

Cada porcentaje lleva **intervalo exacto de Clopper-Pearson**. Con 30 piezas la
incertidumbre es grande y un 90 % pelon engana; el intervalo se dibuja tambien
en las barras y en las graficas.

**Kappa**, para descontar el acuerdo que da el azar: de **Fleiss** entre
evaluadores (varios jueces por pieza) y de **Cohen** contra el estandar (dos
juicios por decision, el del evaluador y la verdad), con kappa por categoria,
error estandar bajo la nula, z y valor p.

**Efectividad, error de fuga y falsa alarma**, solo con estandar y escala
binaria. Los umbrales NO se comparten (2 % la fuga, 5 % la falsa alarma) porque
los dos errores no cuestan lo mismo: dejar pasar una pieza mala le llega al
cliente, rechazar una buena se queda en la planta.

**En la pantalla.** El estandar se captura una vez por pieza, no una por
medicion, porque es una propiedad de la pieza. La celda es un `<select>` con las
categorias. Cambiar de metodo vacia la captura, preguntando antes y nunca en
silencio; atributos obligo a plantearlo -un numero no es una categoria- y de
ahi salio la regla que hoy vale para los tres. Importar detecta por el tipo de
dato: un archivo de
clasificaciones cambia solo al metodo de atributos, igual que uno anidado
cambiaba al anidado.

### Lo que se dejo fuera, a proposito

- **Kendall** para categorias ordenadas. El motor admite tres o mas categorias
  y calcula concordancia y kappa sobre ellas, pero las trata como **nominales**:
  no sabe que "marginal" esta entre "bueno" y "malo", asi que no penaliza mas un
  error de dos escalones que uno de uno. Si algun dia hace falta, el lugar es
  `attribute.js` y el patron ya esta puesto (kappa por categoria).
- Teoria de Deteccion de Senales y el metodo analitico AIAG (probit). Piden
  patrones con valor certificado o muchas mediciones en la zona de duda: son de
  laboratorio, no de linea.

### Deuda: el dataset publicado

La misma que tuvo el anidado, y por la misma razon. **Falta** un dataset de
atributos con resultados publicados; el candidato natural es el ejemplo de
atributos del manual AIAG MSA 4a ed. (50 piezas, 3 evaluadores, 3 ensayos, con
valores de referencia), que tambien distribuye Minitab.

Mientras tanto el motor **no** se valida contra numeros inventados. Se apoya en
tres cosas que no dependen de conseguir el archivo:

1. **Casos chicos resueltos a mano**: cuatro piezas, dos evaluadores, dos
   replicas. Caben en la cabeza y el resultado esperado esta escrito junto con
   su cuenta en `tests/tests-attribute.js`.
2. **Identidades exactas de kappa**: un caso de Fleiss que da 7/15 y dos de
   Cohen que dan 0.75 y 0.40, con las tablas construidas para que salga
   fraccion exacta.
3. **Propiedades**: renombrar las categorias no cambia nada, el orden de las
   filas tampoco, el acuerdo perfecto da 100 % y kappa 1, kappa se va a cero
   cuando el acuerdo lo explica el desbalance del lote, y el intervalo de
   Clopper-Pearson cumple su definicion comprobada **contra la propia
   binomial** -sin tablas publicadas de por medio-.

El ejemplo que carga el boton (`datasets/atributos-ejemplo.json`) es un caso
**construido a mano** para ensenar a leer las cifras, y lo dice en el aviso y en
el propio archivo. No es, ni pretende ser, un dataset de validacion.

**Cuando se consiga el publicado**: agregarlo a `datasets/`, escribir su prueba
contra los valores publicados y quitar esta seccion. Los casos de mano y las
propiedades se quedan: son buenas pruebas por si solas.

---

## 3. Despues (sin orden fijo)

Estan en el README y siguen vigentes:

- Promedio y Rango (X-barra & R) con constantes K1/K2/K3 — el metodo que el
  Excel original implementaba mal; util para comparar contra estudios viejos.
- Estudio Tipo 1 (Cg / Cgk) sobre patron.
- Linealidad y sesgo.
- Estabilidad (cartas I-mR del patron).
- Intervalos de confianza del %GRR (MLS / GPQ). **Esta vale mas de lo que
  parece**: hoy el %GRR es una estimacion puntual y con 10x3x3 su incertidumbre
  no es despreciable. Un 27.86 % podria ser 22 % o 34 % y el estudio no lo dice.

---

## Como se agrega un metodo

1. **Motor primero, con pruebas.** Dataset publicado en `datasets/`, pruebas de
   regresion contra sus valores y pruebas de propiedad (invarianza ante
   traslacion y escalado, orden de filas irrelevante). Sin interfaz todavia.
2. **Interfaz despues**, cumpliendo `docs/estandar-de-diseno.md` punto por punto.
   La lista de verificacion del final de ese documento es el criterio de cierre.
3. **Reporte impreso**: el metodo aparece en el orden establecido, con su anexo
   de datos.
4. **Navegacion**: el mecanismo ya funciona con dos metodos. Para activar uno:
   poner `available: true` en su entrada de `METHODS` (`app.js`), con su
   `engine`, sus rotulos y su ayuda; quitar el `disabled` de su boton; y marcar
   con `data-methods` lo que sea propio suyo en el HTML. Nada mas: la pantalla
   se comparte.

   **Que pasa con los datos al cambiar de metodo.** Se vacia la captura, entre
   cualesquiera dos metodos, preguntando antes y nunca en silencio. La rejilla
   se ve igual en todos y por eso mismo el dato no se puede reutilizar: el mismo
   numero en la misma celda significa otra cosa en cada metodo, asi que
   conservarlo daria un estudio que parece valido y no lo es.

## Deudas conocidas del metodo cruzado

Nada de esto bloquea, pero conviene tenerlo escrito:

- El %GRR no lleva intervalo de confianza (ver punto 3).
- Las especificaciones (LSL/USL, alfa, multiplicador) **no se guardan** en el
  CSV. Se decidio a proposito, para no llenar el archivo de campos. Si algun dia
  estorba, la via es un JSON opcional, no ensuciar el CSV.
- **No hay cobertura automatica de la pantalla.** Las suites de motor corren en
  Node sin DOM, y `tests/regresion-visual.js` compara dos revisiones del repo:
  un defecto presente en ambas coincide y pasa por bueno. Su recorrido usa
  ademas el dataset de ejemplo, con los nombres por defecto, que es justo el
  caso donde se esconden los fallos de nombres. Lo minimo para cerrar el hueco
  es agregarle un paso que renombre un par de piezas antes de calcular; lo
  siguiente seria llevar el caso completo -importar con nombres propios y
  comprobar que la tabla queda llena- a `tests/index.html`, que si corre en
  navegador. Vale para los dos metodos, y para los que vengan.
- El reporte impreso ocupa 7 hojas. Se intento compactar y se revirtio: apretar
  margenes y bajar la altura de las graficas encoge los rotulos. Si hay que
  ahorrar papel, el camino es sacar las Notas de interpretacion del papel, no
  encoger las graficas.
