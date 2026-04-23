import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const TRADER_INI_PATTERN = /^BZR_(.+)_CWR(?:\.ini)?$/i;
const execFileAsync = promisify(execFile);

export interface MarketPriceWizardTraderFile {
  characterName: string;
  fileName: string;
}

export async function pickMarketPriceWizardDirectory(): Promise<string | null> {
  if (process.platform !== 'win32') {
    throw new Error('Native EQ directory picking is only supported on Windows.');
  }

  const script = [
    'Add-Type -AssemblyName System.Windows.Forms',
    '$dialog = New-Object System.Windows.Forms.FolderBrowserDialog',
    "$dialog.Description = 'Select your EverQuest game directory'",
    '$dialog.ShowNewFolderButton = $false',
    'if ($dialog.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {',
    '  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8',
    '  Write-Output $dialog.SelectedPath',
    '}'
  ].join('; ');

  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-STA', '-Command', script],
    {
      windowsHide: false,
      maxBuffer: 1024 * 1024
    }
  );

  const selectedPath = stdout.trim();
  return selectedPath.length > 0 ? selectedPath : null;
}

function normalizeDirectoryPath(directoryPath: string): string {
  const trimmed = directoryPath.trim();
  if (!trimmed) {
    throw new Error('EQ game directory path is required.');
  }

  const resolved = path.resolve(trimmed);
  if (!path.isAbsolute(resolved)) {
    throw new Error('EQ game directory must be an absolute path.');
  }

  return resolved;
}

function normalizeTraderFileName(fileName: string): string {
  const trimmed = fileName.trim();
  if (!trimmed) {
    throw new Error('Trader INI file name is required.');
  }

  if (path.basename(trimmed) !== trimmed || trimmed.includes('/') || trimmed.includes('\\')) {
    throw new Error('Trader INI file name must not include directory segments.');
  }

  if (!TRADER_INI_PATTERN.test(trimmed)) {
    throw new Error('Trader INI file name must match BZR_<characterName>_CWR.ini.');
  }

  return trimmed;
}

async function ensureDirectoryExists(directoryPath: string): Promise<string> {
  const resolved = normalizeDirectoryPath(directoryPath);
  const stat = await fs.stat(resolved).catch(() => null);
  if (!stat?.isDirectory()) {
    throw new Error('EQ game directory was not found.');
  }

  return resolved;
}

function buildTraderFilePath(directoryPath: string, fileName: string) {
  return path.join(directoryPath, normalizeTraderFileName(fileName));
}

export async function listMarketPriceWizardTraderFiles(
  directoryPath: string
): Promise<MarketPriceWizardTraderFile[]> {
  const resolvedDirectory = await ensureDirectoryExists(directoryPath);
  const entries = await fs.readdir(resolvedDirectory, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => {
      const match = TRADER_INI_PATTERN.exec(entry.name);
      if (!match) {
        return null;
      }

      return {
        characterName: match[1],
        fileName: entry.name
      };
    })
    .filter((entry): entry is MarketPriceWizardTraderFile => Boolean(entry))
    .sort(
      (left, right) =>
        left.characterName.localeCompare(right.characterName) ||
        left.fileName.localeCompare(right.fileName)
    );
}

export async function readMarketPriceWizardTraderFile(
  directoryPath: string,
  fileName: string
): Promise<{ fileName: string; content: string }> {
  const resolvedDirectory = await ensureDirectoryExists(directoryPath);
  const normalizedFileName = normalizeTraderFileName(fileName);
  const targetPath = buildTraderFilePath(resolvedDirectory, normalizedFileName);
  const content = await fs.readFile(targetPath, 'utf8').catch(() => null);

  if (content == null) {
    throw new Error(`${normalizedFileName} was not found in the EQ game directory.`);
  }

  return {
    fileName: normalizedFileName,
    content
  };
}

export async function saveMarketPriceWizardTraderFile(
  directoryPath: string,
  fileName: string,
  content: string
): Promise<void> {
  const resolvedDirectory = await ensureDirectoryExists(directoryPath);
  const normalizedFileName = normalizeTraderFileName(fileName);
  const targetPath = buildTraderFilePath(resolvedDirectory, normalizedFileName);
  await fs.writeFile(targetPath, content, 'utf8');
}
