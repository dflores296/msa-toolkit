# Documentación del MSA Toolkit

Índice de `docs/`. Cada entrada dice **qué es** y, sobre todo, **si describe el
estado actual o es un registro histórico**, que es la distinción que más se
presta a confusión en esta carpeta: varios documentos son informes fechados y
hay que leerlos como tales, no como referencia viva.

Última revisión: **1 de septiembre de 2026**, con `main` en `6da89cc` y
`develop` en `91032f5`.

---

## Referencia viva

Lo que describe cómo está la aplicación hoy. Si algo aquí contradice al código,
es un defecto de este documento.

| Documento | Qué es |
|---|---|
| [`../README.md`](../README.md) | Punto de entrada del proyecto: qué hace, cómo se usa, cómo se prueba y qué **no** cubre. |
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
| [`auditoria-motor-excel.md`](auditoria-motor-excel.md) | — | Los 12 defectos del motor VBA original que `anova.js` vino a reemplazar. Histórico y cerrado. |
| [`f07-validacion-gpq.md`](f07-validacion-gpq.md) | 31 ago 2026 | **Superado en parte.** Describe el GPQ cuando era el método de la aplicación. Hoy el GPQ es solo segunda opinión. Lleva recuadro de actualización. |
| [`f07-commits.md`](f07-commits.md) | 31 ago 2026 | Mapa de los ocho commits de F-07 y puntos de retorno. Los hashes siguen siendo válidos; el estado de las ramas lleva recuadro de actualización. |

## Binarios

| Archivo | Qué es |
|---|---|
| `Gage R&R Study.xlsm` | El libro Excel original, con el motor VBA que esta aplicación reemplaza. **Su nombre no se normaliza**: es el archivo tal como se recibió, y se cita por ese nombre en `auditoria-motor-excel.md`. |

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
