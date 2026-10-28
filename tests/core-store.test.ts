import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoreStore } from '../electron/core-store';

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

function legacyArchive() {
  const directory = mkdtempSync(join(tmpdir(), 'karen-core-test-'));
  directories.push(directory);
  const path = join(directory, 'conversations.sqlite3');
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE chats (id TEXT PRIMARY KEY, title TEXT NOT NULL,
      updated TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE exchanges (id INTEGER PRIMARY KEY, chat_id TEXT NOT NULL,
      prompt TEXT NOT NULL, answer TEXT NOT NULL, ok INTEGER NOT NULL);
    CREATE TABLE preferences (key TEXT PRIMARY KEY, value TEXT);
  `);
  db.close();
  return path;
}

describe('Karen Core SQLite v1', () => {
  it('guarda un turno de OpenClaw una sola vez en el archivo clásico', () => {
    const path = legacyArchive();
    const core = new CoreStore(path);
    core.appendOpenClawTurn('agent:main:main', 'run-1', 'Revisa el servidor', 'Está activo');
    core.appendOpenClawTurn('agent:main:main', 'run-1', 'Revisa el servidor', 'Está activo');
    core.close();
    const reopened = new CoreStore(path);
    reopened.appendOpenClawTurn('agent:main:main', 'run-1', 'Revisa el servidor', 'Está activo');
    reopened.close();
    const db = new DatabaseSync(path);
    try {
      const chats = db.prepare('SELECT id,title FROM chats').all() as { id: string; title: string }[];
      expect(chats).toHaveLength(1);
      expect(chats[0].title).toBe('Revisa el servidor');
      expect(db.prepare('SELECT prompt,answer,ok FROM exchanges').all()).toEqual([
        { prompt: 'Revisa el servidor', answer: 'Está activo', ok: 1 },
      ]);
      expect(db.prepare("SELECT value FROM core_meta WHERE key='schema_version'").get()).toEqual({ value: '1' });
    } finally { db.close(); }
  });

  it('lee chats clásicos localmente sin alterar sus turnos', () => {
    const path = legacyArchive();
    const db = new DatabaseSync(path);
    const chatId = 'a'.repeat(32);
    db.prepare('INSERT INTO chats (id,title) VALUES (?,?)').run(chatId, 'Proyecto Karen');
    db.prepare('INSERT INTO exchanges (chat_id,prompt,answer,ok) VALUES (?,?,?,1)').run(chatId, 'Hola', 'Hola de nuevo');
    db.prepare('INSERT INTO exchanges (chat_id,prompt,answer,ok) VALUES (?,?,?,0)').run(chatId, 'Falló', 'Error');
    db.close();
    const core = new CoreStore(path);
    expect(core.listChats()[0]).toMatchObject({ id: chatId, title: 'Proyecto Karen' });
    expect(core.readChat(chatId)).toEqual([{ prompt: 'Hola', answer: 'Hola de nuevo' }]);
    expect(() => core.readChat('../privado')).toThrow('inválido');
    core.close();
  });

  it('comparte solo estilos de voz permitidos mediante la preferencia existente', () => {
    const path = legacyArchive();
    const core = new CoreStore(path);
    expect(core.getVoiceStyle()).toBeNull();
    core.setVoiceStyle('warm');
    expect(core.getVoiceStyle()).toBe('warm');
    expect(() => core.setVoiceStyle('invalid' as 'warm')).toThrow('desconocido');
    core.close();
    const reopened = new CoreStore(path);
    expect(reopened.getVoiceStyle()).toBe('warm');
    reopened.close();
  });

  it('rechaza una versión de esquema incompatible antes de escribir turnos', () => {
    const path = legacyArchive();
    const db = new DatabaseSync(path);
    db.exec("CREATE TABLE core_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); INSERT INTO core_meta VALUES ('schema_version','99');");
    db.close();
    expect(() => new CoreStore(path)).toThrow('no compatible');
    const unchanged = new DatabaseSync(path);
    expect(unchanged.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='core_external_turns'").get()).toBeUndefined();
    unchanged.close();
  });

  it('consulta recuerdos locales y excluye sensibles sin enviarlos al modelo', () => {
    const path = legacyArchive();
    const db = new DatabaseSync(path);
    db.exec(`CREATE TABLE core_memories (
      id TEXT, project TEXT, content TEXT, status TEXT, sensitive INTEGER,
      expires_at TEXT, updated_at TEXT);
      INSERT INTO core_memories VALUES
        ('visible','Karen','Respuesta breve','confirmed',0,NULL,'2026-10-27'),
        ('privado','Karen','Clave privada','confirmed',1,NULL,'2026-10-27'),
        ('otro','Estudio','Tesis','inferred',0,NULL,'2026-10-27');`);
    db.close();
    const core = new CoreStore(path);
    expect(core.listMemories('Karen', 'breve')).toEqual([
      { id: 'visible', content: 'Respuesta breve', status: 'confirmed' },
    ]);
    expect(core.listMemories('Karen')).toHaveLength(1);
    core.close();
  });
});
