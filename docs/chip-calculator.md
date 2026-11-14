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

## Utilidad de las fichas según las ciegas

El modo equilibrado cubre una SB y una BB con fichas distintas. Busca además dos fichas intermedias, o una si el inventario no permite dos, reservadas aparte de las ciegas. Selecciona una denominación entre media BB y cuatro BB: prefiere múltiplos exactos y después la más cercana. Esta cantidad acotada evita llenar el stack con intermedias. Una roja de 500 Gs. nunca se considera un pago exacto de BB 400 Gs.

Dentro de cada nivel minimiza primero las fichas de valor menor que media BB y después el total físico. La búsqueda conjunta usa el inventario como límite, sin techo artificial de 14, 20 o 30; prefiere repartos iguales en empates. Conserva el banco restante. Si llega al presupuesto computacional, devuelve solo una solución comprobada y avisa que no certifica el óptimo. La alternativa Menos fichas mantiene su búsqueda de cantidad mínima y puede requerir cambio.

Las escalas siguen siendo ×100/×1.000. 50.000 Gs. a 100bb implica SB 250 Gs., incompatible con ambas: se informa sin redondear.

## Maletines independientes

El selector abre por defecto Maletín 1. Sus seis denominaciones, dos escalas y datos anteriores permanecen bajo `chip_calculator_v1`. Maletín 2 usa `chip_calculator_case2_v1`, cinco valores monetarios ascendentes y existencias iniciales cero. GET/PUT con `?case=2` seleccionan esa configuración; el servidor valida que el cuerpo y el banco correspondan a ese maletín. Cada clave conserva su propio control de concurrencia y requiere administrador para escribir.

El motor de reparto se instancia con las denominaciones del maletín. Los valores personalizados se normalizan por su MCD únicamente para calcular: nunca se redondean ni se reemplazan. La búsqueda acotada, el reparto global, la prioridad de intermedias y el banco se reutilizan. Para denominaciones sin divisibilidad encadenada se usa búsqueda exacta de pagos y se desactivan las cotas basadas en esa propiedad. Los bancos confirmados conservan su propia instantánea de valores e inventario aunque después se editen las preferencias.

Cambiar de maletín mantiene el borrador del formulario mientras la calculadora está abierta; Guardar configuración persiste sus preferencias para futuras visitas. Los repartos se recalculan al modificar valores y se descartan al cambiar de maletín. Los datos de prueba de existencias no se publican como inventario real.
