import { requireAdmin } from "../../../lib/admin-auth";
import { ensureAppSchema } from "../../../lib/app-storage";
const headers = { "Cache-Control": "private, no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers });
function failure(error: unknown) {
  if (error instanceof Response) {
    error.headers.set("Cache-Control", "private, no-store");
    return error;
  }
  return json({ error: "No se pudieron guardar o cargar las notas. Intentá nuevamente." }, 500);
}
export async function GET(request: Request) {
  try {
    await requireAdmin(request);
    const db = await ensureAppSchema();
    const notes = await db.prepare("SELECT id, body, created_at AS createdAt FROM poker_admin_notes ORDER BY created_at DESC, id DESC").all();
    return json({ notes: notes.results });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    await requireAdmin(request);
    const input = await request.json().catch(() => null);
    if (typeof input?.body !== "string" || !input.body.trim() || input.body.length > 4000)
      return json({ error: "Escribí una nota de hasta 4.000 caracteres." }, 400);
    const note = { id: crypto.randomUUID(), body: input.body.trim(), createdAt: new Date().toISOString() };
    const db = await ensureAppSchema();
    await db.prepare("INSERT INTO poker_admin_notes (id, body, created_at) VALUES (?, ?, ?)").bind(note.id, note.body, note.createdAt).run();
    return json({ note }, 201);
  } catch (error) { return failure(error); }
}
export async function DELETE(request: Request) {
  try {
    await requireAdmin(request);
    const input = await request.json().catch(() => null);
    if (typeof input?.id !== "string" || !input.id || input.id.length > 100)
      return json({ error: "Nota no válida." }, 400);
    const db = await ensureAppSchema();
    await db.prepare("DELETE FROM poker_admin_notes WHERE id = ?").bind(input.id).run();
    return json({ saved: true });
  } catch (error) { return failure(error); }
}
