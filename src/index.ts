export interface Env {
  DB: D1Database;
  PHOTOS: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') {
      const { results } = await env.DB.prepare('SELECT COUNT(*) as count FROM trees').all();
      return Response.json({ status: 'ok', trees: results[0]?.count ?? 0 });
    }

    return new Response('GroveIQ API — Phase 0 skeleton', {
      headers: { 'content-type': 'text/plain' },
    });
  },
};
