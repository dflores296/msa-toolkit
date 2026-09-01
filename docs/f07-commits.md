# F-07 — Mapa de commits y puntos de retorno

**Para qué sirve este documento.** F-07 es, con diferencia, el hallazgo más
extenso de la auditoría: ocho commits, dos módulos nuevos y unas 4 000 líneas
entre código, pruebas y documentación. Si en algún momento hay que deshacer
parte de ese trabajo, esto dice **qué commit deshace qué** y **a qué punto
volver**, sin tener que reconstruirlo leyendo el historial.

Escrito el 31 de agosto de 2026, con `develop` en `bbccad8`. Los hashes de los
commits de F-07 y los puntos de retorno **no han cambiado** y siguen siendo
válidos; lo que sí cambió es dónde está cada rama (ver el recuadro siguiente).

---

## Antes que nada: dónde está cada cosa

> **Actualizado el 1 de septiembre de 2026.** `develop` se fusionó en `main`
> con el commit de merge `6da89cc`, así que el aviso original de este apartado
> —«`main` no tiene nada de la auditoría»— **ya no aplica**.
>
> ```
> origin/main     6da89cc   ← merge de develop. YA tiene toda la auditoría.
> origin/develop  91032f5   ← rama de trabajo, sin commits pendientes de subir.
> ```
>
> Desplegar desde `main` hoy despliega la aplicación **posterior** a la
> auditoría, que es lo que se quiere.

El estado original, y el motivo por el que este apartado existía:

```
origin/main     52b6b1e   ← intacto. NO tenía ninguna corrección de la auditoría.
origin/develop  bbccad8   ← todo el trabajo de la auditoría vivía aquí.
```

`main` era **ancestro directo** de `develop`: no había divergido, nadie
sobreescribió nada, y no hubo commits en `main` que no estuvieran en `develop`.
Por eso el merge pudo hacerse sin conflictos.

Comprobarlo en cualquier momento:

```bash
git log --oneline origin/main..origin/develop      # lo que a main le falta
git log --oneline origin/develop..origin/main      # vacío = main no ha divergido
```

---

## Los ocho commits de F-07, en orden

| # | Commit | Hora | Qué hizo |
|---|---|---|---|
| 1 | `0105a08` | 16:18 | **Primera implementación.** Aparece `interval.js` con el intervalo por GPQ, y el veredicto pasa a salir del intervalo. Es el commit que después hubo que corregir en casi todo. |
| 2 | `81508a9` | 16:41 | **El informe que encontró el error.** Añade `docs/f07-validacion-gpq.md` y `tests/evidencia-f07.js`. No toca la aplicación: mide y documenta que la afirmación «GPQ es el método de Minitab» era falsa. |
| 3 | `55c921f` | 18:19 | **La corrección de fondo.** El intervalo deja de dictaminar, se retira la atribución a Minitab, el dictamen vuelve a la evaluación puntual AIAG. Toca 12 archivos. |
| 4 | `cea0c3a` | 20:05 | Sólo documentación: traspaso de sesión. |
| 5 | `2211ece` | 13:59 | Sólo el documento técnico de referencia, subido desde la web. No toca código. |
| 6 | `7e229a3` | 20:11 | Sólo documentación: corrige el diagnóstico «las fórmulas son sólo PNG». |
| 7 | `44a5949` | 21:45 | **MLS en el modelo cruzado.** Módulo nuevo `assets/js/mls.js`, cuantiles χ² y F en `stats.js`, `docs/mls-transcripcion.md`, `tests/tests-mls.js`, `tests/mls-cobertura.js`. |
| 8 | `bbccad8` | 22:12 | **MLS en el anidado**, y las dos cuadráticas unificadas en una plantilla. |

Nota sobre el orden: `2211ece` tiene hora 13:59 pero está **después** de
`55c921f` en el historial. Se subió desde la interfaz web con otra marca de
tiempo. Guíate por el orden del historial, no por la hora.

---

## Puntos de retorno

Tres sitios donde la aplicación queda coherente y con las pruebas en verde.

### A · Antes de F-07 por completo → `31747ae`

