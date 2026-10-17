/** Appels à l'API de l'administration (même origine, cookie de session). */

export class ApiError extends Error {
  readonly status: number;
  readonly errors: string[];
  constructor(status: number, message: string, errors: string[] = []) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
}

export async function api<T = unknown>(path: string, opts: { method?: string; body?: unknown; raw?: Blob; headers?: Record<string, string> } = {}): Promise<T> {
  const headers: Record<string, string> = { accept: "application/json", ...opts.headers };
  let body: BodyInit | undefined;
  if (opts.raw) body = opts.raw;
  else if (opts.body !== undefined) {
    headers["content-type"] = "application/json";
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api/admin/${path}`, { method: opts.method ?? "GET", headers, body, credentials: "same-origin" });
  } catch {
    throw new ApiError(0, "Serveur injoignable. Vérifiez la connexion.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; errors?: string[] };
  if (!res.ok) {
    if (res.status === 401 && path !== "login") window.dispatchEvent(new CustomEvent("admin:unauthorized"));
    throw new ApiError(res.status, data.error ?? `Erreur ${res.status}`, data.errors ?? []);
  }
  return data as T;
}
