# Calculadora de fichas

Herramienta independiente en Inicio y navegación «Fichas». No importa módulos de partidas, perfiles ni estadísticas. Inventario inicial: 100/150/100/100/25/25 para denominaciones 1/5/25/100/500/1000.

## Optimización y exactitud

- Guaraníes y cantidades enteros seguros; valores incompatibles se rechazan sin redondear. Las ciegas manuales muestran el stack efectivo, aunque difiera de 50/100bb.
- Enumeración acotada de combinaciones exactas y búsqueda conjunta con poda, simetría y memoización. Minimiza fichas totales dentro de cada fase; prefiere igualdad si empata. No usa greedy para asignar stacks.
- Mínimo: busca primero stacks de hasta 14, luego alternativa sin ese límite.
- Equilibrado: primero stacks de hasta 14 que permitan pagar SB y BB por separado y reservando otra pareja de ciegas en el banco; relaja reserva, luego jugabilidad, antes de superar 14. Cada relajación relevante se indica. Esto prioriza el límite pedido sobre jugabilidad cuando no es posible cumplir ambos.
- El banco conserva al menos esa reserva cuando la primera fase es viable; no garantiza cambio ilimitado durante toda la noche.
- La búsqueda corre en un Web Worker. Límite de 2 millones de pasos y hasta 1.000 fichas por denominación. Si termina sin certificar óptimo, lo indica explícitamente; nunca confunde tiempo agotado con imposibilidad matemática. Puede pedir ajustar datos en inventarios complejos.

## Persistencia y movimientos

`poker_settings`, clave exclusiva `chip_calculator_v1`, almacena configuración base y reparto confirmado por separado. Guardar preferencias no descuenta el inventario ni cambia el banco confirmado. Calcular solo genera una simulación.

GET permite consultar inventario; PUT exige `requireAdmin` y valida configuración, stacks, existencias, conservación de valor y que la ficha recibida esté en circulación. Comparación atómica de la revisión anterior evita sobrescrituras entre dispositivos. No se añaden tablas ni se modifican otras claves.

Los cambios se aplican al banco confirmado mediante un registro reproducible. Deshacer quita el último movimiento. Hasta 500 movimientos por banco. Confirmar un nuevo reparto o cerrar banco pide confirmación y reemplaza su registro, manteniendo las preferencias base.

## Comprobación

`node --test tests/chip-calculator*.test.mjs` cubre 2–10 jugadores, equivalencia, ciegas incompatibles, falta de stock, repartos diferentes, alternativas de 15+, conservación, reversión, permisos, persistencia y concurrencia. Incluye comparación con un oráculo exhaustivo independiente para inventarios pequeños.

Prueba visual local: worker en navegador, copiar reparto, confirmar, registrar cambio, recargar, deshacer y vista en iframe de 390px. Las fichas son CSS basado en colores/valores aportados, sin fotografía de referencia en el adjunto.

## Escalas permitidas

Los nuevos cálculos y preferencias solo admiten ×100 o ×1.000. Automático evalúa ambas con los dos modos de reparto; manual selecciona una escala cerrada. Ciegas incompatibles generan una sugerencia explícita con las bb reales, nunca un redondeo aplicado. Las ciegas manuales pueden diferir de 50/100bb, con advertencia visible.

Los bancos confirmados con una escala anterior se conservan y se identifican como tales. El servidor permite continuar sus movimientos, pero no crear ni alterar un reparto con una escala retirada. El límite de búsqueda cuenta también cada candidato de la asignación conjunta para evitar bloqueos en inventarios complejos.
