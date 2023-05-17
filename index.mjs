#!/usr/bin/env node

import * as fs from 'fs/promises';
import * as path from 'path';
import { argv } from 'node:process';
import yargs from 'yargs';

/**
 * Describe the command line interface with --help option
 */
const parsedArguments = yargs(argv)
  .scriptName('bump-package-versions')
  .usage('Usage: $0 [options] <relative package.json paths>')
  .command('$0', 'Bump versions in multiple package.json and package-lock.json files at the same time.')
  .example('$0 --part=minor --strategy=highest ./package.json ./frontend/package.json ./backend/package.json')

  .option('part', {
    alias: 'p',
    describe: 'Which part of the version do you want to bump.',
    choices: ['major', 'minor', 'patch'],
    default: 'patch',
    nargs: 1
  })

  .option('strategy', {
    alias: 's',
    describe: 'Which strategy to use for determining the version.\n  "highest"\n\tWill find the highest version in all the files, and bump that version, \n\tthen apply that version to all files.\n  "separate"\n\tWill bump the version of each file separately.',
    choices: ['highest', 'separate'],
    default: 'separate',
    nargs: 1
  })

  .help('h')
  .alias('h', 'help')

  .wrap(null)
  .argv;

/**
 *
 * @param versionString version to be parsed. eg: "12.0.3"
 * @return {number[]} parsed version is returned. eg: [12, 0, 3]
 */
function parseVersion(versionString) {
  return versionString.split('.').map((num) => parseInt(num, 10));
}

/**
 * Bumps a parsed version according to the desired part
 * @param parsedVersion eg: [12, 0, 3]
 * @param part eg: minor
 * @return {string} returns the bumped string. eg: "12.1.0"
 */
function bumpParsedVersion(parsedVersion, part) {
  // Increment the version based on the passed part: major, minor, patch
  let newVersionParsed;
  switch (part) {
    case 'major':
      newVersionParsed = [parsedVersion[0] + 1, 0, 0]
      break;

    case 'minor':
      newVersionParsed = [parsedVersion[0], parsedVersion[1] + 1, 0]
      break;

    case 'patch':
      newVersionParsed = [parsedVersion[0], parsedVersion[1], parsedVersion[2] + 1];
      break;
  }
  return newVersionParsed.join('.');
}

/**
 * Bumps the versions in all the specified package.json and their corresponding package-lock.json files
 * @param args
 * @return {Promise<void>}
 */
async function bumpVersions(args) {
  // Parse the passed arguments
  const packageJsonPathsRelative = args._.slice(2); // eg: ./package.json

  const packageJsonPathsAbsolute = packageJsonPathsRelative.map((packageJsonPath) => path.join(path.resolve('./'), packageJsonPath));
  const packageJsonLockPathsAbsolute = packageJsonPathsAbsolute.map((packageJsonPath) => packageJsonPath.replace('.json', '-lock.json'));

// Load package.json files from disk and parse the json
  const packageJsonContents = await Promise.all(packageJsonPathsAbsolute.map(async (path) => {
    return JSON.parse((await fs.readFile(path)).toString('utf8'));
  }));
// Load package-lock.json files from disk and parse the json
  const packageJsonLockContents = await Promise.all(packageJsonLockPathsAbsolute.map(async (path) => {
    return JSON.parse((await fs.readFile(path)).toString('utf8'));
  }));

  const versions = packageJsonContents.map((content) => content.version);

  const parsedVersions = versions.map(parseVersion);

  let newVersionString;
  if (args.strategy === 'highest') {
    // Find the biggest version
    let biggestVersion = parsedVersions.at(0);
    parsedVersions.forEach(parsedVersion => {
      if (parsedVersion[0] > biggestVersion[0]) {
        biggestVersion = parsedVersion;
      }
      if (parsedVersion[1] > biggestVersion[1]) {
        biggestVersion = parsedVersion;
      }
      if (parsedVersion[2] > biggestVersion[2]) {
        biggestVersion = parsedVersion;
      }
    });

    newVersionString = bumpParsedVersion(biggestVersion, args.part);

    // Update package.json versions with the new version
    packageJsonContents.forEach(content => {
      content.version = newVersionString
    });
    // Update package-lock.json versions with the new version
    packageJsonLockContents.forEach(content => {
      content.version = newVersionString;
      content.packages[''].version = newVersionString;
    });
  } else if (args.strategy === 'separate') {
    // Update package.json versions with the new version
    packageJsonContents.forEach(content => {
      const parsedVersion = parseVersion(content.version);
      newVersionString = bumpParsedVersion(parsedVersion, args.part);
      content.version = newVersionString;
    });

    // Update package-lock.json versions with the new version
    packageJsonLockContents.forEach(content => {
      const parsedVersion = parseVersion(content.version);
      newVersionString = bumpParsedVersion(parsedVersion, args.part);

      content.version = newVersionString;
      content.packages[''].version = newVersionString;
    });
  }

// Write package.json files back to disk
  await Promise.all(packageJsonPathsAbsolute.map(async (path, index) => {
    return await fs.writeFile(path, JSON.stringify(packageJsonContents[index], null, '\t'));
  }));
// Write package-lock.json files back to disk
  await Promise.all(packageJsonLockPathsAbsolute.map(async (path, index) => {
    return await fs.writeFile(path, JSON.stringify(packageJsonLockContents[index], null, '\t'));
  }));

  console.log(`Versions of ${packageJsonContents.length + packageJsonLockContents.length} files were updated${args.strategy === 'highest' ? ' to version ' + newVersionString : ''}.`)
}

bumpVersions(parsedArguments);
