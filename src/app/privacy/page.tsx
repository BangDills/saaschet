import type { Metadata } from "next";
import { LegalDoc } from "../legal-doc";

export const metadata: Metadata = {
  title: "Privacy Policy — Celiuz AI",
  description:
    "How Celiuz AI collects, uses, and protects your data — conversations, connected GitHub repositories, memory, and credits.",
};

export default function PrivacyPage() {
  return <LegalDoc file="PRIVACY.md" title="Privacy Policy" />;
}
