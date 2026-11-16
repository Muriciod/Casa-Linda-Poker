# Mesa actual: presentación

`app/PokerTable.tsx` recibe datos ya formateados desde el adaptador `MiniPokerTable`. Conserva el orden de jugadores, sus avatares y los importes calculados por `invested`, `buyInLabel` y `money`. No guarda datos ni importa módulos de cálculo o persistencia.

El archivo `public/images/table/playmat-official.png` es la imagen adjunta original, sin regenerar ni retocar sus píxeles (679 × 1055; SHA-256 `6d81907cc9ac1ef26639b6895af97f0239709492361a875ba9ce012fffbf26d5`). `lib/playmat-projection.ts` corrige su perspectiva fotográfica mediante una homografía en la capa de renderizado: los lados del trapecio pasan a ser paralelos y el tapete queda visto desde arriba. La corrección incluye el acortamiento longitudinal; no es un simple ensanchamiento horizontal.

Una máscara redondeada, con un pequeño margen interior, excluye el fondo blanco y sus bordes suavizados en las esquinas. Se conservan las divisiones blancas del diseño. El conjunto rectificado se escala uniformemente y gira 90 grados en contenedores anchos; el contenedor nunca estira la mesa según el espacio sobrante.

`lib/poker-table-layout.ts` ubica diez asientos según la referencia: arriba 10–1–2 (de izquierda a derecha), a la derecha 3–4 (de arriba abajo), abajo 7–6–5 (de izquierda a derecha) y a la izquierda 9–8 (de arriba abajo). Los asientos giran con el tapete y conservan su número en vertical. Con menos participantes se ocupan posiciones espaciadas en el mismo anillo, empezando por el 1. Las bandas se amplían si hace falta separar las tarjetas. `ResizeObserver` actualiza la distribución según el contenedor, incluso dentro de la cuadrícula de Inicio. El CSS está aislado de las antiguas reglas de `.felt-table` y `.table-seat`.

Las tarjetas comparten dimensiones, muestran avatar/inicial, nombre con elipsis e importe. El nombre y monto completos permanecen en el texto accesible y en el título. Se muestran hasta diez asientos y se conserva el aviso de jugadores adicionales.

## Validación

- Geometría: todos los recuentos de 0–10, anchos 240–1500 en pasos de 5 px; sin solapamientos, fuera del contenedor ni tarjetas sobre el tapete.
- Navegador: 2, 4, 6, 8, 9 y 10 jugadores en iframes de 320, 390, 768 y 1280 px. 24 combinaciones sin colisiones; relación de aspecto verificada en ambas orientaciones.
- Fotografías, iniciales y nombres largos en datos de prueba. Las rutas temporales de prueba no forman parte de producción.
- Captura con datos de prueba: `qa/mesa-actual-10-jugadores.jpg`.
- Corrección cenital: comprobación matemática de lados paralelos, simetría y extremos; revisión visual a 320 y 760 px sin restos blancos exteriores ni errores de la aplicación en consola.
