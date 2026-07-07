import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listMyBoards, listBoardMembers } from "@/app/actions";
import Hypersymmetry from "@/components/Hypersymmetry";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [boards, profile] = await Promise.all([
    listMyBoards(),
    supabase.from("profiles").select("username").eq("id", user.id).maybeSingle().then((r) => r.data),
  ]);

  const requestedBoard = (await searchParams).board;
  const requestedId = Array.isArray(requestedBoard) ? requestedBoard[0] : requestedBoard;
  const activeBoard =
    boards.find((b) => b.id === requestedId) ??
    boards.find((b) => b.isOwn) ??
    boards[0];

  if (!activeBoard) redirect("/login");

  const [{ data: itemRows }, members] = await Promise.all([
    supabase
      .from("items")
      .select("id, type, parent_id, fields")
      .eq("board_id", activeBoard.id),
    listBoardMembers(activeBoard.id),
  ]);

  const initialItems = (itemRows ?? []).map((row) => ({
    id: row.id,
    type: row.type,
    parentId: row.parent_id,
    ...(row.fields as Record<string, unknown>),
  }));

  return (
    <Hypersymmetry
      key={activeBoard.id}
      initialItems={initialItems}
      email={user.email ?? ""}
      username={profile?.username ?? ""}
      boardId={activeBoard.id}
      boards={boards}
      members={members}
    />
  );
}
