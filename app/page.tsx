import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Hypersymmetry from "@/components/Hypersymmetry";

export default async function Home() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: board }, { data: profile }] = await Promise.all([
    supabase.from("boards").select("data").eq("user_id", user.id).maybeSingle(),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle(),
  ]);

  return (
    <Hypersymmetry
      initialItems={(board?.data as unknown[]) ?? []}
      email={user.email ?? ""}
      username={profile?.username ?? ""}
    />
  );
}
