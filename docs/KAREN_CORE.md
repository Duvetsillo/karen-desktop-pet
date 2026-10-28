# Karen Core SQLite v1: puente local inicial

Este puente es opcional y está limitado al mismo equipo. Karen clásica conserva su archivo `C:\karen\.private\conversations.sqlite3`; Desktop Pet puede escribir allí los turnos finales de su sesión OpenClaw. El adaptador usa `node:sqlite` del Electron incluido, sin proceso ni dependencia de pago adicional. El archivo debe existir antes de iniciar Pet.

## Activación local

Inicia Desktop Pet con la variable de entorno `KAREN_CORE_DB` apuntando a la ruta absoluta del archivo de conversaciones de Karen clásica. Para desarrollar desde este proyecto:

```powershell
$env:KAREN_CORE_DB = 'C:\karen\.private\conversations.sqlite3'
cd C:\karen\desktop-pet
npm run dev
```

Karen clásica usa esa ruta por defecto; también admite `KAREN_CORE_DB` para otra ruta absoluta. Pet en modo `--qa` no abre la base compartida. Un archivo ausente o incompatible deja el puente desactivado y registra un aviso. No se cambian los tokens de OpenClaw ni las confirmaciones administrativas.

## Contrato y límites

- `core_meta.schema_version = 1` identifica el formato. Una versión desconocida se rechaza.
- Una versión incompatible se comprueba antes de crear tablas del puente; abrirla no altera su esquema.
- Pet crea un chat `openclaw-<hash de sessionKey>` y guarda cada respuesta final junto a su petición. La clave `(session_key,run_id)` evita duplicados por reconexión o eventos repetidos.
- Los turnos parciales, cancelados o fallidos no se comparten. El historial clásico existente permanece en su archivo y las tablas nuevas son aditivas.
- Karen clásica puede abrir el chat Pet desde su selector al refrescar o reiniciar. Si usa ese chat con Ollama, el historial compartido puede entrar en el contexto del modelo seleccionado. Configura un modelo local si no quieres enviar ese contenido a un proveedor remoto.
- Pet puede consultar chats clásicos con `/historial listar` y `/historial ver ID`. La lectura es local, muestra los diez últimos turnos confirmados y no se envía a OpenClaw. No cambia la sesión activa ni permite continuar ese contexto en OpenClaw. No hay permisos por cliente ni sincronización entre equipos en este contrato inicial. No se marca completa la fase Core.

## Memoria local inicial

Karen clásica dispone de `/memoria guardar PROYECTO | TEXTO`, `/memoria listar PROYECTO`, `/memoria buscar PROYECTO | TEXTO`, `/memoria editar ID | TEXTO` y `/memoria borrar ID`. Estos comandos se procesan localmente y no se envían al modelo ni se añaden al historial. `python memory_cli.py --help` permite consultar, editar y exportar memorias, además de fijar retención y marcar inferencias. Los datos sensibles requieren `--allow-sensitive` explícito; el archivo SQLite no cifra su contenido, por lo que no se recomienda guardar secretos.

Pet ofrece solo `/memoria listar PROYECTO` y `/memoria buscar PROYECTO | TEXTO` cuando comparte la misma base. La consulta funciona sin conexión a OpenClaw, no se envía al Gateway y excluye memorias sensibles y caducadas. La respuesta se muestra en la sesión Pet sin síntesis de voz. No hay recuperación automática de memoria para respuestas del modelo ni escritura desde Pet. La memoria no equivale todavía a continuidad de conversaciones.

## Preferencia compartida inicial

Con `KAREN_CORE_DB` activo en ambas aplicaciones, el estilo de voz (`neutral`, `serene`, `warm`, `serious`, `bright` o `wry`) se guarda en la tabla `preferences` bajo `core.voice_style`. La base compartida tiene prioridad al iniciar cada aplicación; un cambio desde Ajustes de Pet o al guardar la configuración clásica actualiza esa clave. `KAREN_VOICE_STYLE` tiene prioridad en la clásica. Si la otra aplicación ya está abierta, reiníciala para aplicar el cambio. No se comparten dispositivos, motores de voz, credenciales ni ajustes de privacidad. El registro de Pet o la pantalla clásica avisan si falla la escritura compartida.

Escribe `/core estado` en Pet para consultar si el puente está activo. Muestra versión, número de chats, recuerdos no sensibles vigentes y estilo compartido. Funciona sin OpenClaw y no envía esos datos al Gateway.

## Verificación

`python qa/verify_core_interop.py` desde `C:\karen` crea una base temporal, escribe un chat clásico y memorias, añade un turno Pet con Node y confirma lectura cruzada de chats y recuerdos, además de exclusión de memorias sensibles. `npm test` cubre deduplicación, versión, consultas locales y emisión solo de respuestas finales. Estas pruebas no conectan a OpenClaw real ni migran datos privados.
