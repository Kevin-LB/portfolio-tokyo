import type { Lang } from "../content/i18n";
import { SITE, CONTACT } from "../content/site";
import { esc } from "./markup";

/** Métadonnées : description, partage, données structurées (Person). */
export function head(lang: Lang) {
  const url = SITE.url.replace(/\/$/, "");
  const desc = SITE.description[lang];
  const ld = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: SITE.name,
    jobTitle: lang === "fr" ? "Designer et développeur web" : "Web designer and developer",
    address: { "@type": "PostalAddress", addressLocality: "Orléans", addressCountry: "FR" },
    email: `mailto:${CONTACT.email}`,
    url,
    sameAs: CONTACT.links.map((l) => l.url),
  };
  return `<meta name="description" content="${esc(desc)}" />
    <meta name="theme-color" content="#f4efe6" />
    <meta name="color-scheme" content="light" />
    <link rel="canonical" href="${esc(url)}/" />
    <link rel="icon" href="/icon.svg" type="image/svg+xml" />
    <meta property="og:type" content="website" />
    <meta property="og:title" content="${esc(SITE.name)} — ${esc(SITE.role[lang].replace(/\.$/, ""))}" />
    <meta property="og:description" content="${esc(desc)}" />
    <meta property="og:url" content="${esc(url)}/" />
    <meta property="og:image" content="${esc(url)}/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta property="og:locale" content="${lang === "fr" ? "fr_FR" : "en_GB"}" />
    <meta name="twitter:card" content="summary_large_image" />
    <script type="application/ld+json">${JSON.stringify(ld).replace(/</g, "\\u003c")}</script>`;
}
