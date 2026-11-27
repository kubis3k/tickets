import type { ReactNode } from "react";
import { requireAnyMembership } from "@/lib/auth/guards";

// Hrubá hranice: přihlášený + aspoň jedno členství (nebo platform admin).
// Detailní kontrola akce (requireDoor(eventId)) přijde na stránce akce ve F4.
export default async function ScannerLayout({ children }: { children: ReactNode }) {
  await requireAnyMembership();
  return <>{children}</>;
}
