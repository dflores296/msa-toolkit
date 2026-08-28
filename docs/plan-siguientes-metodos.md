# Plan de los siguientes metodos

Documento de continuidad. Sirve para retomar el proyecto en otra sesion sin
volver a levantar el contexto desde cero.

---

## Estado al cerrar esta etapa

**Gage R&R (ANOVA cruzado): terminado.** Motor, interfaz, ocho graficas, reporte
impreso, importacion y exportacion, validacion de entradas y tooltips.

**Gage R&R (ANOVA anidado): terminado.** Motor propio, interfaz compartida con
el cruzado, cinco graficas, reporte impreso, importacion con deteccion del
diseno y cambio de metodo sin perder la captura.

80 pruebas verdes (`node tests/run-node.js`), entre las dos suites.

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
(hecho) y **atributos**. Ese es el orden de trabajo: sigue **atributos**.

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
- **Cambiar de metodo conserva la captura**, por posicion en la rejilla, y lo
  avisa. Importar detecta el diseno del archivo y cambia de metodo solo.

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

## 2. Attribute Agreement (atributos) — SIGUE ESTE

**Por que.** Pasa / no pasa, calibres, inspeccion visual. No hay varianza que
descomponer: se mide **acuerdo**, no dispersion.

### Que se calcula

- Acuerdo **dentro** de cada evaluador (repite su propio juicio).
- Acuerdo **entre** evaluadores.
- Acuerdo **contra el estandar**, cuando se conoce la clasificacion correcta.
- **Kappa de Cohen** (dos evaluadores) y **Kappa de Fleiss** (mas de dos), con
  su error estandar y su intervalo.
- **Kendall** cuando las categorias estan ordenadas (bueno / marginal / malo),
  no solo nominales.
- Criterio de aceptacion habitual: kappa >= 0.75 bueno, < 0.40 pobre. Confirmar
  contra la fuente antes de escribirlo en la interfaz.

### Trabajo

- Motor nuevo, `assets/js/attribute.js`. No comparte nada con el ANOVA salvo el
  estilo: sin DOM, sin dependencias, corre en Node.
- Captura distinta: la celda es una **categoria**, no un numero. Conviene un
  `<select>` o botones por celda, y una columna de estandar opcional.
- El % y el semaforo no aplican igual. Las tarjetas de resumen muestran
  porcentajes de acuerdo y kappa, con la misma estructura de tres lineas.
- Graficas: barras de acuerdo por evaluador con su intervalo de confianza, y la
  misma barra contra el estandar. Nada de cartas de control.
- Dataset de validacion con resultados publicados, obligatorio.

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

   **Que pasa con los datos al cambiar de metodo.** Ya esta decidido y hecho
   entre cruzado y anidado: se conservan **por posicion en la rejilla**, se
   renombran las piezas si el metodo destino no admite los nombres anteriores, y
   se avisa que se conservo y que supone ahora el metodo nuevo. Con **atributos**
   no aplica: la celda deja de ser un numero y pasa a ser una categoria, asi que
   ahi toca preguntar antes de descartar. Nunca perderlos en silencio.

## Deudas conocidas del metodo cruzado

Nada de esto bloquea, pero conviene tenerlo escrito:

- El %GRR no lleva intervalo de confianza (ver punto 3).
- Las especificaciones (LSL/USL, alfa, multiplicador) **no se guardan** en el
  CSV. Se decidio a proposito, para no llenar el archivo de campos. Si algun dia
  estorba, la via es un JSON opcional, no ensuciar el CSV.
- El reporte impreso ocupa 7 hojas. Se intento compactar y se revirtio: apretar
  margenes y bajar la altura de las graficas encoge los rotulos. Si hay que
  ahorrar papel, el camino es sacar las Notas de interpretacion del papel, no
  encoger las graficas.
