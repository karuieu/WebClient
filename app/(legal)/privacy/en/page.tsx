import type { Metadata } from "next";
import { LegalDocument } from "@/app/(legal)/LegalDocument";

export const metadata: Metadata = {
  title: "Karui · Privacy Policy",
  description:
    "How Karui processes personal data, and how end-to-end encryption limits what we can ever see. English translation of the Polish original.",
  alternates: {
    canonical: "/privacy/en",
    languages: { pl: "/privacy", en: "/privacy/en" },
  },
};

export default function PrivacyPageEn() {
  return <LegalDocument doc="privacy" lang="en" />;
}
