import { getPreauditService } from '@/domain/preaudit/bootstrap';
import { errorResponse } from '@/domain/preaudit/http';
import { createTrackingExportFileName, exportTrackingWorkbook } from '@/domain/preaudit/tracking-workbook';
import type { PreauditProject, ProjectStatus } from '@/domain/preaudit/types';

export const runtime = 'nodejs';

const exportableStatuses = new Set<ProjectStatus>([
  'pending_external_decision',
  'conditional_admission',
  'tracking',
  'tracking_completed',
  'rejected',
]);

function projectName(project: PreauditProject): string {
  const value = project.answers.contractName?.value;
  return typeof value === 'string' ? value : '';
}

function filterTrackingExportProjects(
  projects: PreauditProject[],
  status: string,
  query: string,
): PreauditProject[] {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  return projects.filter((project) => {
    if (!exportableStatuses.has(project.status)) return false;
    if (status && project.status !== status) return false;
    if (!normalizedQuery) return true;
    return [
      projectName(project),
      project.salesName,
      String(project.answers.salesBu?.value ?? ''),
      String(project.answers.salesRegion?.value ?? ''),
      String(project.answers.opportunitySerialNumber?.value ?? ''),
    ].some((value) => value.toLocaleLowerCase('zh-CN').includes(normalizedQuery));
  });
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const projects = await (await getPreauditService()).listProjects();
    const filtered = filterTrackingExportProjects(
      projects,
      url.searchParams.get('status') ?? '',
      url.searchParams.get('query') ?? '',
    );
    const workbook = await exportTrackingWorkbook(filtered);
    return new Response(workbook, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(createTrackingExportFileName())}`,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
