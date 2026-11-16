// Hand-in program for the makefun-frontend-01 entry.
//
// Copies the static app (app/) and its screenshots (screenshots/) from this
// repository into the output directory, then writes dossier.json there with
// the kit's dossier library. The grader runs this twice in a sandbox with no
// network; both runs must produce byte-identical output, so the copy walks
// each tree in sorted order and nothing time- or random-shaped is written.

import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildDossier } from './vendor/makefun-frontend.ts';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outputDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// The caps the scorer grades with; passing them here makes this program fail
// in exactly the places the scorer would refuse the entry.
const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 3, max_bytes: 262144 },
  app_max_files: 993,
  app_max_bytes: 16777216,
  app_path_max_bytes: 1000,
};

function copyTree(name: string): void {
  const from = join(repoRoot, name);
  const to = join(outputDir, name);
  if (!existsSync(from)) {
    throw new Error(`missing ${name}/ in the repository`);
  }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
}

// The gate refuses an app/ holding a symbolic link or any other special
// file, so fail here — loudly, at hand-in time — rather than at the scorer.
function refuseSpecialFiles(dir: string): void {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isSymbolicLink() || (!entry.isDirectory() && !entry.isFile())) {
      throw new Error(`special file in the entry: ${path}`);
    }
    if (entry.isDirectory()) refuseSpecialFiles(path);
    else if (!lstatSync(path).isFile()) throw new Error(`special file: ${path}`);
  }
}

mkdirSync(outputDir, { recursive: true });
copyTree('app');
copyTree('screenshots');
refuseSpecialFiles(join(outputDir, 'app'));

const dossier = buildDossier(outputDir, DOSSIER_CAPS);
writeFileSync(join(outputDir, 'dossier.json'), dossier);
