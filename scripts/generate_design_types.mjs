import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const schemaPath = resolve(root, 'schema/design-ir.schema.json');
const outputPath = resolve(root, 'packages/design-protocol/src/generated.ts');
const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));

let output = `// GENERATED from schema/design-ir.schema.json. Do not edit by hand.\n`;
output += `export const DESIGN_IR_SCHEMA_VERSION = ${JSON.stringify(schema.schema_version)} as const;\n\n`;
output += schema.prelude.join('\n') + '\n\n';
for (const [name, fields] of Object.entries(schema.entities)) {
  output += `export interface ${name} {\n`;
  for (const [rawName, type] of Object.entries(fields)) {
    const optional = rawName.endsWith('?');
    const field = optional ? rawName.slice(0, -1) : rawName;
    output += `  ${field}${optional ? '?' : ''}: ${type};\n`;
  }
  output += '}\n\n';
}
output = `${output.trimEnd()}\n`;

if (process.argv.includes('--check')) {
  const current = readFileSync(outputPath, 'utf8');
  if (current !== output) {
    console.error('DesignIR generated TypeScript is stale. Run: node scripts/generate_design_types.mjs');
    process.exit(1);
  }
} else {
  writeFileSync(outputPath, output, 'utf8');
}
