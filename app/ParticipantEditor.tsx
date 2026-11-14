"use client";
import { useState } from "react";
export default function ParticipantEditor({ player, roster, temporary, onSave }: {
    player: any;
    roster: any[];
    temporary: boolean;
    onSave: (action: string, value: string) => Promise<void>;
}) {
    const [action, setAction] = useState("rename"), [value, setValue] = useState(player.nickname || player.name), [busy, setBusy] = useState(false), [error, setError] = useState("");
    return <form className="form-grid participant-editor" onSubmit={async (e) => { e.preventDefault(); if (busy)
        return; if (!window.confirm(action === "remove" ? "¿Quitar a este jugador y sus movimientos de esta mesa? Los totales se recalcularán." : action === "replace" ? "¿Asignar todos estos movimientos y resultados al jugador seleccionado?" : "¿Corregir el nombre visible solo en esta partida?"))
        return; setBusy(true); setError(""); try {
        await onSave(action, value);
    }
    catch (e) {
        setError((e as Error).message);
    }
    finally {
        setBusy(false);
    } }}><label className="full">Corrección<select disabled={busy} value={action} onChange={e => { setAction(e.target.value); setValue(e.target.value === "rename" ? player.nickname || player.name : ""); }}><option value="rename">Editar nombre en esta mesa</option>{!temporary && <option value="replace">Reemplazar por jugador registrado</option>}<option value="remove">Eliminar de esta mesa</option></select></label>{action === "rename" && <label className="full">Nombre<input required maxLength={80} value={value} disabled={busy} onChange={e => setValue(e.target.value)}/><small>Conserva la identidad y estadísticas. No cambia otras partidas.</small></label>}{action === "replace" && <label className="full">Jugador correcto<select required value={value} disabled={busy} onChange={e => setValue(e.target.value)}><option value="">Seleccionar jugador</option>{roster.map(p => <option key={p.id} value={p.id}>{p.nickname || p.name}</option>)}</select><small>Se conservan buy-ins, recompras y cash-out.</small></label>}{action === "remove" && <p className="warning-box full">Se quitará solo esta participación. Tiene {player.movements.length} movimientos registrados; se retirarán de los totales de esta mesa. Su perfil y otras partidas se conservan.</p>}{error && <p className="form-error full" role="alert">{error}</p>}<button className={`full ${action === "remove" ? "danger" : "primary"}`} disabled={busy || action !== "remove" && !value.trim()}>{busy ? "Guardando…" : action === "remove" ? "Confirmar eliminación" : "Guardar corrección"}</button></form>;
}
