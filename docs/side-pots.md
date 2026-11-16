# Calculadora de Side Pots

Accesible desde Inicio y Fichas. Herramienta exclusivamente local: no llama APIs de escritura ni guarda resultados oficiales. Importar una mesa copia únicamente identificadores y nombres, nunca buy-ins como apuestas. Las entradas son aportaciones totales de una mano, en guaraníes enteros.

El motor puro descompone las aportaciones en niveles. Los folds aportan pero no son elegibles. Un nivel con un único aportante se devuelve; niveles adyacentes con los mismos elegibles se combinan. Los estados con dinero igualado entre jugadores todos retirados y sin ganador elegible se rechazan con una explicación para corregir la entrada, en lugar de inventar un beneficiario.

Los escenarios potenciales son independientes y no se suman. La distribución final exige ganadores elegibles en todos los pozos. Cobra incluye premios y devolución, y balance resta el aporte. No hay rake. Cada reparto comprueba conservación exacta.

La unidad indivisible es 1 Gs. por defecto y puede ajustarse. Los aportes deben ser múltiplos. En empates, los sobrantes se asignan desde el jugador elegido a la izquierda del botón, siguiendo el orden de filas y saltando no ganadores. El usuario debe ingresar las filas en orden horario.

Validación: siete pruebas específicas, incluyendo múltiples all-ins, folds, iguales, devoluciones, empates y 300 configuraciones contrastadas con un cálculo independiente por unidad. Suite completa: 110 pruebas. Revisión en navegador del flujo de premios, carga de nombres y formulario a 390 px. No se hicieron cambios en datos de producción.
