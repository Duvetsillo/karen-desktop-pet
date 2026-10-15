# Karen Desktop Pet

Mascota original para Windows 11 x64, integrada con el asistente existente en
OpenClaw. El cliente no ejecuta otro cerebro de IA. El proyecto Python original
de `C:\karen` permanece intacto.

## Instalar y abrir

1. Ejecuta `release/Karen Desktop Pet Setup 1.0.0.exe` y elige instalación para tu
   usuario. No requiere instalar Node, Python, Rust ni herramientas C++ para la mascota.
2. Abre **Karen Desktop Pet** desde Inicio o el acceso directo. Aparece en el
   escritorio y en la bandeja de Windows.
3. Doble clic sobre Karen abre los ajustes. En **OpenClaw**, usa
   `ws://127.0.0.1:18789`, agente `main` y autenticación local.
4. Activa **Sistema → Iniciar con Windows** si quieres verla al entrar en tu cuenta.
5. Activa **Voz → Leer las respuestas** para habilitar voz y sincronización real.

El instalador no tiene firma Authenticode: Windows puede mostrar un aviso de editor
desconocido. El ejecutable sin instalar también está en
`release/win-unpacked/Karen Desktop Pet.exe`; debe conservar toda su carpeta.

## Controlar a Karen

- Arrastrar el cuerpo: mover entre posiciones o monitores. La posición y la escala
  se conservan. Si desaparece un monitor, la ventana vuelve a un área visible.
- Clic: un saludo. Doble clic: ajustes. Clic derecho: menú nativo.
- La zona vacía deja pasar los clics usando una máscara alfa del personaje.
- **Ignorar todos los clics**, en el menú: atraviesa también el personaje.
- **Ctrl+Alt+K** o clic en la bandeja: mostrar a Karen y recuperar el control.
- El botón de conversación abre un campo breve. Enter envía; Shift+Enter inserta
  una línea en la conversación del panel.
- **Detener** cancela voz y solicita `chat.abort` para el turno activo.
- El reposo reduce la luminosidad y los FPS. El modo de bajo consumo utiliza 15 FPS
  y elimina partículas. Los efectos también se reducen si cae la tasa de cuadros.

## OpenClaw

Se inspeccionaron la instalación local **2026.9.5**, su documentación y la
configuración real. El adaptador utiliza los paquetes oficiales fijados en
**2026.8.1**, protocolo de cable **v4**. No usa endpoints de conversación inventados.

- WebSocket con `connect.challenge`, firma Ed25519 y autenticación token/contraseña.
- Identidad de cliente `webchat`, nombre visible Karen Desktop Pet, rol `operator`.
- Permisos solicitados: `operator.read` y `operator.write`. Capacidad `tool-events`.
- Sesión: `agent:main:main`; cambia con el identificador de agente de Ajustes.
- Métodos: `chat.send`, `chat.history`, `chat.abort`.
- Eventos `chat`: status, deltaText incremental o snapshot acumulativo, final,
  aborted y error. Eventos `agent`: lifecycle y tool, asociados por runId a esta sesión.
- Reconexión del cliente oficial con retroceso exponencial de 1 a 30 segundos y
  detección de fallos de autenticación que requieren atención.
- No repite órdenes automáticamente después de una confirmación incierta.

La autenticación local lee `~/.openclaw/openclaw.json` (JSON), o
`OPENCLAW_CONFIG_PATH`, únicamente para un Gateway loopback cuyo puerto coincide.
También admite `OPENCLAW_GATEWAY_TOKEN` / `OPENCLAW_GATEWAY_PASSWORD`. Las referencias
SecretRef que requieran un resolver externo se configuran mediante esas variables
o mediante el campo de token seguro de la mascota. No se resuelven ejecutando comandos
arbitrarios del archivo de configuración.

Para otro Gateway, usa `wss://` y **Token guardado en este equipo**. Los tokens se
asocian al origen del Gateway. La clave privada y los tokens de dispositivo se
persisten con Electron safeStorage/DPAPI, vinculados a tu usuario Windows. No se
entregan al renderizador. No se permiten credenciales dentro de la URL.

