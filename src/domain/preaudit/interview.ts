import { evaluateRisks } from './risk-engine';
import { getTemplateDefinition } from './template';
import { findAnswerConsistencyIssues } from './answer-consistency';
import type { PreauditProject, TemplateFieldDefinition } from './types';

export interface InterviewQuestion {
  fieldKey: string;
  question: string;
  guidance?: string;
  reason: 'required' | 'risk_evidence' | 'optional';
}

const SECTION_PRIORITY = ['basic', 'risk', 'project', 'procurement', 'significance', 'control', 'commitment'];

function answerValues(project: PreauditProject): Record<string, unknown> {
  return Object.fromEntries(Object.entries(project.answers).map(([key, answer]) => [key, answer.value]));
}

function hasAnswer(project: PreauditProject, key: string): boolean {
  const value = project.answers[key]?.value;
  return value !== undefined && value !== null && (typeof value !== 'string' || value.trim().length > 0);
}

function isApplicable(field: TemplateFieldDefinition, project: PreauditProject): boolean {
  if (!field.requiredWhen) return true;
  return project.answers[field.requiredWhen.field]?.value === field.requiredWhen.equals;
}

export function isFieldRequired(field: TemplateFieldDefinition, project: PreauditProject): boolean {
  if (field.requiredWhen) return isApplicable(field, project);
  return field.required;
}

export function getMissingRequiredFields(project: PreauditProject): TemplateFieldDefinition[] {
  const template = getTemplateDefinition({ token: project.token, version: project.templateVersion });
  return template.fields.filter(
    (field) => isFieldRequired(field, project) && !hasAnswer(project, field.key),
  );
}

function questionFor(field: TemplateFieldDefinition, reason: InterviewQuestion['reason']): InterviewQuestion {
  return { fieldKey: field.key, question: field.question, guidance: field.guidance, reason };
}

export function getNextQuestion(project: PreauditProject): InterviewQuestion | undefined {
  const missingRequired = getMissingRequiredFields(project);
  const structured = missingRequired.find((field) => field.section === 'basic' || field.section === 'risk');
  if (structured) return questionFor(structured, 'required');

  const template = getTemplateDefinition({ token: project.token, version: project.templateVersion });
  const riskGapKeys = evaluateRisks(answerValues(project), { templateVersion: project.templateVersion }).flatMap((risk) => risk.missingKeys);
  for (const key of riskGapKeys) {
    const field = template.fields.find((candidate) => candidate.key === key);
    if (field && isApplicable(field, project) && !hasAnswer(project, key)) {
      return questionFor(field, 'risk_evidence');
    }
  }

  for (const section of SECTION_PRIORITY.slice(2)) {
    const field = missingRequired.find((candidate) => candidate.section === section);
    if (field) return questionFor(field, 'required');
  }

  const optional = template.fields.find(
    (field) => field.section === 'commitment' && isApplicable(field, project) && !hasAnswer(project, field.key),
  );
  return optional ? questionFor(optional, 'optional') : undefined;
}

export function isReadyForReview(project: PreauditProject): boolean {
  if (getMissingRequiredFields(project).length > 0) return false;
  if (findAnswerConsistencyIssues(project).length > 0) return false;
  return evaluateRisks(answerValues(project), { templateVersion: project.templateVersion }).every((risk) => risk.missingKeys.length === 0);
}
