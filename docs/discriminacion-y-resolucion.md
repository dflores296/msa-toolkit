# Discriminación y resolución

Qué hace la aplicación cuando el %GRR sale en 0 %, cómo infiere el escalón con
que se anotaron las lecturas y contra qué lo compara. Es la parte del cálculo
que más se presta a leerse al revés, y por eso está separada del README.

## Qué significa un %GRR de 0 %

`Var_GRR = 0` **no** significa «instrumento deficiente», y tampoco «instrumento
perfecto». Nunca se puede observar una repetibilidad menor que el escalón con
que se anotaron las lecturas, así que un cero puede venir de tres sitios
distintos que exigen respuestas opuestas. La aplicación los separa **sin pedir
ningún campo nuevo**, mirando los propios datos:

| Estado | Qué se observó | Qué hace la aplicación |
|---|---|---|
| **Escalón observado adecuado** | El escalón se midió y no rebasa el criterio | Nada. Es el caso de casi todos los estudios y no debe estorbar |
| **Repetibilidad no medible** | Ninguna réplica difirió de otra, pero hay varios valores distintos | Publica el veredicto **sin degradarlo**, marca el NDC como *No evaluable* y avisa de que el 0 % es una **cota**, no un estimado |
| **Posible resolución insuficiente o redondeo** | El escalón se midió y rebasa el criterio | Avisa, con el escalón, los dos porcentajes y **cuál** de los dos criterios se rebasó |
| **No concluyente** | Un solo valor distinto en todo el estudio | Retira el veredicto y lo reporta como estudio no concluyente |

### Qué es —y qué no es— el valor que se infiere

Es el **escalón observado en los datos**, también llamado *resolución
aparente*. **No es la resolución nominal del instrumento**, y la aplicación no
puede conocerla: los datos solo demuestran con qué finura fueron **anotadas**
las lecturas. Un micrómetro de 0.001 mm cuyas mediciones se exportaron
redondeadas a 0.01 mm produce un escalón observado de 0.01 mm, y eso es un
hecho sobre el archivo, no sobre el equipo. Por eso el aviso dice *«posible
resolución insuficiente **o** redondeo excesivo de los datos»* y pide comprobar
con qué resolución se registró antes de concluir nada del instrumento.

### Cómo se infiere

Es la **mínima diferencia no nula entre dos lecturas del mismo operador sobre
la misma pieza en réplicas distintas**. Esas dos lecturas comparten todo salvo
el acto de medir, así que lo único que puede separarlas es el sistema de
medición. La mínima diferencia entre mediciones *cualesquiera* no sirve: si
ninguna celda varía, esa diferencia es la que hay entre dos **piezas**. Medido:
en un estudio con micrómetro de 0.001 mm sobre piezas repartidas en 2 mm, la
mínima diferencia global es 0.222 —222 veces el escalón real— y usarla
levantaría una alarma sobre un instrumento excelente. Cuando ninguna celda
varía, el escalón simplemente **no es medible**, y eso es lo que se reporta.

### Contra qué se compara el 10 %

Contra **los dos denominadores**, cada uno cuando existe:

| Criterio | Cómo se calcula | Cuándo se evalúa |
|---|---|---|
| Variación del estudio | `escalón / (k × σ_total)`, con el multiplicador activo (6 o 5.15) | Siempre que `σ_total > 0` |
| Tolerancia | `escalón / (USL − LSL)`, o el margen unilateral, o la tolerancia directa | Solo si se capturó alguna; si no, no se evalúa |

El estado final es **el peor de los dos**: basta con que **uno** rebase el 10 %
para marcar *posible resolución insuficiente* (un OR, no un AND). Un escalón que
se come el 40 % de la tolerancia es un problema aunque las piezas del estudio
estén muy dispersas y lo disimulen frente a la variación del estudio, y al
revés. El aviso nombra cuál o cuáles se rebasaron, para poder comprobarlo.

`V_grr` y `V_total` son **varianzas** (σ²) —salen de cuadrados medios y de sumas
de componentes—, y se convierten a σ con una raíz antes de compararlas con el
escalón, que está en unidades de medición.

### Constantes

El **10 %** es el criterio de discriminación de AIAG (`DISCRIMINATION_LIMIT`).
Las otras dos son **protección numérica, no criterios de calidad**, y no salen
de ningún manual: `ZERO_VARIANCE_RATIO` (1e-12) es la fracción de `Var_Total`
por debajo de la cual `Var_GRR` se considera cero —una cancelación de sumas de
cuadrados deja residuos de 1e-30 que son ruido del punto flotante—, y
`EQUALITY_EPS_RATIO` (1e-12) es la tolerancia con que dos lecturas se consideran
iguales, porque `10.3 − 10.2` no da `0.1` exacto.

### El NDC ya no imprime `inf`

Con `Var_GRR` en cero o en el ruido del punto flotante, `1.41 × σ_pieza / σ_GRR`
no significa nada: antes salía `inf` o un entero de quince cifras, y las dos
cosas se leen como «separa infinitas categorías», que es lo contrario de lo que
pasa. Ahora dice **No evaluable**, y por encima de 100 dice `> 100`, porque AIAG
solo pide 5 y el número exacto sale de dividir entre una varianza prácticamente
nula. Los dos motores usan la misma función (`ndcOf`), para que no acaben
clasificando distinto el mismo equipo.
