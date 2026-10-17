import type { Lang, L } from "../content/i18n";
import { PROJECTS, FEATURED, OTHERS, type Project } from "../content/projects";
import { SKILLS } from "../content/skills";
import { ABOUT, CONTACT, SITE } from "../content/site";
import { UI } from "../content/ui";

/**
 * Le balisage du contenu, en une fonction pure (chaînes de caractères) :
 *  - à la construction, il est injecté dans `index.html` (moteurs de
 *    recherche, technologies d'assistance, agents, navigateurs sans WebGL) ;
 *  - dans l'expérience, le même balisage est réutilisé (bascule de langue).
 * Tout le texte passe par `esc` : rien n'est interprété comme du HTML.
 */

export function esc(s: string) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const tr = (lang: Lang) => (v: L | string) => esc(typeof v === "string" ? v : v[lang]);

const ICON = {
  sun: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><g stroke-linecap="round"><path d="M12 2.5v2.6M12 18.9v2.6M2.5 12h2.6M18.9 12h2.6M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/></g></svg>',
  moon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.6A8.2 8.2 0 0 1 9.4 4a8.2 8.2 0 1 0 10.6 10.6z"/></svg>',
  sound: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path class="wave" d="M15.5 9a4.2 4.2 0 0 1 0 6M18 6.6a7.6 7.6 0 0 1 0 10.8" fill="none" stroke-linecap="round"/></svg>',
  arrow: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M9 7h8v8" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  close: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" fill="none" stroke-linecap="round"/></svg>',
  prev: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 6 8.5 12l6 6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  next: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  copy: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="1.5" fill="none"/><path d="M15.5 8.5V5.5a1 1 0 0 0-1-1h-9a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3" fill="none"/></svg>',
};

export function topBar(lang: Lang) {
  const T = tr(lang);
  return `
  <a class="brand" href="#tokyo" data-stop="ground" data-glass="control">${esc(SITE.name)}</a>
  <div class="tools" data-glass="control">
    <p class="clock" aria-label="${T(UI.tokyoTime)}"><span class="clock-city">Tokyo</span> <time class="clock-time">--:--</time></p>
    <button class="tool daynight" type="button" aria-pressed="false" aria-label="${T(UI.toNight)}">
      <span class="ic ic-sun">${ICON.sun}</span><span class="ic ic-moon">${ICON.moon}</span><span class="tool-label">${T(UI.day)}</span>
    </button>
    <button class="tool sound" type="button" aria-pressed="false" aria-label="${T(UI.soundOn)}">${ICON.sound}<span class="tool-label">${T(UI.sound)}</span></button>
    <button class="tool lang" type="button" lang="${lang === "fr" ? "en" : "fr"}" aria-label="${T(UI.langLabel)}">${T(UI.langSwitch)}</button>
    <a class="tool text-version" href="?lecture">${T(UI.textVersion)}</a>
  </div>`;
}

export function altimeter(lang: Lang) {
  const T = tr(lang);
  const stops: { id: keyof typeof UI.stops; alt: string }[] = [
    { id: "contact", alt: "333" },
    { id: "about", alt: "250" },
    { id: "projects", alt: "150" },
    { id: "ground", alt: "0" },
  ];
  return `
  <p class="alt-readout" aria-hidden="true"><span class="alt-value">000</span><span class="alt-unit">m</span></p>
  <ol class="alt-stops">
    ${stops
      .map(
        (s) => `<li><button type="button" class="alt-stop" data-stop="${s.id}">
          <span class="alt-num">${s.alt}</span>
          <span class="alt-name">${T(UI.stops[s.id])}</span>
          <span class="alt-jp" lang="ja">${esc(UI.stopsJp[s.id])}</span>
        </button></li>`,
      )
      .join("")}
  </ol>
  <div class="alt-track" aria-hidden="true"><div class="alt-fill"></div></div>`;
}

function projectBlock(p: Project, lang: Lang, i: number) {
  const T = tr(lang);
  return `<article class="project" data-project="${i}" id="projet-${esc(p.slug)}">
    <h3 class="project-title">${esc(p.title)}</h3>
    <p class="project-meta">${esc(p.year)} — ${T(p.discipline)}</p>
    <p class="project-line">${T(p.line)}</p>
    <div class="project-actions">
      <button type="button" class="btn btn-accent open-project" data-slug="${esc(p.slug)}">${T(UI.viewProject)}</button>
      ${p.live ? `<a class="btn btn-quiet" href="${esc(p.live)}" target="_blank" rel="noopener noreferrer">${T(UI.visitSite)}${ICON.arrow}<span class="sr">${T(UI.newTab)}</span></a>` : ""}
    </div>
  </article>`;
}

