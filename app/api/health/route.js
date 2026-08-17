export function GET() {
  return Response.json({
    ok: true,
    app: 'ZooLark View',
    runtime: 'Next.js',
    time: new Date().toISOString(),
  });
}
