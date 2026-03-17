type VariableLike = {
  id: string;
  name: string;
};

export const RUNABLE_INTEGRATION_VARIABLE_NAME = 'Runable Integration';

function normalizeVariableName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function isRunableIntegrationVariableName(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = normalizeVariableName(value);
  return normalized === 'runableintegration' || normalized === 'runnableintegration';
}

export function parseVariableBoolean(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value !== 'string') return false;

  const normalized = value.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes' || normalized === 'on';
}

export function getRunableIntegrationVariable<T extends VariableLike>(variables: T[] | null | undefined): T | null {
  if (!Array.isArray(variables)) return null;
  return variables.find((variable) => isRunableIntegrationVariableName(variable.name)) || null;
}

export function getRunableIntegrationValue(
  values: Record<string, unknown> | null | undefined,
  variableId?: string | null
): boolean {
  if (!values || !variableId) return false;
  return parseVariableBoolean(values[variableId]);
}

export function getRunableIntegrationValueByName(values: Record<string, unknown> | null | undefined): boolean {
  if (!values) return false;

  for (const [key, value] of Object.entries(values)) {
    if (isRunableIntegrationVariableName(key)) {
      return parseVariableBoolean(value);
    }
  }

  return false;
}
