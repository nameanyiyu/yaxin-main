import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { defaultRiskConfiguration, setRuntimeRiskConfiguration, type RiskConfiguration } from './risk-config';

function stateFilePath(): string {
  const directory = process.env.PREAUDIT_DATA_DIR || path.resolve('data', 'state');
  return path.join(directory, 'risk-configuration.json');
}

export async function loadRiskConfiguration(): Promise<RiskConfiguration> {
  try {
    return setRuntimeRiskConfiguration(JSON.parse(await readFile(stateFilePath(), 'utf8')));
  } catch {
    return setRuntimeRiskConfiguration(defaultRiskConfiguration());
  }
}

export async function saveRiskConfiguration(input: unknown): Promise<RiskConfiguration> {
  const next = setRuntimeRiskConfiguration(input);
  const file = stateFilePath();
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.tmp`;
  await writeFile(temporary, `${JSON.stringify({ ...next, updatedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  await rename(temporary, file);
  return loadRiskConfiguration();
}
