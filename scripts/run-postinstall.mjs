// Run only the postinstall steps this fork needs.
// prepareWindowsNode() is intentionally skipped: assets/dsh-node.exe was copied
// from the known-good 0.3.8 install, so there is no reason to overwrite it with
// whichever node happens to run this script.
import { prepareApiProxy, prepareDshManifest } from '../scripts/prepare-dependencies.mjs'

console.log('prepareApiProxy   ->', prepareApiProxy())
console.log('prepareDshManifest->', prepareDshManifest())
