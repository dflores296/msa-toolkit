# Despliegue

El sitio es 100 % estático, sin paso de compilación: los archivos del
repositorio son el sitio.

## GitHub Pages

Pasos de publicación:

1. En GitHub: **Settings → Pages → Source: Deploy from a branch**, rama `main`,
   carpeta `/ (root)`.
2. Queda publicado en `https://dflores296.github.io/msa-toolkit/`, y las pruebas
   de validación en `https://dflores296.github.io/msa-toolkit/tests/`.

El archivo `.nojekyll` desactiva el procesamiento con Jekyll: el sitio se sirve
tal cual, sin sorpresas con rutas ni carpetas.

## Al cambiar CSS o JavaScript, sube la versión

Los enlaces a los assets llevan un sufijo `?v=AAAAMMDDx`:

```html
<link rel="stylesheet" href="assets/css/style.css?v=20260830b">
```

GitHub Pages sirve el CSS y el JS con caché, así que sin ese sufijo un
navegador que ya visitó el sitio sigue usando los archivos viejos aunque el
despliegue haya sido correcto: la página se ve igual y parece que no se
publicó nada. Cambia el valor en `index.html` y en `tests/index.html` (mismo
valor en los dos) cada vez que toques un archivo de `assets/` o de `tests/`.

## Sin servidor

También funciona sin servidor: basta abrir `index.html` con doble clic, porque
Chart.js va servido desde el propio repositorio y no hay dependencias externas.
