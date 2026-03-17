import { describe, expect, it } from 'vitest';
import {
  getRunableIntegrationValue,
  getRunableIntegrationValueByName,
  getRunableIntegrationVariable,
  isRunableIntegrationVariableName,
  parseVariableBoolean,
} from '@/lib/runable-integration';

describe('runable integration helpers', () => {
  it('matches both runable and runnable spellings', () => {
    expect(isRunableIntegrationVariableName('Runable Integration')).toBe(true);
    expect(isRunableIntegrationVariableName('Runnable Integration')).toBe(true);
    expect(isRunableIntegrationVariableName('Text Overlay')).toBe(false);
  });

  it('parses boolean-like values used by variable storage', () => {
    expect(parseVariableBoolean('true')).toBe(true);
    expect(parseVariableBoolean('yes')).toBe(true);
    expect(parseVariableBoolean('1')).toBe(true);
    expect(parseVariableBoolean('false')).toBe(false);
    expect(parseVariableBoolean(undefined)).toBe(false);
  });

  it('finds the runnable variable and reads its current value', () => {
    const variable = getRunableIntegrationVariable([
      { id: 'text', name: 'Text Overlay' },
      { id: 'runable', name: 'Runable Integration' },
    ]);

    expect(variable?.id).toBe('runable');
    expect(getRunableIntegrationValue({ runable: 'true' }, variable?.id)).toBe(true);
    expect(getRunableIntegrationValue({ runable: 'false' }, variable?.id)).toBe(false);
  });

  it('reads runnable state from analytics post variable maps keyed by name', () => {
    expect(getRunableIntegrationValueByName({ 'Runable Integration': 'true' })).toBe(true);
    expect(getRunableIntegrationValueByName({ 'Runnable Integration': 'false' })).toBe(false);
  });
});
