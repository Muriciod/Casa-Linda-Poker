# Calculadora de fichas

Herramienta independiente en Inicio y navegación «Fichas». No importa módulos de partidas, perfiles ni estadísticas. Inventario inicial: 100/150/100/100/25/25 para denominaciones 1/5/25/100/500/1000.

## Optimización y exactitud

- Guaraníes y cantidades enteros seguros; valores incompatibles se rechazan sin redondear. Las ciegas manuales muestran el stack efectivo, aunque difiera de 50/100bb.
- Enumeración de repartos exactos y búsqueda conjunta con poda, simetría y memoización. Respeta el stock de toda la mesa y prefiere stacks iguales con la misma cobertura práctica; conserva el reparto mixto cuando las existencias lo requieren.
- Recomendada y Más cambio priorizan que cada jugador pueda pagar varias BB con fichas distintas. Dentro del mismo nivel, favorecen fichas para apuestas, denominaciones intermedias para cambio y una parte importante del capital en fichas grandes.
- La cantidad física se equilibra con una cobertura moderada de BB y fichas intermedias. El coste crece suavemente después de 25 y 30 fichas, sin excluir repartos mayores cuando el inventario los exige. No hay un límite fijo por jugador. El banco conserva el inventario que no se repartió y se indica si tiene cambio para las ciegas.
- La búsqueda corre en un Web Worker. Límite de 2 millones de pasos y hasta 1.000 fichas por denominación. Si termina sin certificar óptimo, lo indica explícitamente; nunca confunde tiempo agotado con imposibilidad matemática. Puede pedir ajustar datos en inventarios complejos.

## Persistencia y movimientos

`poker_settings`, clave exclusiva `chip_calculator_v1`, almacena configuración base y reparto confirmado por separado. Guardar preferencias no descuenta el inventario ni cambia el banco confirmado. Calcular solo genera una simulación.

GET permite consultar inventario; PUT exige `requireAdmin` y valida configuración, stacks, existencias, conservación de valor y que la ficha recibida esté en circulación. Comparación atómica de la revisión anterior evita sobrescrituras entre dispositivos. No se añaden tablas ni se modifican otras claves.

Los cambios se aplican al banco confirmado mediante un registro reproducible. Deshacer quita el último movimiento. Hasta 500 movimientos por banco. Confirmar un nuevo reparto o cerrar banco pide confirmación y reemplaza su registro, manteniendo las preferencias base.

## Comprobación

`node --test tests/chip-calculator*.test.mjs` cubre 2–10 jugadores, equivalencia, ciegas incompatibles, falta de stock, repartos diferentes, alternativas de 15+, conservación, reversión, permisos, persistencia y concurrencia. Incluye comparación con un oráculo exhaustivo independiente para inventarios pequeños.

Prueba visual local: worker en navegador, copiar reparto, confirmar, registrar cambio, recargar, deshacer y vista en iframe de 390px. Las fichas son CSS basado en colores/valores aportados, sin fotografía de referencia en el adjunto.

## Escalas permitidas

Los nuevos cálculos y preferencias solo admiten ×100 o ×1.000. Automático compara ambas por jugabilidad; manual conserva la escala elegida. Ciegas incompatibles generan una sugerencia explícita con las bb reales, nunca un redondeo aplicado. Las ciegas manuales pueden diferir de 50/100bb, con advertencia visible.

Los bancos confirmados con una escala anterior se conservan y se identifican como tales. El servidor permite continuar sus movimientos, pero no crear ni alterar un reparto con una escala retirada. El límite de búsqueda cuenta también cada candidato de la asignación conjunta para evitar bloqueos en inventarios complejos.

## Utilidad de las fichas según las ciegas

El modo equilibrado intenta que todos puedan cubrir varias BB con fichas distintas. Favorece las fichas de 1 BB y, cuando faltan, busca combinaciones exactas con denominaciones menores. Conserva fichas intermedias para apuestas y cambio y fichas grandes para representar el capital. El objetivo de cobertura se adapta al stack y al inventario; no es una cantidad fija de fichas por jugador.

No se exige que cada stack pague la SB exacta si una ficha o combinación de BB permite devolver la diferencia. El motor intenta conservar cambio para la mesa con el inventario sobrante, sin reducir los buy-ins ni la cobertura mínima de BB. El resultado muestra cuántos pagos se pueden hacer y avisa si es necesario preparar cambio manual.

Las escalas siguen siendo ×100/×1.000. 50.000 Gs. a 100bb implica SB 250 Gs., incompatible con ambas: se informa sin redondear.

## Maletines independientes

El selector abre por defecto Maletín 1. Sus seis denominaciones, dos escalas y datos anteriores permanecen bajo `chip_calculator_v1`. Maletín 2 usa `chip_calculator_case2_v1`, cinco valores monetarios ascendentes y existencias iniciales cero. GET/PUT con `?case=2` seleccionan esa configuración; el servidor valida que el cuerpo y el banco correspondan a ese maletín. Cada clave conserva su propio control de concurrencia y requiere administrador para escribir.

El motor de reparto se instancia con las denominaciones del maletín. Los valores personalizados se normalizan por su MCD únicamente para calcular: nunca se redondean ni se reemplazan. La búsqueda acotada, el reparto global, la prioridad de intermedias y el banco se reutilizan. Para denominaciones sin divisibilidad encadenada se usa búsqueda exacta de pagos y se desactivan las cotas basadas en esa propiedad. Los bancos confirmados conservan su propia instantánea de valores e inventario aunque después se editen las preferencias.

Cambiar de maletín mantiene el borrador del formulario mientras la calculadora está abierta; Guardar configuración persiste sus preferencias para futuras visitas. Los repartos se recalculan al modificar valores y se descartan al cambiar de maletín. Los datos de prueba de existencias no se publican como inventario real.

## Equilibrio compacto y solución de respaldo

La cobertura deseada de BB crece moderadamente con el stack y se satura; no se intenta financiar cada apuesta futura. Más cambio le da mayor peso dentro de la misma evaluación. La selección automática de escala o valores compara el coste completo después de verificar la cobertura mínima: una BB adicional no gana automáticamente frente a un reparto mucho más compacto.

Antes de la búsqueda conjunta se comparan semillas exactas con diferentes coberturas y combinaciones de un reparto igualitario. Si se agota el presupuesto de búsqueda, se conserva la mejor solución válida ya evaluada, con advertencia. Las podas por cantidad se deducen de una solución conocida y un límite inferior matemático; no son un máximo fijo de fichas. La reserva de cambio no se impone si empeora sustancialmente el reparto.

Regresión de 40.000 Gs., SB/BB 200/400, siete jugadores, stock de prueba 80 por denominación:

- 100/200/500/1.000/5.000: 20 fichas recomendadas (10×200, 3×1.000, 7×5.000), frente a 32 antes del ajuste.
- Referencia del motor con seis denominaciones 100/200/500/1.000/2.000/5.000: 20 fichas (10×200, 4×2.000, 6×5.000). Se verifica el motor genérico sin añadir colores al Maletín 2.
- Captura original, denominaciones hasta 2.000 y stock 80 por color: 42 fichas frente a 49. Con ese stock no hay capital suficiente en fichas altas para lograr un promedio de 30; se informa sin inventar la ficha de 5.000.

`tests/chip-compact.test.mjs` comprueba estas regresiones, ambos tipos de cobertura de BB, valores personalizados inmutables, selección automática, stock limitado, falta de solución y repartos mayores de 30 cuando son inevitables. No se modifican preferencias ni bancos confirmados al recalcular.
