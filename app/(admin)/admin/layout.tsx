import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { signOut } from "@/lib/auth/actions";
import { requireAuthenticated } from "@/lib/auth/guards";
import { brand } from "@/lib/config/brand";
import { cs } from "@/lib/i18n/cs";

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const user = await requireAuthenticated();
  return (
    <div className="min-h-screen">
      <header className="flex items-center justify-between border-b px-6 py-3">
        <span className="font-semibold">{brand.name}</span>
        <form action={signOut} className="flex items-center gap-3">
          <span className="text-muted-foreground text-sm">{user.email}</span>
          <Button type="submit" variant="outline" size="sm">
            {cs.auth.signOut}
          </Button>
        </form>
      </header>
      {children}
    </div>
  );
}
