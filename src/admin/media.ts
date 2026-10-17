import { api } from "./api";
import { append, button, h, icon, toast, fill } from "./dom";
import { loadMedia, state, type MediaRow } from "./state";

/**
 * Images : réduites (2400 px au plus) et converties en WebP dans le
 * navigateur avant l'envoi — le serveur n'a besoin d'aucune bibliothèque
 * d'image. Les formats acceptés au départ : tout ce que le navigateur sait
 * décoder (JPEG, PNG, WebP, AVIF, HEIC sur Safari…).
 */

const MAX_SIDE = 2400;

async function encode(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const w = Math.round(bitmap.width * scale);
  const hgt = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = hgt;
  canvas.getContext("2d")!.drawImage(bitmap, 0, 0, w, hgt);
  bitmap.close();
  const blob = (type: string, q: number) => new Promise<Blob | null>((r) => canvas.toBlob(r, type, q));
  // WebP si le navigateur sait l'encoder, sinon JPEG.
  const webp = await blob("image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await blob("image/jpeg", 0.88);
  if (!jpeg) throw new Error("Conversion impossible.");
  return jpeg;
}

export async function uploadFiles(files: FileList | File[]) {
  const added: MediaRow[] = [];
  for (const file of Array.from(files)) {
    if (!file.type.startsWith("image/")) {
      toast(`${file.name} : ce n'est pas une image.`, "error");
      continue;
    }
    try {
      const blob = await encode(file);
      const row = await api<MediaRow>("media", { method: "POST", raw: blob, headers: { "content-type": blob.type, "x-file-name": encodeURIComponent(file.name.replace(/\.[^.]+$/, "")) } });
      added.push(row);
    } catch (e) {
      toast(`${file.name} : ${e instanceof Error ? e.message : "échec de l'envoi"}`, "error");
    }
  }
  if (added.length) {
    await loadMedia();
    toast(added.length > 1 ? `${added.length} images ajoutées` : "Image ajoutée");
  }
  return added;
}

/** Zone de dépôt + bouton « Choisir des fichiers ». */
export function dropzone(onDone: (rows: MediaRow[]) => void, multiple = true) {
  const input = h("input", { type: "file", accept: "image/*", multiple, class: "a-file" });
  const zone = h(
    "label",
    { class: "a-drop" },
    icon("upload"),
    h("span", { text: multiple ? "Déposer des images ici, ou cliquer pour choisir" : "Déposer une image ici, ou cliquer pour choisir" }),
    h("span", { class: "a-hint", text: "Réduites à 2400 px et converties en WebP avant l'envoi." }),
    input,
  );
  const go = async (files: FileList | null) => {
    if (!files?.length) return;
    zone.classList.add("is-busy");
    onDone(await uploadFiles(files));
    zone.classList.remove("is-busy");
    input.value = "";
  };
  input.addEventListener("change", () => go(input.files));
  zone.addEventListener("dragover", (e) => {
    e.preventDefault();
    zone.classList.add("is-over");
  });
  zone.addEventListener("dragleave", () => zone.classList.remove("is-over"));
  zone.addEventListener("drop", (e) => {
    e.preventDefault();
    zone.classList.remove("is-over");
    go(e.dataTransfer?.files ?? null);
  });
  return zone;
}

/** Fenêtre de choix d'une image (médiathèque + envoi). */
export function pickImage(): Promise<MediaRow | null> {
  return new Promise((resolve) => {
    const dlg = h("dialog", { class: "a-dialog a-dialog-wide" });
    const done = (v: MediaRow | null) => {
      dlg.close();
      dlg.remove();
      resolve(v);
    };
    const grid = h("div", { class: "a-media-grid is-pick" });
    const render = () =>
      fill(grid, 
        ...(state.media.length
          ? state.media.map((m) =>
              h(
                "button",
                { type: "button", class: "a-media-pick", onclick: () => done(m), "aria-label": `Choisir ${m.name || m.file}` },
                h("img", { src: `/media/${m.file}`, alt: "", loading: "lazy", width: m.width, height: m.height }),
                h("span", { text: m.name || m.file }),
              ),
            )
          : [h("p", { class: "a-empty", text: "La médiathèque est vide : envoyez une première image." })]),
      );
    append(dlg, [
      h("div", { class: "a-dialog-head" }, h("h2", { text: "Choisir une image" }), button("Fermer", () => done(null), { icon: "close", iconOnly: true })),
      dropzone((rows) => (rows.length === 1 ? done(rows[0]) : render())),
      grid,
    ]);
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      done(null);
    });
    document.body.append(dlg);
    dlg.showModal();
    render();
    if (!state.media.length) loadMedia().then(render).catch(() => undefined);
  });
}
