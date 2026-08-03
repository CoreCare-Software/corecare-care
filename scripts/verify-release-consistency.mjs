import { readFileSync } from 'node:fs';

const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const version = packageJson.version;

const checks = [
  {
    file: '../src/index.js',
    expected: [
      `const VERSION = "${version}";`,
      `const RELEASE = "CoreCare Care ${version}`
    ]
  },
  {
    file: '../public/app.js',
    expected: [`const CORECARE_FALLBACK_VERSION = '${version}';`]
  },
  {
    file: '../public/index.html',
    expected: [`styles.css?v=${version}`, `app.js?v=${version}`]
  },
  {
    file: `../RELEASE-${version}.md`,
    expected: [version]
  }
];

const failures = [];

for (const check of checks) {
  const url = new URL(check.file, import.meta.url);
  let contents;

  try {
    contents = readFileSync(url, 'utf8');
  } catch (error) {
    failures.push(`${check.file}: ${error.code === 'ENOENT' ? 'file is missing' : error.message}`);
    continue;
  }

  for (const expected of check.expected) {
    if (!contents.includes(expected)) failures.push(`${check.file}: missing ${JSON.stringify(expected)}`);
  }
}

if (failures.length) {
  console.error(`Release consistency check failed for package version ${version}:`);
  failures.forEach(failure => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log(`Release metadata is consistent at version ${version}.`);
}
