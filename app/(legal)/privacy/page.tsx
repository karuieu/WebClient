import type { Metadata } from "next";
import { LegalDocument } from "@/app/(legal)/LegalDocument";

export const metadata: Metadata = {
  title: "Karui · Polityka prywatności",
  description:
    "Jak Karui przetwarza dane osobowe i jak szyfrowanie end-to-end ogranicza to, co w ogóle możemy zobaczyć.",
  alternates: {
    canonical: "/privacy",
    languages: { pl: "/privacy", en: "/privacy/en" },
  },
};

export default function PrivacyPage() {
  return <LegalDocument doc="privacy" lang="pl" />;
}