Es el commit de F-06, padre de `0105a08`. La aplicación **no tiene intervalo de
confianza de ninguna clase**: publica el %GRR puntual y dictamina con las bandas
AIAG. Las correcciones de F-01 a F-06 están todas.

### B · Con intervalo, pero sin MLS → `7e229a3`

El intervalo existe y es GPQ, rotulado como experimental, y **no dictamina**.
Es el estado que dejó la sesión anterior. Si lo que falla es el MLS y no el
concepto de publicar un intervalo, éste es el punto al que volver.

### C · MLS sólo en el cruzado → `44a5949`

El anidado sigue con GPQ experimental. Útil si el problema aparece en el
anidado, cuyos coeficientes `a` y `b` son **derivados**, no leídos de la fuente
— es la parte de F-07 con menos respaldo documental y la primera sospechosa si
algo no cuadra.

---

## Cómo volver, sin romper nada

**Lo primero, y va en serio: no uses `git revert` sobre un commit intermedio de
F-07.** Los ocho se pisan entre sí — `55c921f` reescribe 222 líneas de
`interval.js` que `0105a08` acababa de crear, y `44a5949` y `bbccad8` vuelven a
reescribirlas. Revertir uno del medio deja conflictos en casi todos los archivos
y, peor, puede dejar el código en un estado que nunca existió y que nadie ha
probado.

La forma segura es **partir de un punto bueno**, no deshacer trozos:

```bash
# Mirar cómo estaba, sin tocar nada (se puede volver con: git switch -)
git switch --detach 7e229a3

# Trabajar desde ahí, en una rama nueva
git switch -c rescate-f07 7e229a3
```

Si de verdad hay que dejar `develop` en un estado anterior, **el historial no se
reescribe**: se añade un commit que deshace todo el bloque de una pieza, para
que quede constancia de qué pasó y cuándo.

```bash
# Deja el arbol como en <punto> pero conservando el historial
git switch develop
git restore --source=<punto> -- .
git status                      # revisa lo que va a entrar
git commit -m "Volver al estado de <punto>: <motivo>"
```

**Nunca** `git push --force` sobre `develop`: hay trabajo de varias sesiones
detrás y no está en ningún otro sitio.

### Volver sólo una parte

Si lo que hay que quitar es el MLS pero conservando el resto, no hace falta
tocar el historial: `interval.js` acepta `options.method = 'GPQ'` y devuelve el
intervalo por el método anterior. Forzarlo en la llamada de `app.js` deshace el
cambio de método sin borrar nada, y sin perder las pruebas.

---

## Cómo saber si «la cagamos»

Antes de dar por bueno cualquier retorno, y también antes de cualquier cambio
futuro sobre esto:

```bash
node tests/run-node.js          # 224 pruebas
node tests/prueba-impresion.js  # 75 comprobaciones, navegador real
node tests/prueba-diseno.js     # 50
node tests/prueba-frescura.js   # 35
```

Las suites de navegador necesitan `npm i playwright@1.56.0` — esa versión, que
es la que casa con el Chromium del entorno.

Las señales concretas de que algo se rompió en el intervalo, por orden de
utilidad:

1. **`tests/tests-mls.js` en rojo.** La prueba de regresión sobre AIAG fija
   `[14.72, 81.35]`; cualquier cambio accidental en las diez líneas de `A` o `B`
   la mueve.
2. **Un intervalo `[0, 100]`** en un estudio cruzado normal. Es la firma de la
   selección de raíz equivocada, y el motivo de que exista la prueba de
   concordancia con el GPQ.
3. **`G` fuera de (0,1) o `H` negativo.** Cola de la χ² invertida.
4. **La cobertura medida por debajo del nominal** en
   `node tests/mls-cobertura.js`. Lo que importa ahí no es la cobertura global
   sino el reparto de las dos colas.

---

## Y lo que este documento no cubre

El estado de los demás hallazgos está en
[`auditoria-2026-08-31.md`](auditoria-2026-08-31.md). Quedan **quince
pendientes**, entre ellos dos de prioridad P1: **F-14** (inyección de fórmulas
en el CSV exportado) y **F-15** («validado contra AIAG» afirmado para los tres
métodos). Cerrar F-07 no cierra la auditoría.
