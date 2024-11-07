import {Command, Option, UsageError} from 'clipanion';
import {mkdir}                       from 'fs/promises';
import path                          from 'path';

import * as folderUtils              from '../../folderUtils';
import {Context}                     from '../../main';
import {isSupportedPackageManager}   from '../../types';

export class HydrateCommand extends Command<Context> {
  static paths = [
    [`hydrate`],
  ];

  activate = Option.Boolean(`--activate`, false, {
    description: `If true, this release will become the default one for this package manager`,
  });

  fileName = Option.String();

  async execute() {
    const installFolder = folderUtils.getInstallFolder();
    const fileName = path.resolve(this.context.cwd, this.fileName);

    const archiveEntries = new Map<string, Set<string>>();
    let hasShortEntries = false;

    const {default: tar} = await import(`tar`);

    await tar.t({file: fileName, onentry: entry => {
      const segments = entry.path.split(/\//g);

      if (segments.length < 3) {
        hasShortEntries = true;
      } else {
        let references = archiveEntries.get(segments[0]);
        if (typeof references === `undefined`)
          archiveEntries.set(segments[0], references = new Set());

        references.add(segments[1]);
      }
    }});

    if (hasShortEntries || archiveEntries.size < 1)
      throw new UsageError(`Invalid archive format; did it get generated by 'corepack prepare'?`);

    for (const [name, references] of archiveEntries) {
      for (const reference of references) {
        if (!isSupportedPackageManager(name))
          throw new UsageError(`Unsupported package manager '${name}'`);

        if (this.activate)
          this.context.stdout.write(`Hydrating ${name}@${reference} for immediate activation...\n`);
        else
          this.context.stdout.write(`Hydrating ${name}@${reference}...\n`);

        // Recreate the folder in case it was deleted somewhere else:
        await mkdir(installFolder, {recursive: true});

        await tar.x({file: fileName, cwd: installFolder}, [`${name}/${reference}`]);

        if (this.activate) {
          await this.context.engine.activatePackageManager({name, reference});
        }
      }
    }

    this.context.stdout.write(`All done!\n`);
  }
}