Si OpenClaw requiere vinculación, Diagnóstico muestra su error y el identificador
de solicitud cuando el Gateway lo proporciona. Revisa `openclaw devices list` y
aprueba ese identificador con `openclaw devices approve <requestId>`. La mascota
no aprueba dispositivos ni se concede permisos administrativos.

La aplicación no inicia ni reinicia OpenClaw u Ollama. Conecta cuando el Gateway
está disponible. La selección de modelo pertenece a OpenClaw. Durante esta entrega,
por petición del usuario, se seleccionó **ollama/gemma4:31b-cloud** mediante
`openclaw models set`, y se verificó una respuesta cloud a través de Ollama.

## Voz

**Voz de Windows** genera un WAV mediante System.Speech. Prefiere una voz española
instalada; si no existe, usa la predeterminada de Windows. Puedes instalar una voz
española desde la configuración de idioma de Windows. El WAV pasa por un analizador
Web Audio: la boca y la expresión siguen energía RMS real, incluyendo silencios.
La selección de salida usa `HTMLMediaElement.setSinkId`.

**Karen expresiva local** utiliza el contrato ya existente de `expressive_service.py`:
`http://127.0.0.1:18790/health` y `/speech`, con el token leído de
`voice-models/.expressive-token`. No arranca el servicio ni sustituye su modelo.

**Reconocimiento local** utiliza `voice-runtime/Scripts/python.exe`,
`voice_worker.py` y `faster-whisper-small`. El micrófono requiere activar el
reconocimiento y pulsar su botón. Un segundo clic termina la captura; también
termina tras silencio posterior a voz o a los 60 segundos. El audio se convierte
a PCM mono de 16 kHz y se transmite por stdin al proceso local. No se guarda la
grabación. La transcripción se envía al agente seleccionado: conviene revisar las
órdenes importantes en texto, pues el reconocimiento puede equivocarse.

Los recursos de voz se buscan en `C:\karen`, o en `KAREN_PROJECT_ROOT`. No se
incluyen los modelos grandes de voz en el instalador. La reproducción y la captura
son excluyentes; se usa cancelación, control de generaciones y echoCancellation.
No se abre cámara. Los fallos de dispositivo se muestran en la interfaz.

`src/voice/audio.ts` define interfaces `TtsEngine`, `SttEngine` y `WakeWordDetector`.
`attachWakeWordDetector` permite incorporar un detector externo con pausa durante
reproducción y procesamiento. **No hay detector de palabra clave configurado ni
activación por «Karen» habilitada en esta entrega.** No se imita esa funcionalidad.

## Arquitectura

| Capa | Ubicación |
| --- | --- |
| Funciones nativas, bandeja, ventanas, atajo, IPC | `electron/main.ts` |
| Adaptador aislado del protocolo oficial | `electron/gateway.ts` |
| Credenciales cifradas y configuración validada | `electron/storage.ts`, `shared/settings.ts` |
| TTS/STT nativos | `electron/voice.ts` |
| Proyección de eventos y filtrado de texto interno | `shared/protocol.ts` |
| Máquina de estados y estado de interfaz | `src/state/` |
| Renderizador y piezas originales intercambiables | `src/pet/` |
| Audio, análisis RMS y adaptadores | `src/voice/audio.ts` |
| Panel y controles de la mascota | `src/main.tsx` |

La apariencia no importa OpenClaw. Puede sustituirse `PetRenderer` y sus texturas
sin cambiar el adaptador. Zustand contiene estados de interacción; las señales de
audio y cursor se mantienen fuera de React para evitar rerenderizados por cuadro.
Los estados son IDLE, LISTENING, THINKING, SPEAKING, HAPPY, CONFUSED, ERROR, SLEEPING y DRAGGING.

Los ajustes se guardan atómicamente en el directorio userData de la aplicación,
habitualmente `%APPDATA%/karen-desktop-pet/`. Allí están `settings.json`, `window.json`
y `vault.dpapi`. Los mensajes se mantienen en memoria; OpenClaw conserva su historial.
El diagnóstico está limitado a 120 entradas en memoria, sin texto de conversación
ni audio. El renderizador usa aislamiento de contexto, sandbox, IPC restringido,
política CSP sin eval y navegación externa bloqueada. PixiJS usa su polyfill para
entornos que prohíben eval.

