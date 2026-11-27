"use server";

import { redirect } from "next/navigation";
import { requireAuthenticated } from "./guards";
import { createSupabaseServerClient } from "./supabase-server";

export async function signOut(): Promise<void> {
  await requireAuthenticated();
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  redirect("/login");
}
