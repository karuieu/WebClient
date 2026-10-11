import fs from "node:fs";
import path from "node:path";
import { ButtonLink } from "@/components/kit/Button";
import { LegalView, type LegalLang } from "@/components/policies/LegalView";

const DOCS = {
  privacy: {
    file: "privacy-policy.md",
    href: { pl: "/privacy", en: "/privacy/en" },
    title: { pl: "Polityka prywatności", en: "Privacy Policy" },
  },
  terms: {
    file: "terms-of-service.md",
    href: { pl: "/terms", en: "/terms/en" },
    title: { pl: "Regulamin", en: "Terms of Service" },
  },
} as const;

export type DocId = keyof typeof DOCS;

const PLACEHOLDER = {
  pl: {
    body: "Ten dokument jest jeszcze dopracowywany i nie został opublikowany. Do tego czasu to, co naprawdę dzieje się z Twoimi danymi, opisuje model bezpieczeństwa.",
    primary: "Zobacz model bezpieczeństwa",
    secondary: "Strona główna",
  },
  en: {
    body: "This document is still being finalised and isn't published yet. Until then, the security model describes what actually happens to your data.",
    primary: "Read the security model",
    secondary: "Home",
  },
} as const;

function readLegalDoc(lang: LegalLang, file: string): string | null {
  try {
    return fs.readFileSync(path.join(process.cwd(), "legal", lang, file), "utf8");
  } catch {
    return null;
  }
}

export function LegalDocument({ doc, lang }: { doc: DocId; lang: LegalLang }) {
  const spec = DOCS[doc];
  const other: LegalLang = lang === "pl" ? "en" : "pl";
  const markdown = readLegalDoc(lang, spec.file);
  const otherHref = readLegalDoc(other, spec.file) !== null ? spec.href[other] : null;

  if (markdown === null) {
    const t = PLACEHOLDER[lang];
    return (
      <LegalView
        markdown={`# ${spec.title[lang]}\n\n${t.body}`}
        lang={lang}
        actions={
          <>
            <ButtonLink href="/security">{t.primary}</ButtonLink>
            <ButtonLink href="/" variant="secondary">
              {t.secondary}
            </ButtonLink>
          </>
        }
      />
    );
  }

  return <LegalView markdown={markdown} lang={lang} otherHref={otherHref} />;
}
