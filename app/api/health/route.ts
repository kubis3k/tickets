// public: health check
export async function GET(): Promise<Response> {
  return Response.json({ ok: true });
}
