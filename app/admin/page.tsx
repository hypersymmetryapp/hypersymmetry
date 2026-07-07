import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("username")
    .eq("id", user.id)
    .maybeSingle();

  const adminUsernames = (process.env.ADMIN_USERNAMES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!profile?.username || !adminUsernames.includes(profile.username)) redirect("/app");

  const admin = createAdminClient();
  const { data: usersResult, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;

  const userIds = usersResult.users.map((u) => u.id);
  const [{ data: profiles }, { data: boards }] = await Promise.all([
    admin.from("profiles").select("id, username").in("id", userIds),
    admin.from("boards").select("owner_id"),
  ]);

  const usernameById = new Map((profiles ?? []).map((p) => [p.id, p.username as string]));
  const boardCountByOwner = new Map<string, number>();
  (boards ?? []).forEach((b) => {
    boardCountByOwner.set(b.owner_id, (boardCountByOwner.get(b.owner_id) ?? 0) + 1);
  });

  const rows = usersResult.users
    .map((u) => ({
      id: u.id,
      email: u.email ?? "",
      username: usernameById.get(u.id) ?? "",
      createdAt: u.created_at,
      lastSignIn: u.last_sign_in_at ?? null,
      boardsOwned: boardCountByOwner.get(u.id) ?? 0,
    }))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

  return (
    <div className="flex-1 font-sans text-stone-200" style={{ background: "#000" }}>
      <div className="max-w-4xl mx-auto px-4 py-8">
        <div className="flex items-baseline gap-2 mb-1">
          <h1 className="font-mono font-bold text-lg text-white">hypersymmetry</h1>
          <span className="text-[9px] font-mono uppercase tracking-widest text-stone-500 border border-stone-700 rounded-full px-2 py-0.5">
            admin
          </span>
        </div>
        <p className="text-sm text-stone-500 mb-6">{rows.length} total users</p>
        <div className="rounded-xl border border-stone-800 overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-stone-500 border-b border-stone-800">
                <th className="px-4 py-2 font-medium">Username</th>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Signed up</th>
                <th className="px-4 py-2 font-medium">Last sign-in</th>
                <th className="px-4 py-2 font-medium text-right">Boards owned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-stone-900 last:border-b-0">
                  <td className="px-4 py-2">
                    {r.username ? `@${r.username}` : <span className="text-stone-600">—</span>}
                  </td>
                  <td className="px-4 py-2 text-stone-400">{r.email}</td>
                  <td className="px-4 py-2 text-stone-400">{new Date(r.createdAt).toLocaleDateString()}</td>
                  <td className="px-4 py-2 text-stone-400">
                    {r.lastSignIn ? new Date(r.lastSignIn).toLocaleDateString() : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">{r.boardsOwned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
