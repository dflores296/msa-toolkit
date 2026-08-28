# Plan de los siguientes metodos

Documento de continuidad. Sirve para retomar el proyecto en otra sesion sin
volver a levantar el contexto desde cero.

---

## Estado al cerrar esta etapa

**Gage R&R (ANOVA cruzado): terminado.** Motor, interfaz, ocho graficas, reporte
impreso, importacion y exportacion, validacion de entradas y tooltips. 49
pruebas verdes (`node tests/run-node.js`).

Piezas que ya existen y que los metodos nuevos **reutilizan tal cual**:

| Pieza | Archivo | Reutilizable |
|---|---|---|
| Distribucion F, cuartiles, resumen de caja | `assets/js/stats.js` | Completa |
| Motor ANOVA cruzado | `assets/js/anova.js` | El armado de la tabla ANOVA y la clasificacion AIAG (`assess`) |
| Graficas y sus tres plugins | `assets/js/charts.js` | `thresholdLines`, `boxWhiskers`, `operatorBands`, cartas de control, caja, rangos |
| Interfaz, captura, reporte impreso | `assets/js/app.js` | Flujo completo: pasos, validacion, tablas, impresion, CSV |
| Estandar de diseno | `docs/estandar-de-diseno.md` | **Obligatorio** para todo lo que sigue |

Los tres metodos que se usan en planta son **cruzado** (hecho), **anidado** y
**atributos**. Ese es el orden de trabajo.

---

## 1. Gage R&R anidado (pruebas destructivas)

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

### Trabajo

- `assets/js/anova-nested.js` (o una bandera de modelo en `anova.js` — decidir al
  empezar; separar el archivo mantiene limpio el motor cruzado, que ya esta
  validado y no conviene tocar).
- Captura: la tabla cambia. Cada operador tiene **sus** piezas; el nombre de la
  pieza no se repite entre operadores. La validacion de nombres repetidos de hoy
  hay que revisarla para este caso.
- Graficas: se van la de interaccion y las cartas por pieza compartida. La carta
  R y la X-barra siguen, con sus bloques por operador. La de caja por operador
  sigue igual.
- Validacion: la homogeneidad del lote es un supuesto que el estudio **no puede
  comprobar**. Ponerlo como aviso fijo, no como resultado.
- Dataset de validacion: buscar uno publicado con resultados (AIAG MSA 4a ed.
  trae ejemplo de destructivas) y dejarlo en `datasets/`.

---

## 2. Attribute Agreement (atributos)

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
4. **Navegacion**: decidir como conviven varios metodos en la pagina. Hoy la app
   es una sola pantalla dedicada al cruzado. Con dos o mas metodos hace falta un
   selector arriba, y ahi el estandar de diseno tendra que crecer.

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
