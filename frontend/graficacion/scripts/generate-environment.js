const { readFileSync, writeFileSync, existsSync, mkdirSync } = require('node:fs');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const envFile = resolve(root, '.env');
const outDir = resolve(root, 'src', 'environments');

function parseEnv(content) {
  const env = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const index = trimmed.indexOf('=');
    if (index === -1) {
      continue;
    }
    const key = trimmed.slice(0, index).trim();
    let value = trimmed.slice(index + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = existsSync(envFile) ? parseEnv(readFileSync(envFile, 'utf8')) : {};
const apiBaseUrl = env.API_BASE_URL || 'http://localhost:4000';

if (!existsSync(outDir)) {
  mkdirSync(outDir, { recursive: true });
}

const devContent = `export const environment = {
  production: false,
  apiBaseUrl: ${JSON.stringify(apiBaseUrl)}
};
`;

const prodContent = `export const environment = {
  production: true,
  apiBaseUrl: ${JSON.stringify(apiBaseUrl)}
};
`;

writeFileSync(resolve(outDir, 'environment.ts'), devContent, 'utf8');
writeFileSync(resolve(outDir, 'environment.prod.ts'), prodContent, 'utf8');

console.log('Generated Angular environment files from .env');
