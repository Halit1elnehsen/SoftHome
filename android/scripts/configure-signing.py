#!/usr/bin/env python3
"""Send a private signing backup to encrypted GitHub Actions Secrets through gh."""
import argparse
import base64
import json
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('backup_directory', type=Path, help='Private directory containing signing.json and the keystore')
parser.add_argument('--repo', default='Halit1elnehsen/SoftHome')
args = parser.parse_args()
folder = args.backup_directory.resolve()
config = json.loads((folder / 'signing.json').read_text())
keyfile = (folder / config['storeFile']).resolve()
if keyfile.parent != folder:
    parser.error('Keystore must be inside the private backup directory')
values = {
    'SOFTHOME_KEYSTORE_BASE64': base64.b64encode(keyfile.read_bytes()),
    'SOFTHOME_KEYSTORE_PASSWORD': config['storePassword'].encode(),
    'SOFTHOME_KEY_ALIAS': config['keyAlias'].encode(),
    'SOFTHOME_KEY_PASSWORD': config['keyPassword'].encode(),
}
for name, value in values.items():
    subprocess.run(['gh', 'secret', 'set', name, '--repo', args.repo], input=value, check=True)
    print(name + ' saved (value hidden).')
print('All four encrypted Actions Secrets saved. Keep the offline backup as well.')
