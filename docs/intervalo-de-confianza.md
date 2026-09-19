# Intervalo de confianza del %GRR

Qué método publica el intervalo, por qué el intervalo **no** dictamina, y dónde
está el respaldo de cada fórmula.

El %GRR es una estimación, no un número exacto: doce estudios del **mismo**
sistema dan entre 20 % y 45 %. La aplicación publica su intervalo con 95 % de
confianza por omisión (seleccionable entre 90, 95 y 99).

**Qué método se usa.** Los **tres modelos** —cruzado con interacción, cruzado
sin ella y anidado— sacan el intervalo de **MLS** (*Modified Large Sample*), con
la **aproximación de Satterthwaite** cuando la cuadrática del MLS no tiene
solución real. Es el método publicado por Minitab para los intervalos de razones
de varianza, procedente de Burdick & Graybill (1992); vive en
`assets/js/mls.js`. Ninguno es ya experimental.

El **GPQ** sigue implementado y accesible con `options.method = 'GPQ'`, pero ya
no es el método de ningún modelo: se conserva como **segunda opinión
independiente**, y es lo que las pruebas usan de juez. Su matemática no comparte
nada con la de las cuadráticas, y por eso caza errores de transcripción que la
cobertura sola no detecta.

De dónde salió cada fórmula, las diez erratas encontradas en la fuente y los
puntos donde esta implementación se aparta de lo impreso —con el álgebra que lo
justifica— están en **[`mls-transcripcion.md`](mls-transcripcion.md)**. Lo que le queda por rematar
—el cotejo contra una corrida real de Minitab, sobre todo— está en
**[`f07-cabos-sueltos.md`](f07-cabos-sueltos.md)**.

**El intervalo no dictamina**, y tener ya el método publicado no reabre esa
política. Quien dictamina es la **estimación puntual** con las bandas AIAG.
Cuando el intervalo cruza un límite de evaluación, lo único que se publica es una
advertencia de lectura —«interpreta la clasificación puntual con precaución»—,
nunca una categoría. Los dos motivos por los que se retiró el dictamen por
intervalo son geométricos y ajenos al método, así que cambiar de método no los
arregla; están medidos en la cabecera de `assets/js/interval.js`.

Se valida por **cobertura** y por concordancia con un segundo método
independiente, no contra una tabla copiada: `tests/tests-mls.js` comprueba que el
intervalo colapsa sobre el estimador puntual cuando no hay incertidumbre, que
concuerda con el GPQ donde los dos son de fiar y que cubre a la tasa nominal.
`tests/mls-cobertura.js` regenera la evidencia. El MLS es determinista por
construcción —no simula nada—, y el GPQ también lo es: su semilla sale de los
propios cuadrados medios, así que el mismo estudio da siempre el mismo
intervalo.

Consecuencia que conviene saber de antemano: un estudio 10×3×3 **no alcanza** a
clasificar un gage cuyo %GRR ronda el umbral, porque con 3 operadores la
reproducibilidad tiene 2 grados de libertad. Eso ya era verdad antes; ahora se
ve.

## Documentos relacionados

| Documento | Qué aporta |
|---|---|
| [`mls-transcripcion.md`](mls-transcripcion.md) | De dónde salió cada fórmula, las diez erratas de la fuente y dónde la implementación se aparta de lo impreso |
| [`mls-fuente-minitab.md`](mls-fuente-minitab.md) | El documento técnico de referencia del método MLS. Material de origen |
| [`f07-cabos-sueltos.md`](f07-cabos-sueltos.md) | Lo que queda por rematar, con el cotejo contra Minitab a la cabeza |
| [`f07-validacion-gpq.md`](f07-validacion-gpq.md) | Histórico: el GPQ cuando era el método de la aplicación |
