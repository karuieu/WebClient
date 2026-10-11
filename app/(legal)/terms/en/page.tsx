import type { Metadata } from "next";
import { LegalDocument } from "@/app/(legal)/LegalDocument";

export const metadata: Metadata = {
  title: "Karui · Terms of Service",
  description:
    "The terms on which Karui provides its end-to-end encrypted AI workspace. English translation of the Polish original.",
  alternates: {
    canonical: "/terms/en",
    languages: { pl: "/terms", en: "/terms/en" },
  },
};

export default function TermsPageEn() {
  return <LegalDocument doc="terms" lang="en" />;
}
