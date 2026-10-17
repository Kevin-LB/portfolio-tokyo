import { t } from "../content/i18n";
import { CONTACT, SITE } from "../content/site";
import { UI } from "../content/ui";

/**
 * Le formulaire « Envoyer un signal », commun à la tour et à la version
 * texte. Le message part au serveur (il arrive dans la boîte de
 * l'administration) ; sans serveur (hébergement statique), on retombe sur
 * la messagerie du visiteur, comme avant. Le champ `site` est un piège à
 * robots : invisible, il doit rester vide.
 */

export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Valide le formulaire, l'envoie, et affiche l'issue. Vrai si le message est parti. */
export async function submitSignal(form: HTMLFormElement): Promise<boolean> {
  const data = new FormData(form);
  const name = String(data.get("name") ?? "").trim();
  const email = String(data.get("email") ?? "").trim();
  const subject = String(data.get("subject") ?? "").trim();
  const message = String(data.get("message") ?? "").trim();
  const trap = String(data.get("site") ?? "");
  const err = form.querySelector<HTMLElement>(".form-error")!;
  const sent = form.querySelector<HTMLElement>(".form-sent")!;
  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
  const fail = (m: string, field?: string) => {
    err.textContent = m;
    err.hidden = false;
    sent.hidden = true;
    if (field) form.querySelector<HTMLElement>(`[name="${field}"]`)?.focus();
    return false;
  };
  if (!name) return fail(t(UI.errName), "name");
  if (!email) return fail(t(UI.errEmailEmpty), "email");
  if (!EMAIL_PATTERN.test(email)) return fail(t(UI.errEmailBad), "email");
  if (message.length < 12) return fail(t(UI.errMessage), "message");
  err.hidden = true;
  if (button) button.disabled = true;
  try {
    const res = await fetch("/api/contact", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ name, email, subject, message, site: trap }),
    });
    if (res.ok) {
      form.reset();
      sent.textContent = t(UI.formSent);
      sent.hidden = false;
      return true;
    }
    if (res.status === 429) return fail(t(UI.errTooMany));
    if (res.status === 400) return fail(t(UI.errInvalid));
    if (res.status !== 404 && res.status !== 405) return fail(t(UI.errServer));
  } catch {
    // Pas de serveur joignable : la messagerie du visiteur prend le relais.
  } finally {
    if (button) button.disabled = false;
  }
  const body = `${message}\n\n— ${name}\n${email}`;
  location.href = `mailto:${CONTACT.email}?subject=${encodeURIComponent(`[${SITE.name}] ${subject}`)}&body=${encodeURIComponent(body)}`;
  sent.textContent = t(UI.formSentMail);
  sent.hidden = false;
  return true;
}
