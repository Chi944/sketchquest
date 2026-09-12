import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { evaluate, parseDataset, parsePredictions } from '../eval/evaluate';

const args = process.argv.slice(2);
const options = new Map<string, string>();
for (let index = 0; index < args.length; index += 2) {
  const name = args[index];
  const value = args[index + 1];
  if (
    !['--dataset', '--predictions', '--output'].includes(name) ||
    !value ||
    value.startsWith('--')
  )
    throw new Error(
      'Usage: tsx scripts/evaluate-extraction.ts [--dataset path.json] [--predictions path.json] [--output path.json]',
    );
  options.set(name, value);
}
const defaultDataset = fileURLToPath(new URL('../eval/dataset.json', import.meta.url));
const dataset = parseDataset(
  JSON.parse(await readFile(options.get('--dataset') ?? defaultDataset, 'utf8')),
);
const predictionsPath = options.get('--predictions');
const predictions = predictionsPath
  ? parsePredictions(JSON.parse(await readFile(resolve(predictionsPath), 'utf8')))
  : parsePredictions({ schemaVersion: 1, records: [] });
const report = JSON.stringify(evaluate(dataset, predictions), null, 2) + '\n';
const output = options.get('--output');
if (output) {
  await writeFile(resolve(output), report);
  console.log(`Wrote offline extraction report to ${resolve(output)}. No model calls were made.`);
} else console.log(report.trimEnd());
