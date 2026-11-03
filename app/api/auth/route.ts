import { adminSetupRequired, clearSessionCookie, createSessionCookie, hashPassword, readAdminSession, verifyPassword } from "../../../lib/admin-auth";
import { ensureAppSchema, runtimeBindings } from "../../../lib/app-storage";

export async function GET(request: Request) {
  try {
    const [session, setupRequired] = await Promise.all([readAdminSession(request), adminSetupRequired()]);
    return Response.json({ authenticated: Boolean(session), username: session?.username ?? null, setupRequired });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo comprobar el acceso" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = await request.json() as { action?: string; username?: string; password?: string; setupToken?: string };
    const username = String(payload.username ?? "").trim();
    const password = String(payload.password ?? "");
    if (username.length < 3 || password.length < 10) return Response.json({ error: "Usá un usuario de 3 caracteres y una contraseña de al menos 10 caracteres" }, { status: 400 });
    const db = await ensureAppSchema();

    if (payload.action === "setup") {
      if (!(await adminSetupRequired())) return Response.json({ error: "El administrador ya fue configurado" }, { status: 409 });
      const runtime = await runtimeBindings();
      if (!runtime.ADMIN_SETUP_TOKEN || payload.setupToken !== runtime.ADMIN_SETUP_TOKEN) return Response.json({ error: "El enlace de configuración no es válido" }, { status: 403 });
      const credentials = await hashPassword(password);
      await db.prepare("INSERT INTO poker_admins (id, username, password_hash, password_salt) VALUES (?, ?, ?, ?)")
        .bind(crypto.randomUUID(), username, credentials.hash, credentials.salt).run();
      return Response.json({ authenticated: true, username }, { headers: { "Set-Cookie": await createSessionCookie(username) } });
    }

    if (payload.action === "login") {
      const row = await db.prepare("SELECT username, password_hash, password_salt FROM poker_admins WHERE username = ?")
        .bind(username).first<{ username: string; password_hash: string; password_salt: string }>();
      if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) return Response.json({ error: "Usuario o contraseña incorrectos" }, { status: 401 });
      return Response.json({ authenticated: true, username: row.username }, { headers: { "Set-Cookie": await createSessionCookie(row.username) } });
    }

    return Response.json({ error: "Acción no válida" }, { status: 400 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "No se pudo iniciar sesión" }, { status: 500 });
  }
}

export async function DELETE() {
  return Response.json({ authenticated: false }, { headers: { "Set-Cookie": clearSessionCookie() } });
}
