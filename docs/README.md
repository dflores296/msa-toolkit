# Documentación del MSA Toolkit

Índice de `docs/`. Cada entrada dice **qué es** y, sobre todo, **si describe el
estado actual o es un registro histórico**, que es la distinción que más se
presta a confusión en esta carpeta: varios documentos son informes fechados y
hay que leerlos como tales, no como referencia viva.

Última revisión: **19 de septiembre de 2026**.

---

## Referencia viva

Lo que describe cómo está la aplicación hoy. Si algo aquí contradice al código,
es un defecto de este documento.

| Documento | Qué es |
|---|---|
| [`../README.md`](../README.md) | **Portada del proyecto**: qué es la herramienta, para qué sirve, cómo se usa y contra qué está validada. Descriptivo, sin notas de desarrollo. |
| [`motores.md`](motores.md) | Los tres motores de cálculo: contra qué se valida cada uno, cómo se identifica una pieza en cada método y cómo se elige la categoría de rechazo. |
| [`discriminacion-y-resolucion.md`](discriminacion-y-resolucion.md) | Qué significa un `%GRR = 0 %`, cómo se infiere el escalón con que se anotaron las lecturas, contra qué se compara el 10 % y qué constantes intervienen. |
| [`intervalo-de-confianza.md`](intervalo-de-confianza.md) | El intervalo del %GRR: qué método lo calcula (MLS, con el GPQ de segunda opinión) y por qué **no** dictamina. Puerta de entrada a los documentos de F-07. |
| [`pruebas.md`](pruebas.md) | Qué cubre cada suite, las tres herramientas de navegador que no corren en CI, y **qué sigue sin cubrirse**. |
| [`despliegue.md`](despliegue.md) | Publicar en GitHub Pages, el versionado de los assets y el uso sin servidor. |
| [`estandar-de-diseno.md`](estandar-de-diseno.md) | El estándar de interfaz y de redacción que sigue la aplicación. Se aplica a cualquier cambio de pantalla. |
| [`mls-transcripcion.md`](mls-transcripcion.md) | **De dónde salió cada fórmula de `assets/js/mls.js`**: qué se leyó verbatim, las diez erratas de la fuente, y los puntos donde la implementación se aparta de lo impreso con el álgebra que lo justifica. Es el respaldo del intervalo de confianza. |
| [`mls-fuente-minitab.md`](mls-fuente-minitab.md) | El documento técnico de referencia sobre el método MLS del que se trabajó. Material de origen, no escrito por este proyecto. |
| [`f07-cabos-sueltos.md`](f07-cabos-sueltos.md) | Lo que a F-07 le queda por rematar, con el cotejo contra Minitab a la cabeza. **Es la lista de trabajo pendiente del intervalo.** |
| [`plan-siguientes-metodos.md`](plan-siguientes-metodos.md) | Qué métodos MSA podrían venir después y en qué orden. |
| [`investigacion-metodos-msa.md`](investigacion-metodos-msa.md) | Panorama de los métodos MSA existentes, más allá de los tres implementados. Material de investigación. |
| [`instrucciones-claude-code.md`](instrucciones-claude-code.md) | Convenciones de trabajo con el asistente en este repositorio. |

## Registro histórico

Informes fechados. **Se conservan íntegros a propósito**: reescribirlos para que
digan lo de hoy destruiría el registro de qué se sabía y cuándo. Los que han
sido superados por trabajo posterior llevan un recuadro de actualización al
principio que dice exactamente qué partes ya no aplican — **lee ese recuadro
antes que el cuerpo del documento.**

| Documento | Fecha | Estado |
|---|---|---|
| [`auditoria-2026-08-31.md`](auditoria-2026-08-31.md) | 31 ago 2026 | **Vigente como lista de hallazgos.** Quince siguen pendientes, dos de ellos P1 (F-14, F-15). La tabla de estado está al día; el cuerpo de cada hallazgo cerrado es histórico. |
| [`auditoria-motor-excel.md`](auditoria-motor-excel.md) | — | Auditoría de un libro de Excel con macros que resolvía el mismo estudio: 12 defectos en su motor de cálculo, con la evidencia numérica de cada uno. Histórico y cerrado; **el libro auditado no está en el repositorio** y el documento no describe a la aplicación. |
| [`f07-validacion-gpq.md`](f07-validacion-gpq.md) | 31 ago 2026 | **Superado en parte.** Describe el GPQ cuando era el método de la aplicación. Hoy el GPQ es solo segunda opinión. Lleva recuadro de actualización. |
| [`f07-commits.md`](f07-commits.md) | 31 ago 2026 | Mapa de los ocho commits de F-07 y puntos de retorno. Los hashes siguen siendo válidos; el estado de las ramas lleva recuadro de actualización. |

## Binarios

| Archivo | Qué es |
|---|---|
| `portada.png` | Captura de la aplicación que encabeza el README. Se regenera con Playwright cargando el ejemplo AIAG en el método cruzado. |

---

## Las cifras se generan

Tres bloques de esta documentación los escribe `tools/build-cifras.js`, entre
marcadores `CIFRAS:INICIO` y `CIFRAS:FIN`. **No se editan a mano: se regeneran.**

| Archivo | Bloque | De dónde sale |
|---|---|---|
| [`../README.md`](../README.md) | `validacion` | Correr el motor cruzado sobre `datasets/aiag-msa4.json` |
| [`motores.md`](motores.md) | `validacion` | La misma tabla, que antes había que acordarse de cambiar en los dos sitios |
| [`pruebas.md`](pruebas.md) | `pruebas` | Contar las pruebas que registran las suites de `tests/run-node.js` |

```bash
node tools/build-cifras.js            # reescribe los bloques
node tools/build-cifras.js --check    # no escribe: falla si se despegaron
```

En integración continua corre con `--check`, que **falla el build** en dos casos:
si un bloque dejó de coincidir con los datos, y si el motor dejó de reproducir
los valores publicados por Minitab. El segundo importa porque el primero solo
garantiza que el README diga lo que el motor calcula hoy, no que el motor siga
estando bien.

Existe porque las cifras estaban transcritas y se despegaron: `pruebas.md`
publicaba 192 pruebas cuando la suite corría 230, y la tabla de validación vivía
duplicada en dos archivos. La única cifra escrita a mano que queda es la columna
**Minitab publicado**, que es una constante externa y no algo que este
repositorio pueda calcular.

---

## Convenciones de esta carpeta

- **Nombres en minúsculas y con guiones.** Sin espacios, acentos ni paréntesis:
  un nombre con espacios obliga a escribir enlaces con `%20` que nadie puede
  leer ni revisar en un diff.
- **Un informe fechado no se reescribe.** Si el trabajo posterior lo supera, se
  le añade un recuadro de actualización al principio, con fecha, que diga qué
  sigue siendo correcto y qué ha quedado obsoleto.
- **Los enlaces entre documentos son relativos** y dentro de `docs/` van sin el
  prefijo `docs/`.
