import path from 'node:path';
import { FilePreauditRepository } from './repository';
import { PreauditService } from './service';
import { ACTIVE_TEMPLATE } from './template';
import { FileTemplateRegistry } from './template-registry';
import { FileTrackingImportRepository } from './tracking-imports';
import { FileOrganizationConfigRepository } from './organization-config';
import { loadRiskConfiguration } from './risk-config-store';

let servicePromise: Promise<PreauditService> | undefined;
let templateRegistryPromise: Promise<FileTemplateRegistry> | undefined;
let trackingImportRepositoryPromise: Promise<FileTrackingImportRepository> | undefined;
let organizationConfigRepositoryPromise: Promise<FileOrganizationConfigRepository> | undefined;

export function getFixedTemplate() {
  return ACTIVE_TEMPLATE;
}

export function getTemplateRegistry(): Promise<FileTemplateRegistry> {
  if (!templateRegistryPromise) {
    templateRegistryPromise = (async () => {
      const stateDirectory = process.env.PREAUDIT_DATA_DIR || path.resolve('data', 'state');
      const templateDirectory = process.env.PREAUDIT_TEMPLATE_DIR || path.resolve('data', 'templates');
      const registry = new FileTemplateRegistry(stateDirectory, templateDirectory);
      await registry.initialize();
      return registry;
    })();
  }
  return templateRegistryPromise;
}

export async function getTemplateByToken(token: string) {
  return (await getTemplateRegistry()).getByToken(token);
}

export function getPreauditService(): Promise<PreauditService> {
  if (!servicePromise) {
    servicePromise = (async () => {
      const dataDirectory = process.env.PREAUDIT_DATA_DIR || path.resolve('data', 'state');
      const repository = new FilePreauditRepository(dataDirectory);
      await repository.initialize();
      await loadRiskConfiguration();
      return new PreauditService(repository, {
        organizationProvider: async () => (await getOrganizationConfigRepository()).list(),
      });
    })();
  }
  return servicePromise;
}

export function getTrackingImportRepository(): Promise<FileTrackingImportRepository> {
  if (!trackingImportRepositoryPromise) {
    trackingImportRepositoryPromise = (async () => {
      const dataDirectory = process.env.PREAUDIT_DATA_DIR || path.resolve('data', 'state');
      const repository = new FileTrackingImportRepository(dataDirectory);
      await repository.initialize();
      return repository;
    })();
  }
  return trackingImportRepositoryPromise;
}

export function getOrganizationConfigRepository(): Promise<FileOrganizationConfigRepository> {
  if (!organizationConfigRepositoryPromise) {
    organizationConfigRepositoryPromise = (async () => {
      const dataDirectory = process.env.PREAUDIT_DATA_DIR || path.resolve('data', 'state');
      const repository = new FileOrganizationConfigRepository(dataDirectory);
      await repository.initialize();
      return repository;
    })();
  }
  return organizationConfigRepositoryPromise;
}
