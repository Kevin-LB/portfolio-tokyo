import { api } from "../api";
import { button, confirmDialog, formatDate, h, toast, fill } from "../dom";
import type { Page } from "../main";
import { refreshUnread } from "../main";
import { state } from "../state";

type Msg = { id: number; created_at: string; name: string; email: string; subject: string; body: string; handled: number };

export async function messagesPage(): Promise<Page> {
  let list = await api<Msg[]>("messages");
  let open = list.find((m) => !m.handled)?.id ?? list[0]?.id;
  const box = h("div", { class: "a-inbox" });
  const sync = async () => {
    await refreshUnread();
    state.dirty = new Set(state.dirty); // déclenche le rafraîchissement de la barre latérale
  };
  const render = () => {
    const m = list.find((x) => x.id === open);
    fill(box, 
      h(
        "ul",
        { class: "a-inbox-list" },
        list.length
          ? list.map((x) =>
              h(
                "li",
                null,
                h(
                  "button",
                  { type: "button", class: `a-inbox-item${x.id === open ? " is-open" : ""}${x.handled ? "" : " is-new"}`, onclick: () => ((open = x.id), render()) },
                  h("strong", { text: x.name }),
                  h("span", { text: x.subject || "(sans objet)" }),
                  h("time", { text: formatDate(x.created_at) }),
                ),
              ),
            )
          : h("li", { class: "a-empty", text: "Aucun message pour l'instant." }),
      ),
      m
        ? h(
            "article",
            { class: "a-card a-message" },
            h("header", null, h("h2", { text: m.subject || "(sans objet)" }), h("p", { class: "a-hint" }, `${m.name} · `, h("a", { href: `mailto:${m.email}`, text: m.email }), ` · ${formatDate(m.created_at)}`)),
            h("p", { class: "a-message-body", text: m.body }),
            h(
              "div",
              { class: "a-row-tools" },
              h("a", { class: "a-btn a-btn-primary", href: `mailto:${encodeURIComponent(m.email)}?subject=${encodeURIComponent(`Re : ${m.subject || "votre message"}`)}` }, h("span", { text: "Répondre" })),
              button(m.handled ? "Marquer comme à traiter" : "Marquer comme traité", async () => {
                await api(`messages/${m.id}`, { method: "PATCH", body: { handled: !m.handled } });
                m.handled = m.handled ? 0 : 1;
                await sync();
                render();
              }, { icon: "check" }),
              button("Supprimer", async () => {
                if (!(await confirmDialog("Supprimer ce message ?", "Il sera effacé définitivement.", "Supprimer"))) return;
                await api(`messages/${m.id}`, { method: "DELETE" });
                list = list.filter((x) => x.id !== m.id);
                open = list[0]?.id;
                await sync();
                render();
                toast("Message supprimé");
              }, { icon: "trash", kind: "ghost" }),
            ),
          )
        : null,
    );
  };
  render();
  return { title: "Messages", body: h("div", { class: "a-stack" }, h("p", { class: "a-hint", text: "Formulaire « Envoyer un signal ». Les messages sont effacés automatiquement un an après réception." }), box) };
}