export function main(lang: Lang) {
  const T = tr(lang);
  return `
  <section id="tokyo" class="chapter chapter-tokyo" data-chapter="tokyo" aria-labelledby="t-name">
    <div class="card card-intro" data-glass="panel">
      <h1 id="t-name">${esc(SITE.name)}</h1>
      <p class="role">${T(SITE.role)}</p>
      <p class="lead">${T(SITE.lead)}</p>
      <p class="scroll-cue" aria-hidden="true"><span class="cue-bar"></span>${T(UI.scroll)}</p>
    </div>
  </section>

  <section id="competences" class="chapter chapter-skills" data-chapter="skills" aria-labelledby="t-skills">
    <div class="card card-skills" data-glass="panel">
      <h2 id="t-skills">${T(UI.skillsTitle)}</h2>
      <p class="hint">${T(UI.skillsHint)}</p>
      <ul class="skill-buttons">
        ${SKILLS.map(
          (s, i) => `<li><button type="button" class="skill-button" data-skill="${i}" style="--c:${s.body};--a:${s.accent}">
            <span class="skill-jp" lang="ja">${esc(s.jp)}</span><span class="skill-name">${T(s.name)}</span><span class="skill-price">${esc(s.price)}</span>
          </button></li>`,
        ).join("")}
      </ul>
    </div>
    <div class="ticket" data-glass="panel" role="region" aria-live="polite" aria-label="${T(UI.skillsTitle)}" hidden>
      ${SKILLS.map(
        (s, i) => `<article class="skill" data-skill="${i}" hidden style="--c:${s.body};--a:${s.accent}">
          <p class="skill-head"><span class="skill-jp" lang="ja">${esc(s.jp)}</span><span>${T(s.name)}</span></p>
          <h3 class="skill-promise">${T(s.promise)}</h3>
          <p class="skill-text">${T(s.text)}</p>
          <p class="skill-tools"><span class="label">${T(UI.skillsTools)}</span> ${s.tools.map(esc).join(" · ")}</p>
          <p class="skill-proof"><span class="label">${T(UI.skillsProof)}</span> ${s.proof
            .map((slug) => {
              const p = PROJECTS.find((x) => x.slug === slug);
              return p ? `<a href="#projet-${esc(p.slug)}" data-goto-project="${esc(p.slug)}">${esc(p.title)}</a>` : "";
            })
            .join(", ")}</p>
        </article>`,
      ).join("")}
      <button type="button" class="ticket-close" aria-label="${T(UI.close)}">${ICON.close}</button>
    </div>
  </section>

  <section id="projets" class="chapter chapter-projects" data-chapter="projects" aria-labelledby="t-projects">
    <div class="card card-projects" data-glass="panel">
      <h2 id="t-projects"><span class="sr">${T(UI.projectsTitle)} — </span><span class="deck-label">${T(UI.projectsDeck)}</span></h2>
      <div class="project-stack">
        ${FEATURED.map((p, i) => projectBlock(p, lang, i)).join("")}
      </div>
      <div class="project-nav">
        <button type="button" class="face-step" data-step="-1" aria-label="${T(UI.prev)}">${ICON.prev}</button>
        <ol class="project-pager">
          ${FEATURED.map((p, i) => `<li><button type="button" class="pager-item" data-face="${i}"><span class="pager-label">${esc(p.title)}</span></button></li>`).join("")}
        </ol>
        <button type="button" class="face-step" data-step="1" aria-label="${T(UI.next)}">${ICON.next}</button>
        <button type="button" class="also-toggle" aria-expanded="false" aria-controls="aussi" aria-label="${T(UI.alsoOnFloor)} (${OTHERS.length})"><span class="also-label">${T(UI.alsoOnFloor)}</span> <span class="also-count" aria-hidden="true">+${OTHERS.length}</span></button>
      </div>
    </div>
    <div class="also" id="aussi" data-glass="panel">
      <h3>${T(UI.alsoOnFloor)}</h3>
      <ul>
        ${OTHERS.map((p) => `<li><button type="button" class="open-project" data-slug="${esc(p.slug)}"><span>${esc(p.title)}</span> <span class="also-year">${esc(p.year)}</span></button></li>`).join("")}
      </ul>
    </div>
  </section>

  <section id="a-propos" class="chapter chapter-about" data-chapter="about" aria-labelledby="t-about">
    <div class="glass-text" data-glass="panel">
      <h2 id="t-about">${T(UI.aboutTitle)}</h2>
      ${ABOUT.paragraphs.map((p, i) => `<p class="${i === 0 ? "about-lead" : ""}">${T(p)}</p>`).join("")}
      <p class="about-seeking">${T(ABOUT.seeking)}</p>
      <dl class="about-facts">
        ${ABOUT.facts.map((f) => `<div><dt>${T(f.label)}</dt><dd>${T(f.value)}</dd></div>`).join("")}
      </dl>
    </div>
  </section>

  <section id="contact" class="chapter chapter-contact" data-chapter="contact" aria-labelledby="t-contact">
    <div class="card card-contact" data-glass="panel">
      <h2 id="t-contact">${T(UI.contactTitle)}</h2>
      <p class="lead">${T(UI.contactLead)}</p>
      <p class="mail-row">
        <a class="mail" href="mailto:${esc(CONTACT.email)}">${esc(CONTACT.email)}</a>
        <button type="button" class="copy" data-copy="${esc(CONTACT.email)}" aria-label="${T(UI.copy)}">${ICON.copy}<span class="copy-label">${T(UI.copy)}</span></button>
      </p>
      <ul class="links">
        ${CONTACT.links.map((l) => `<li><a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer me">${esc(l.label)}${ICON.arrow}<span class="sr">${T(UI.newTab)}</span></a></li>`).join("")}
      </ul>
      <dl class="contact-details">
        ${CONTACT.details.map((d) => `<div><dt>${T(d.label)}</dt><dd>${T(d.value)}</dd></div>`).join("")}
      </dl>
      <details class="signal">
        <summary class="btn btn-accent">${T(UI.signal)}</summary>
        <form class="signal-form" novalidate>
          <label><span>${T(UI.formName)}</span><input name="name" autocomplete="name" maxlength="120" required /></label>
          <label><span>${T(UI.formEmail)}</span><input name="email" type="email" autocomplete="email" maxlength="200" required /></label>
          <label><span>${T(UI.formSubject)}</span><select name="subject">${CONTACT.subjects.map((s) => `<option>${T(s)}</option>`).join("")}</select></label>
          <label class="wide"><span>${T(UI.formMessage)}</span><textarea name="message" rows="4" maxlength="4000" required></textarea></label>
          <p class="form-error" role="alert" hidden></p>
          <label class="trap" aria-hidden="true"><span>${T(UI.formTrap)}</span><input name="site" tabindex="-1" autocomplete="off" /></label>
          <button type="submit" class="btn btn-accent">${T(UI.formSend)}</button>
          <p class="form-note">${T(UI.formNote)}</p>
          <p class="form-sent" role="status" hidden>${T(UI.formSent)}</p>
        </form>
      </details>
      <p class="contact-foot">
        <button type="button" class="back-down" data-stop="ground">${T(UI.backDown)}</button>
        <a href="/mentions-legales.html">${T(UI.legal)}</a>
        <a href="/confidentialite.html">${T(UI.privacy)}</a>
      </p>
    </div>
  </section>`;
}

export function viewer(p: Project, lang: Lang, index: number, total: number) {
  const T = tr(lang);
  const img = p.image;
  return `
    <div class="viewer-media ${img?.phone ? "is-phone" : ""}">
      ${img ? `<img src="${esc(img.src)}" width="${img.w}" height="${img.h}" alt="${T(img.alt)}" decoding="async" />` : ""}
      ${(p.gallery ?? []).map((g) => `<img src="${esc(g.src)}" width="${g.w}" height="${g.h}" alt="${T(g.alt)}" loading="lazy" decoding="async" />`).join("")}
    </div>
    <div class="viewer-body">
      <p class="viewer-count" aria-hidden="true">${index + 1} / ${total}</p>
      <h2 id="viewer-title">${esc(p.title)}</h2>
      <p class="viewer-meta">${esc(p.year)} — ${T(p.discipline)}</p>
      <p class="viewer-line">${T(p.line)}</p>
      <p class="viewer-summary">${T(p.summary)}</p>
      <dl class="viewer-facts">
        ${p.org ? `<div><dt>${T(UI.client)}</dt><dd>${esc(p.org)}</dd></div>` : ""}
        ${p.facts.map((f) => `<div><dt>${T(f.label)}</dt><dd>${T(f.value)}</dd></div>`).join("")}
      </dl>
      <p class="viewer-stack"><span class="label">${T(UI.stack)}</span> ${p.stack.map(esc).join(" · ")}</p>
      <div class="viewer-actions">
        ${p.live ? `<a class="btn btn-accent" href="${esc(p.live)}" target="_blank" rel="noopener noreferrer">${T(UI.visitSite)}${ICON.arrow}<span class="sr">${T(UI.newTab)}</span></a>` : ""}
        <button type="button" class="btn btn-quiet viewer-prev">${T(UI.prev)}</button>
        <button type="button" class="btn btn-quiet viewer-next">${T(UI.next)}</button>
      </div>
    </div>
    <button type="button" class="viewer-close" aria-label="${T(UI.backToTower)}">${ICON.close}</button>`;
}

export function loader(lang: Lang) {
  const T = tr(lang);
  return `<div class="loader-inner">
    <svg class="loader-tower" viewBox="0 0 200 400" aria-hidden="true"></svg>
    <p class="loader-alt"><span class="loader-value">000</span> m</p>
    <p class="loader-label">${T(UI.loading)}</p>
  </div>`;
}

/** Document complet (injecté à la construction). */
export function body(lang: Lang) {
  const T = tr(lang);
  return `
  <a class="skip" href="#contenu">${T(UI.skip)}</a>
  <div id="loader" class="loader" role="status" aria-live="polite">${loader(lang)}</div>
  <header class="topbar">${topBar(lang)}</header>
  <nav class="altimeter" data-glass="panel" aria-label="${T(UI.floors)}">${altimeter(lang)}</nav>
  <main id="contenu">${main(lang)}</main>
  <dialog class="viewer" data-glass="panel" aria-labelledby="viewer-title"></dialog>
  <noscript><p class="noscript">${T(UI.noWebgl)}</p></noscript>`;
}

export { PROJECTS };
