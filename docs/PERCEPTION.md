# Voz, audio del PC y pantalla

Estas funciones pertenecen al cliente Windows. No se inician al abrir la aplicación.
Cada operador usa sus recursos y su propio Gateway/modelo.

## Hablar y escuchar

En **Voz**, activa **Leer las respuestas**, elige una salida y pulsa **Probar voz de
Karen**. El motor Windows usa sus voces instaladas. La boca sigue la energía real.

Para STT offline instala Python 3.11 y, desde el repositorio, ejecuta:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-voice.ps1
```

El script prepara un runtime y el modelo [faster-whisper-small](https://github.com/SYSTRAN/faster-whisper)
en tu carpeta de usuario. Descarga dependencias y pesos; no contiene cuentas,
claves ni recursos del mantenedor. Si ya tienes `voice-runtime/Scripts/python.exe`
y `voice-models/faster-whisper-small/model.bin`, elige su carpeta padre en
**Voz → Elegir carpeta de reconocimiento**. El instalador solo incluye el worker,
no el modelo. Activa reconocimiento y usa el botón de micrófono de Karen o de Voz.

El dictado se transcribe localmente y se envía como mensaje a tu OpenClaw. Un segundo
clic finaliza; 1,8 segundos de silencio tras voz o 60 segundos cierran la captura.
**Detener** cancela audio y respuesta. Windows debe permitir el micrófono a apps
de escritorio. No se usa cámara ni hay detector de palabra clave instalado.

## Escuchar videos y llamadas

En **Percepción**, pulsa **Escuchar audio del PC**. Captura la salida predeterminada
de Windows mediante [WASAPI / PyAudioWPatch](https://github.com/s0d3s/PyAudioWPatch),
hasta 60 segundos. Finaliza la captura para transcribirla. No reproduce el audio
capturado y detiene la voz de Karen antes de empezar para evitar que se escuche a sí misma.
No se solicita video para capturar audio del PC. El worker usa WASAPI y se cierra
al finalizar, cancelar, ocultar Karen, cerrar ajustes o bloquear el equipo.

Revisa la transcripción y pulsa **Enviar para resumir**, o descártala. No se envía
automáticamente ni se interpreta el contenido de un video como una orden tuya.
Esta versión reconoce palabras; no identifica música ni sonidos ambientales sin
voz. Eso requiere un modelo de audio distinto del adaptador STT incluido.

## Ver la pantalla

Elige una pantalla o ventana, toma una captura puntual y revisa su vista previa.
Solo **Enviar captura** la transmite a tu Gateway. Tu modelo debe admitir imágenes;
si usas configuración explícita, su entrada en OpenClaw debe incluir `image`.
Karen no modifica esa configuración automáticamente ni cambia tu proveedor.
Las ventanas minimizadas o protegidas pueden no ser capturables.

No se guardan archivos de audio o captura en Karen ni en sus logs. La transcripción
y la imagen se mantienen en memoria para revisión. Una vez enviadas, se aplica la
retención y la política del Gateway y proveedor que tú configures. No hay vigilancia
automática de pantalla ni grabación persistente. Descarta las vistas previas al terminar.

## Pruebas de desarrollo

`npm test` comprueba protocolo, ajustes, geometría y restricciones de captura con
fixtures sintéticos. El smoke nativo completo requiere Windows, una salida de
audio, micrófono y recursos propios ya preparados:

```powershell
$env:KAREN_TEST_VOICE_ROOT = 'TU_CARPETA_DE_RECURSOS'
npm run test:perception
Remove-Item Env:KAREN_TEST_VOICE_ROOT
```

La prueba reproduce una frase sintética, comprueba STT y loopback, abre y descarta
el micrófono sin transcribirlo, y captura solo la ventana de ajustes QA. No envía
contenido al Gateway real. La visión real debe probarse aparte con una imagen
sintética y un Gateway/modelo propios.
