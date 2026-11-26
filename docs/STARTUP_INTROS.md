# Introducciones de inicio — 2026-11-26

Motor local Electron/React/Pixi. Seis secuencias: Breakthrough, Glass, Awakening,
Materialization, Sleepy y Surprise. Reutiliza `PetRenderer` y sus diez texturas
procedurales por apariencia; no cambia los ocho estilos, la voz, la memoria ni Core.

## Uso

Apariencia → Introducciones de inicio permite activar, seleccionar una entrada
aleatoria/fija/contextual, previsualizar, controlar saludo, efectos, volumen,
movimiento reducido, Escape, monitor y 30/60 FPS. Usa el `settings.json` existente.
La selección contextual depende de la hora local; aleatoria evita repetir la anterior
dentro del proceso. Solo el primer `ready-to-show` del Pet dispara el arranque.
Reconexiones, resume y segunda instancia no reproducen otra entrada.

Comandos deterministas de escritorio, también con Gateway desconectado:

- «Karen, reproduce tu introducción».
- «Karen, cambia tu introducción».
- «Karen, reproduce Awakening» (también cualquiera de los otros cinco nombres).
- «Karen, usa introducciones aleatorias».
- «Karen, desactiva los saludos de inicio» (silencia la voz de estas entradas).

## Responsabilidades

- `electron/startup-intros.ts`: StartupIntroManager, ventana independiente,
  monitor en coordenadas DIP, preparación, handshake, watchdog y restauración.
- `shared/startup-intros.ts`: IntroRegistry, preferencias, enrutador y IntroTimeline.
  La transición final interpola al centro y escala que usa el Pet habitual.
- `src/intros/IntroRenderer.ts`: AvatarAdapter para las capas ya existentes,
  efectos 2D, tiempo monotónico, expresiones y cierre de la reproducción.
- `src/intros/AudioCueManager.ts`: audio WAV precargado, reloj de Web Audio para
  la boca y un efecto sonoro breve creado en memoria. Nunca sintetiza voz.
- `electron/greeting-library.ts`: GreetingLibrary, versión de voz y ResourceCache
  acotado por reproducción. Ausencia/corrupción de recursos produce una entrada muda.
- `electron/intro-guard.ts`: guardia Windows limitada a la duración de la entrada.

La capa es transparente, sin bordes, sin foco y siempre deja pasar el ratón.
No necesita capturas: las grietas, fragmentos y bandas digitales son geometría
superpuesta. No modifica ni lee píxeles del escritorio. El foco previo se conserva
al no activarse la ventana. Escape usa la guardia nativa de Windows y un listener
local de teclado. Al cerrar no quedan superficies, audio ni temporizadores del motor.

Antes de crear la capa se consulta SHQueryUserNotificationState y el rectángulo
del foreground. Se omite ante pantalla completa, presentación, gaming o No molestar;
si la consulta falla se omite también. Durante la reproducción se siguen comprobando
Windows y Escape. La propia capa puede causar QUNS_BUSY: solo se tolera ese estado
con el foreground original intacto y sin fullscreen. Bloqueo, suspensión, cambio
de monitor, cambios de preferencias y recuperación de bandeja cancelan la entrada.

En el monitor habitual la llegada coincide con la mascota real. Si se elige otro
monitor, el destino se calcula en el espacio virtual y puede salir de los límites
de la capa antes de reaparecer en el monitor de origen. No se extiende una ventana
sobre todos los monitores. La validación física de esta variante sigue pendiente.

## Voz pregenerada

El catálogo de `assets/startup-greetings/catalog.json` contiene 40 textos en nueve
categorías. Los audios se guardan en `<userData>/startup-greetings`, fuera del repo.
Cada entrada del manifiesto incluye archivo, texto, duración, categoría, intros,
versión de proveedor/perfil/estilo, envolvente RMS normalizada y paso de 20 ms.
La versión debe coincidir con la configuración activa; no se sustituye la voz.
La boca lee estos datos con el reloj de reproducción, sin modelos de lip sync.
Sleepy usa la categoría horaria y Surprise prioriza humor. Las demás categorías
quedan disponibles en la biblioteca para futuras reglas de selección.

El generador offline se documenta con sus comprobaciones y mediciones en la
siguiente entrega. No se distribuyen referencias privadas ni audios en Git.

## Referencias estudiadas

- [Capri Desktop](https://github.com/lachydotmcg/capri-desktop): `app/ArtIntros.cs`
  y `app/MainframeIntros.cs`: contrato de intro, preparación de recursos, tiempo,
  dibujo, selección y liberación de superficies.
- [Startup Intros](https://github.com/lachydotmcg/capri-mods/blob/main/mods/startup-intros/startup-intros.capri-code):
  Start/Begin/Draw/Stop, duración por secuencia, señales una sola vez, imágenes
  reutilizadas y llegada hacia el rectángulo de la mascota. El mod ofrece Hijack,
  Shatter y Wake; sus geometrías de personaje son específicas de Capri.
- [Licencia de Capri](https://github.com/lachydotmcg/capri-desktop/blob/main/LICENSE.md):
  PolyForm Noncommercial 1.0.0, con avisos de atribución. No se encontró LICENSE
  explícita en la raíz de capri-mods. Esta implementación es propia: no incorpora
  código, trazados, recursos, sonidos ni identidad de Capri.

## Evidencia del primer incremento

`npm test`: 179 pruebas correctas. `npm run build`: typecheck, Vite y Electron
correctos, con el aviso conocido de tamaño del chunk Pixi. Prueba nativa con perfil
temporal: seis reproducciones a tiempo real y 48 combinaciones intro/apariencia
con reloj acelerado, todas con restauración de coordenadas y dos ventanas al acabar.
El arnés inicialmente trató el cierre por Escape como error al enviar key-up sobre
una ventana ya destruida; la comprobación corregida se registra por separado.

No se reemplazó el ejecutable instalado. Quedan pendientes la aceptación visual y
auditiva humana, Escape físico, juegos/presentaciones reales y monitores/DPI físicos
distintos. Contratos y Playwright no sustituyen esas comprobaciones.