## Compilar desde código

Node 24 y npm, en Windows x64:

```powershell
cd C:\karen\desktop-pet
npm ci
npm run typecheck
npm test
npm run build
npm run dev
npm run package
```

`npm run dev` compila y abre la aplicación nativa. `npm run preview` es solo la
vista de desarrollo en navegador: no tiene IPC ni una conexión simulada con OpenClaw.

Si el descargador de Electron no puede completar la descarga, usa la distribución
oficial de la versión fijada en package.json y verifica su SHA256 contra
`node_modules/electron/checksums.json`. El empaquetador acepta una distribución ya
extraída con `npm run package -- --config.electronDist=node_modules/electron/dist`.

## Verificación de esta entrega

- TypeScript estricto y build de producción: correctos.
- **11 pruebas** de configuración, máquina de estados, aislamiento de sesiones,
  contenido interno, streaming v4, firma del reto, autenticación, permisos, envío,
  exclusión de órdenes simultáneas, cancelación y reconexión: correctas.
- Aplicación nativa abierta con Electron/Playwright: renderizador, expresiones,
  cambios de ajustes, cifrado de credenciales, ocultar/mostrar y síntesis de audio.
- Ejecutable empaquetado abierto desde `release/win-unpacked`: recursos cargados
  desde `app.asar`, versión 1.0.0, panel y mascota visibles, sin errores del
  renderizador. Evidencia: `qa/packaged-results.json`.
- PNG de mascota con canal alfa real: esquina `(0, 0, 0, 0)`.
- TTS Windows → WAV → STT local probado con una frase sintética, sin micrófono.
  El reconocimiento produjo texto reconocible con un error de palabra; no es perfecto.
- Ollama local respondió; `gemma4:31b-cloud` respondió `KAREN_CLOUD_OK`.
- Auditoría de dependencias de producción: sin vulnerabilidades reportadas. Las
  herramientas de empaquetado tienen avisos moderados transitivos del registro npm;
  no forman parte del runtime distribuido.

**Pendientes externos:** el puerto OpenClaw 18789 no respondió durante las pruebas
iniciales; todavía no se afirma autenticación ni conversación contra el Gateway
real. El servicio expresivo 18790 tampoco respondió. Esos dos servicios no se
iniciaron automáticamente. La autorización para arrancar el Gateway se solicitó
por separado. La palabra clave necesita un detector externo.

**Comprobaciones manuales pendientes:** selección de dispositivos físicos de audio,
captura de voz humana, un segundo monitor físico, inicio tras reiniciar Windows y
interacción con aplicaciones exclusivas a pantalla completa. Los mecanismos están
implementados, pero estas pruebas requieren el entorno correspondiente.

Electron se eligió porque no estaban instalados Rust ni MSVC, requeridos para
compilar Tauri. Usa más RAM y ocupa más disco que Tauri. Las capturas de memoria
en `qa/native-results.json` corresponden a mascota y panel abiertos, incluyen los
procesos Chromium y no constituyen una medición estable de CPU. Cerrar ajustes
libera su renderizador. Un port futuro de la capa nativa a Tauri puede conservar
el renderizador, el contrato de estados y el panel.

Resultados y capturas: `qa/`. Pruebas adicionales: `npm run test:native`,
`npm run probe`, `npx tsx scripts/voice-probe.ts`. Esta última usa únicamente audio
sintético, no el micrófono.

## Referencias primarias

- [Cliente oficial de OpenClaw](https://docs.openclaw.ai/gateway/clients)
- [Protocolo de OpenClaw](https://docs.openclaw.ai/gateway/protocol)
- [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window)
- [Electron safeStorage](https://www.electronjs.org/docs/latest/api/safe-storage)
- [PixiJS Graphics](https://pixijs.com/8.x/guides/components/scene-objects/graphics)
- [Ollama cloud](https://docs.ollama.com/cloud)
