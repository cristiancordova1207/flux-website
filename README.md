# flux-website

Página pública de FLUX. Sitio estático (HTML, CSS y JS), sin build.

- `index.html`: la landing.
- `styles.css`: estilos.
- `main.js`: interacciones de las demos y el enlace de descarga.
- `privacidad.html`, `terminos.html`: páginas legales provisionales.

Cloudflare Pages: framework **None**, build command vacío, output directory `/`.

## Descarga del instalador

- El instalador **no** está en este repositorio: es un asset de la GitHub Release pública de
  [`flux-releases`](https://github.com/cristiancordova1207/flux-releases/releases) (descarga pública, sin iniciar sesión).
- `release.json` es la única fuente de la versión, el enlace, el tamaño y el SHA-256 que muestra la web.
  Para una versión nueva: publica la Release en `flux-releases` y actualiza **solo** `release.json`.
- Sin JavaScript, los botones `data-download` apuntan a `…/flux-releases/releases/latest/download/FLUX-Setup.exe`.

El descargador de la web es solo una demostración visual: no hace peticiones ni descarga nada.
