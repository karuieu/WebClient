import type { Metadata } from "next";
import { LegalView } from "@/components/policies/LegalView";
import { securityModel } from "@/components/policies/securityModel";

export const metadata: Metadata = {
  title: "Karui · Security model",
  description:
    "How Karui seals your conversations: AES-256-GCM in your browser, a wrapped data key the server can't open, and a clearly drawn boundary at inference.",
};

export default function SecurityPage() {
  return <LegalView markdown={securityModel} lang="en" label="Security" />;
}
