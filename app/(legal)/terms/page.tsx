import type { Metadata } from "next";
import { LegalDocument } from "@/app/(legal)/LegalDocument";

export const metadata: Metadata = {
  title: "Karui · Regulamin",
  description:
    "Warunki, na jakich Karui udostępnia szyfrowaną end-to-end przestrzeń do pracy z AI.",
  alternates: {
    canonical: "/terms",
    languages: { pl: "/terms", en: "/terms/en" },
  },
};

export default function TermsPage() {
  return <LegalDocument doc="terms" lang="pl" />;
}
