import { searchArtists } from "@/lib/qloo/workflows";
import { QlooLimitError } from "@/lib/qloo/types";

export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return Response.json({ artists: [] });

  try {
    return Response.json({ artists: await searchArtists(q.slice(0, 80)) });
  } catch (error) {
    if (error instanceof QlooLimitError) return Response.json({ error: error.message }, { status: 429 });
    console.error("[artists]", error);
    return Response.json({ error: "Artist search failed. Try again." }, { status: 502 });
  }
}
