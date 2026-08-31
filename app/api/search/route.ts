import { searchPublicContent } from "@/lib/search";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q") ?? undefined;
  const response = await searchPublicContent(query);
  const total = response.results.length;

  return Response.json(
    {
      ...response,
      total,
      results: response.results.slice(0, 5),
    },
    {
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
