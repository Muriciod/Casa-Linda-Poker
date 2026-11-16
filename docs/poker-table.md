# Mesa actual: presentación

`app/PokerTable.tsx` recibe datos ya formateados desde el adaptador `MiniPokerTable`. Conserva el orden de jugadores, sus avatares y los importes calculados por `invested`, `buyInLabel` y `money`. No guarda datos ni importa módulos de cálculo o persistencia.

El archivo `public/images/table/playmat-official.png` es la imagen adjunta original, sin regenerar ni retocar sus píxeles (679 × 1055; SHA-256 `6d81907cc9ac1ef26639b6895af97f0239709492361a875ba9ce012fffbf26d5`). Su perspectiva y sectores pertenecen a la referencia. El SVG solo recorta el fondo blanco exterior y gira el conjunto 90 grados en contenedores anchos; nunca estira el dibujo. `preserveAspectRatio` y las dimensiones derivadas de la imagen mantienen la proporción.

`lib/poker-table-layout.ts` calcula el espacio del tapete y cuatro bandas para asientos. No hay coordenadas individuales por jugador ni posiciones basadas en índices fijos. Las bandas se reparten uniformemente según la cantidad de participantes. `ResizeObserver` actualiza el layout según el contenedor, incluso dentro de la cuadrícula de Inicio. El nuevo CSS está aislado de las antiguas reglas de `.felt-table` y `.table-seat`.

Las tarjetas comparten dimensiones, muestran avatar/inicial, nombre con elipsis e importe. El nombre y monto completos permanecen en el texto accesible y en el título. Se muestran hasta diez asientos y se conserva el aviso de jugadores adicionales.

## Validación

- Geometría: todos los recuentos de 0–10, anchos 240–1500 en pasos de 5 px; sin solapamientos, fuera del contenedor ni tarjetas sobre el tapete.
- Navegador: 2, 4, 6, 8, 9 y 10 jugadores en iframes de 320, 390, 768 y 1280 px. 24 combinaciones sin colisiones; relación de aspecto verificada en ambas orientaciones.
- Fotografías, iniciales y nombres largos en datos de prueba. Las rutas temporales de prueba no forman parte de producción.
- Captura con datos de prueba: `qa/mesa-actual-10-jugadores.jpg`.
