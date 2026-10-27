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
- Pet crea un chat `openclaw-<hash de sessionKey>` y guarda cada respuesta final junto a su petición. La clave `(session_key,run_id)` evita duplicados por reconexión o eventos repetidos.
- Los turnos parciales, cancelados o fallidos no se comparten. El historial clásico existente permanece en su archivo y las tablas nuevas son aditivas.
- Karen clásica puede abrir el chat Pet desde su selector al refrescar o reiniciar. Si usa ese chat con Ollama, el historial compartido puede entrar en el contexto del modelo seleccionado. Configura un modelo local si no quieres enviar ese contenido a un proveedor remoto.
- Pet todavía no muestra ni continúa los chats creados por Karen clásica. No hay memoria por proyecto, permisos por cliente ni sincronización entre equipos en este contrato inicial. No se marca completa la fase Core.

## Verificación

`python qa/verify_core_interop.py` desde `C:\karen` crea una base temporal, escribe un chat clásico, añade un turno Pet con Node y confirma que Python lo lee. `npm test` cubre deduplicación, versión y emisión solo de respuestas finales. Estas pruebas no conectan a OpenClaw real ni migran datos privados.
