# Casa Linda Poker — copia de código

Esta carpeta contiene el código fuente de Casa Linda Poker y la configuración versionada para reconstruir la aplicación. No incluye `node_modules`, cachés, bases de datos locales ni credenciales. Las dependencias están fijadas en `package-lock.json` y se instalan con `npm ci`.

## Requisitos

- Node.js 22.13 o posterior.
- Para compilar este proyecto: Linux, `flock`, `curl`, `sha256sum` y GNU `timeout`.

## Ejecutar en desarrollo

```bash
npm ci
npm run dev
```

## Compilar y validar

```bash
npm run build
```

La compilación usa Cloudflare/Vinext. Para desplegarlo fuera de Sites, configurá los bindings D1 y R2 y las variables secretas que espera la aplicación; este respaldo no contiene credenciales.

## Subir esta copia a un repositorio GitHub nuevo

1. Descomprimí el ZIP.
2. Creá un repositorio vacío en GitHub.
3. Desde esta carpeta, ejecutá:

```bash
git init
git add .
git commit -m "Respaldo de Casa Linda Poker"
git branch -M main
git remote add origin https://github.com/USUARIO/REPOSITORIO.git
git push -u origin main
```

Reemplazá la URL de `origin` por la que te muestre GitHub. `.openai/hosting.json` conserva la configuración de la página original; publicar una copia como un proyecto aparte requiere configurar ese nuevo proyecto y sus servicios.
