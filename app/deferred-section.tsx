import { useEffect, useState, type ComponentType } from "react";

// Navigation, unsaved forms and the active table remain mounted if a tool's
// download fails. Only successful imports are cached across subsequent visits.
export function deferredSection<P extends object>(label: string, load: () => Promise<{default: ComponentType<P>}>) {
  let ready: ComponentType<P> | null = null;
  let pending: Promise<ComponentType<P>> | undefined;
  function request() {
    return pending ??= load().then(module => ready = module.default).catch(error => {
      pending = undefined;
      throw error;
    });
  }
  return function DeferredSection(props: P) {
    const [Panel, setPanel] = useState<ComponentType<P> | null>(() => ready);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    useEffect(() => {
      if (Panel) return;
      let current = true;
      request().then(panel => { if (current) setPanel(() => panel); },
        () => { if (current) setFailed(true); });
      return () => { current = false; };
    }, [Panel, attempt]);
    if (Panel) return <Panel {...props} />;
    return <div className="feature-loading" role="status">{failed ? <>
      No se pudo abrir {label}. <button className="secondary" onClick={() => { setFailed(false); setAttempt(n => n + 1); }}>Reintentar</button>
    </> : <>Cargando {label}…</>}</div>;
  };
}
