import { Command, Option } from 'commander';
import pc from 'picocolors';
import ora from 'ora';
import { createRequire } from 'node:module';
import { checkName, getNpmToken } from './check.js';
import { suggestNames } from './suggest.js';
import type { CheckResult } from './check.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

function npmLink({ result }: { result: CheckResult }): string {
  const name = result.name;
  if (result.isOrganization) {
    return `https://www.npmjs.com/org/${name.replace(/^@/, '').replace(/\/$/, '')}`;
  }
  return `https://www.npmjs.com/package/${name}`;
}

function logResult({ result }: { result: CheckResult }): void {
  const name = pc.bold(result.name);

  switch (result.status) {
    case 'available':
      console.log(`${pc.green('✔')} ${name} is available`);
      if (result.reason) {
        console.log(`  ${pc.dim(result.reason)}`);
      }
      break;
    case 'squatted':
      console.log(`${pc.yellow('⚠')} ${name} is squatted ${pc.dim(`(${npmLink({ result })})`)}`);
      break;
    case 'taken':
      console.log(`${pc.red('✖')} ${name} is unavailable ${pc.dim(`(${npmLink({ result })})`)}`);
      break;
    case 'blocked':
      console.log(`${pc.yellow('⚠')} ${name} is blocked by npm similarity filter`);
      if (result.similarTo && result.similarTo.length > 0) {
        console.log(`  ${pc.dim('Similar to:')} ${result.similarTo.join(', ')}`);
      }
      break;
    case 'invalid':
      console.log(`${pc.red('✖')} ${name} ${pc.dim(`— ${result.reason}`)}`);
      break;
  }
}

const program = new Command();

program
  .name('can-i-publish')
  .description('Check if your npm package name is actually publishable')
  .version(version, '-v, --version')
  .argument('<names...>', 'one or more package names to check')
  .option('-s, --suggest', 'suggest alternative names if unavailable')
  .option('-j, --json', 'output results as JSON')
  .addOption(new Option('--no-banner').hideHelp())
  .action(async (names: string[], opts: { suggest?: boolean; json?: boolean; banner?: boolean }) => {
    if (!opts.json && opts.banner !== false) {
      console.log(`\n  ${pc.bold('can-i-publish')} ${pc.dim(`v${version}`)}\n`);
    }

    const spinner = opts.json
      ? null
      : ora(`Checking ${names.length === 1 ? 'name' : 'names'} on npmjs.com…`).start();

    const results = await Promise.all(names.map((name) => checkName({ name })));

    if (spinner) {
      spinner.stop();
    }

    if (opts.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      for (const result of results) {
        logResult({ result });

        if (opts.suggest && result.status !== 'available') {
          const suggestSpinner = ora('Checking for alternative names…').start();
          const suggestions = await suggestNames({ name: result.name, limit: 3 });
          suggestSpinner.stop();
          if (suggestions.length > 0) {
            console.log('Similar names:');
            for (const s of suggestions) {
              console.log(`${pc.green('✔')} ${pc.bold(s.name)} is available`);
            }
            console.log();
          } else {
            console.log('No similar names found.\n');
          }
        }
      }
    }

    if (!opts.json) {
      const token = await getNpmToken();
      if (!token) {
        console.log(pc.dim('\nNote: Run `npm login` to also test npm\'s similarity filter.'));
      }
    }

    // Exit 0 for available or squatted, 1 for taken/blocked/invalid
    const hasFailed = results.some((r) => r.status !== 'available' && r.status !== 'squatted');
    process.exit(hasFailed ? 1 : 0);
  });

program.parse();
