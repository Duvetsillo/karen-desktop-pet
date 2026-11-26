# Karen Music Presence — 2026-11-26

## Incremento 1: contratos y adaptador nativo

Implementado un puente GSMTC en C#/.NET Framework con ensamblados incluidos en
Windows. `npm run build:music` usa el compilador del sistema; no instala SDK,
runtime, paquete NuGet ni modelos. El ejecutable se empaqueta en `dist-native`,
desempaquetado de ASAR. Solo se inicia al habilitar percepción musical.

Suscribe SessionsChanged, MediaPropertiesChanged, PlaybackInfoChanged y
TimelinePropertiesChanged. Suscripciones revocadas al recibir EOF; el timeout de
cierre solo afecta al helper propio. No hace polling del catálogo multimedia.
Las operaciones WinRT esperan su finalización con límite, sin consultar LLM.
Devuelve metadatos disponibles, controles, portada en memoria de hasta 256 KiB y
un identificador interno derivado de metadatos cuando la plataforma no ofrece ID.
Ese hash no se presenta como identificador oficial de canción.

GSMTC no proporciona origen de pestaña ni categoría de YouTube, y tampoco control
general de volumen. No se añaden controles inexistentes ni se envían teclas globales.
El clasificador rechaza navegadores sin evidencia de dominio, podcasts conocidos,
tutoriales, entrevistas, gameplay y YouTube ambiguo. La clasificación de plataformas
en fixtures no certifica compatibilidad real con sus aplicaciones.

Contratos en `shared/music.ts`, adaptador en `electron/music-adapter.ts`, memoria
en `electron/music-memory.ts` sobre la conexión existente de Karen Core y política
de comentarios en MusicCommentEngine. La memoria musical usa tablas aditivas,
versionadas y separa escucha estimada de preferencias explícitas. El lector Python
`ContextMemory.music` no promueve observaciones a recuerdos confirmados.

Percepción, historial y comentarios están apagados por defecto. La política conserva
10 % por canción, 45 s escuchados, 35 minutos de cooldown y dos comentarios por
tres horas. La guardia consulta escritorio y datos de uso del micrófono, sin capturar
audio. Apps de comunicación conocidas bloquean de forma conservadora aunque no se
pueda demostrar una llamada. No es un detector universal de llamadas.

Verificación inicial: compilación del puente correcta; `music-native-probe.cjs`
recibió un snapshot real de Windows y una respuesta de contexto, cerrándose por EOF.
Solo se registró el número de sesiones; no se guardaron metadatos del usuario.
Ocho pruebas de clasificación/política/memoria y transporte autenticado correctas.
El complemento usa loopback 18796; los tests de transporte usan un puerto temporal,
con aislamiento de respuestas y rechazo de orígenes web y credenciales ausentes.
La interfaz,
complemento opcional y aceptación de controles están en integración; todavía no
se declaran verificados Spotify, Apple Music, YouTube Music ni YouTube real.

Referencia primaria: [GSMTC de Microsoft](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession).
