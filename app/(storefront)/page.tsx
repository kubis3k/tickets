import { brand } from "@/lib/config/brand";
import { cs } from "@/lib/i18n/cs";

export default function StorefrontHome() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-3xl font-semibold">{brand.name}</h1>
      <p className="text-muted-foreground mt-2">{cs.storefront.tagline}</p>
    </main>
  );
}
