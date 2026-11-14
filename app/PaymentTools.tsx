"use client";
import { useEffect, useState } from "react";
import "./payment-tools.css";
const money = (n: number) => n.toLocaleString("es-PY") + " Gs.";
async function api(body?: unknown, gameId?: string) {
    const r = await fetch("/api/payments" + (gameId ? "?gameId=" + encodeURIComponent(gameId) : ""), body ? { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const data = await r.json().catch(() => ({}));
    if (!r.ok)
        throw new Error(data.error || "No se pudo completar la operación.");
    return data;
}
export function AliasEditor({ profileKey, initial, onSaved }: {
    profileKey: string;
    initial?: string;
    onSaved?: (value: string) => void;
}) {
    const [loadError, setLoadError] = useState(false);
    const [retry, setRetry] = useState(0);
    const [value, setValue] = useState(initial ?? "");
    const [loading, setLoading] = useState(initial === undefined);
    const [busy, setBusy] = useState(false);
    const [message, setMessage] = useState("");
    useEffect(() => { let alive = true; if (initial !== undefined) {
        setValue(initial);
        setLoading(false);
        return;
    } setLoading(true); setLoadError(false); setMessage(""); api().then(d => { if (alive)
        setValue(d.aliases[profileKey] || ""); }).catch(e => { if (alive) {
        setMessage(e.message);
        setLoadError(true);
    } }).finally(() => { if (alive)
        setLoading(false); }); return () => { alive = false; }; }, [profileKey, initial, retry]);
    async function save() { setBusy(true); setMessage(""); try {
        await api({ action: "alias", profileKey, alias: value });
        setValue(value.trim());
        onSaved?.(value.trim());
        setMessage("Alias guardado.");
    }
    catch (e) {
        setMessage((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <div className="bank-alias"><label>Alias <small>Privado · solo administración</small><input value={value} maxLength={160} disabled={loading || busy || loadError} autoComplete="off" spellCheck={false} placeholder="Sin alias registrado" onChange={e => setValue(e.target.value)}/></label><div className="bank-alias-actions"><button className="secondary" disabled={loading || busy || loadError} onClick={save}>{busy ? "Guardando…" : "Guardar alias"}</button><button className="secondary" disabled={!value.trim() || busy} onClick={async () => { try {
        await navigator.clipboard.writeText(value.trim());
        setMessage("Alias copiado.");
    }
    catch {
        setMessage("No se pudo copiar. Seleccioná el alias para copiarlo.");
    } }}>Copiar</button><button className="ghost" disabled={!value || busy} onClick={() => { setValue(""); setMessage("Pulsá Guardar alias para eliminarlo."); }}>Borrar</button></div>{message && <p role="status">{message}</p>}{loadError && <button className="secondary" onClick={() => setRetry(n => n + 1)}>Reintentar</button>}</div>;
}
type Row = {
    id: string;
    name: string;
    profileKey: string;
    alias: string;
    amount: number | null;
    completed: boolean;
};
export default function Transfers({ gameId }: {
    gameId: string;
}) {
    const [rows, setRows] = useState<Row[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [editing, setEditing] = useState<string | null>(null);
    async function load() { setLoading(true); setError(""); try {
        setRows((await api(undefined, gameId)).rows);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setLoading(false);
    } }
    useEffect(() => { let alive = true; setLoading(true); api(undefined, gameId).then(d => { if (alive)
        setRows(d.rows); }).catch(e => { if (alive)
        setError(e.message); }).finally(() => { if (alive)
        setLoading(false); }); return () => { alive = false; }; }, [gameId]);
    const payable = rows.filter(r => r.amount !== null && r.amount > 0), total = payable.reduce((s, r) => s + r.amount!, 0), paid = payable.filter(r => r.completed), completed = paid.reduce((s, r) => s + r.amount!, 0);
    async function toggle(row: Row) { if (busy)
        return; setBusy(true); setError(""); try {
        await api({ action: "transfer", gameId, playerId: row.id, amount: row.amount, completed: !row.completed });
        setRows(old => old.map(r => r.id === row.id ? { ...r, completed: !r.completed } : r));
        setNotice(row.completed ? "Pago marcado como pendiente." : "Pago marcado como transferido.");
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }
    return <section className="transfers-panel"><p>Registro de pagos manuales. Esta aplicación no envía dinero.</p>{loading ? <p role="status">Cargando transferencias…</p> : <><div className="transfer-totals"><article><span>Total a transferir</span><strong>{money(total)}</strong></article><article><span>Transferido</span><strong className="positive">{money(completed)}</strong></article><article><span>Pendiente</span><strong>{money(total - completed)}</strong></article></div><p>{paid.length} de {payable.length} transferencias completadas</p><progress max={Math.max(1, payable.length)} value={paid.length} aria-label="Progreso de transferencias"/>{rows.some(r => r.amount === null) && <p className="form-error">Hay capitales sin registrar. No se incluyen en los totales; no se usa la ganancia neta para estimarlos.</p>}<div className="transfer-list">{rows.map(row => <article className={"transfer-row " + (row.completed ? "paid" : "")} key={row.id}><div className="transfer-name"><strong>{row.name}</strong><span>Capital final</span><b>{row.amount === null ? "No registrado" : money(row.amount)}</b></div><div className="transfer-alias"><span>{row.alias || "Sin alias registrado"}</span><div><button className="secondary" disabled={!row.alias} onClick={async () => { try {
        await navigator.clipboard.writeText(row.alias);
        setNotice("Alias copiado.");
    }
    catch {
        setError("No se pudo copiar el alias.");
    } }}>Copiar</button><button className="secondary" onClick={() => setEditing(editing === row.id ? null : row.id)}>Editar alias</button></div></div>{row.amount !== null && row.amount > 0 ? <label className="transfer-check"><input type="checkbox" checked={row.completed} disabled={busy} onChange={() => toggle(row)}/>{row.completed ? "Transferido" : "Pendiente"}</label> : <span>{row.amount === 0 ? "Sin pago pendiente" : "Sin capital registrado"}</span>}{editing === row.id && <AliasEditor key={row.profileKey} profileKey={row.profileKey} initial={row.alias} onSaved={alias => setRows(old => old.map(r => r.profileKey === row.profileKey ? { ...r, alias } : r))}/>}</article>)}</div></>}{error && <div role="alert"><p className="form-error">{error}</p><button className="secondary" disabled={busy} onClick={load}>Actualizar lista</button></div>}{notice && <p role="status">{notice}</p>}</section>;
}
