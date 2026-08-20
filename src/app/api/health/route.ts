import packageInfo from '../../../../package.json';

export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({ ok: true, service: '亚信前置审批', version: packageInfo.version });
}
