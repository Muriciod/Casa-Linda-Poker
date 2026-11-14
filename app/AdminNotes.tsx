"use client";
import { useEffect, useState, type FormEvent } from "react";
import "./admin-notes.css";
type Note = { id: string; body: string; createdAt: string };
export default function AdminNotes() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  async function load() {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/admin-notes", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudieron cargar las notas.");
      setNotes(data.notes);
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudieron cargar las notas."); }
    finally { setLoading(false); }
  }
  useEffect(() => { void load(); }, []);
  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy || !body.trim()) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin-notes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo publicar la nota.");
      setNotes(current => [data.note, ...current]); setBody(""); setNotice("Nota publicada y guardada.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo publicar la nota."); }
    finally { setBusy(false); }
  }
  async function remove(note: Note) {
    if (busy || !window.confirm("¿Eliminar esta nota? Esta acción no se puede deshacer.")) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/admin-notes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: note.id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "No se pudo eliminar la nota.");
      setNotes(current => current.filter(item => item.id !== note.id)); setNotice("Nota eliminada.");
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo eliminar la nota."); }
    finally { setBusy(false); }
  }
  return <section className="admin-notes" aria-labelledby="admin-notes-title">
    <header className="admin-notes-heading"><div><span className="section-kicker">TU ESPACIO PRIVADO</span><h2 id="admin-notes-title">Notas</h2><p>Ideas, recordatorios y pendientes de la casa.</p></div><span className="admin-notes-badge">Solo administrador</span></header>
    <form className="admin-notes-compose" onSubmit={save}>
      <label htmlFor="admin-note-body">Nueva nota</label>
      <textarea id="admin-note-body" placeholder="¿Qué querés recordar para la próxima mesa?" value={body} onChange={event => setBody(event.target.value)} maxLength={4000} rows={4} disabled={busy} />
      <div className="admin-notes-compose-footer"><small>{body.length.toLocaleString("es-PY")} / 4.000</small><button className="primary" type="submit" disabled={busy || loading || !body.trim()}>{busy ? "Guardando…" : "Publicar nota"}</button></div>
    </form>
    {error && <div className="admin-notes-error" role="alert">{error} <button type="button" className="secondary" disabled={busy || loading} onClick={load}>Reintentar carga</button></div>}
    <p className="admin-notes-status" role="status">{loading ? "Cargando notas…" : notice}</p>
    {!loading && !error && notes.length === 0 && <div className="admin-notes-empty">Tu tablero está listo. Publicá tu primera nota y encontrala acá cuando vuelvas.</div>}
    <div className="admin-notes-grid">{notes.map(note => <article className="admin-note-card" key={note.id}>
      <span className="admin-note-mark" aria-hidden="true">✎</span><p>{note.body}</p><footer><time dateTime={note.createdAt}>{new Date(note.createdAt).toLocaleString("es-PY", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}</time><button type="button" disabled={busy} onClick={() => remove(note)} aria-label={`Eliminar nota: ${note.body.slice(0, 50)}`}>Eliminar</button></footer>
    </article>)}</div>
  </section>;
}
