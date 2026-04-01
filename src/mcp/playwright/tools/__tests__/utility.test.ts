import * as os from 'os';
import * as path from 'path';
import { describe, expect, it } from 'vitest';
import { resolveBrowserExportPath } from '../utility';

describe('resolveBrowserExportPath', () => {
  const exportRoot = path.join(os.homedir(), '.wmux', 'exports');

  it('resolves default exports under the wmux export root', () => {
    expect(resolveBrowserExportPath(undefined, 'output.pdf')).toBe(
      path.join(exportRoot, 'output.pdf'),
    );
  });

  it('rejects absolute output paths', () => {
    expect(() => resolveBrowserExportPath(path.join(exportRoot, 'secret.pdf'), 'output.pdf')).toThrow(
      'Absolute output paths are not allowed',
    );
  });

  it('rejects traversal outside the export root', () => {
    expect(() => resolveBrowserExportPath('../outside.zip', 'trace.zip')).toThrow(
      'Output path escapes the export root',
    );
  });

  it('allows nested relative paths inside the export root', () => {
    expect(resolveBrowserExportPath('reports/run-1/trace.zip', 'trace.zip')).toBe(
      path.join(exportRoot, 'reports', 'run-1', 'trace.zip'),
    );
  });
});
