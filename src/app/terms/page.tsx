import type { Metadata } from "next";
import { LegalDoc } from "../legal-doc";

export const metadata: Metadata = {
  title: "Terms of Service — Celiuz AI",
  description:
    "The terms that govern your use of Celiuz AI — accounts, agent write access, credits and billing, and AI-generated content.",
};

export default function TermsPage() {
  return <LegalDoc file="TERMS.md" title="Terms of Service" />;
}
