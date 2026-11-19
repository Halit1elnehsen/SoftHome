#!/usr/bin/env python3
"""Create a release APK with the original test-to-private-key signing lineage.

Private keys and passwords are read only from environment variables.
The generated lineage is public certificate/proof data, never a private key.
"""
import argparse
import os
import subprocess
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('input_apk', type=Path)
parser.add_argument('output_apk', type=Path)
parser.add_argument('--apksigner', default='apksigner')
parser.add_argument('--lineage', type=Path, required=True)
args = parser.parse_args()
required = ['SOFTHOME_KEYSTORE_PATH','SOFTHOME_KEYSTORE_PASSWORD','SOFTHOME_KEY_ALIAS','SOFTHOME_KEY_PASSWORD',
            'SOFTHOME_LEGACY_KEYSTORE_PATH','SOFTHOME_LEGACY_KEYSTORE_PASSWORD','SOFTHOME_LEGACY_KEY_ALIAS','SOFTHOME_LEGACY_KEY_PASSWORD']
missing = [name for name in required if not os.environ.get(name)]
if missing:
    parser.error('Missing signing environment values: '+', '.join(missing))
if args.input_apk.resolve() == args.output_apk.resolve():
    parser.error('Keep the standard release APK and write the transition APK to a separate path')

def signer(prefix):
    return ['--ks',os.environ[prefix+'_KEYSTORE_PATH'],'--ks-key-alias',os.environ[prefix+'_KEY_ALIAS'],
            '--ks-pass','env:'+prefix+'_KEYSTORE_PASSWORD','--key-pass','env:'+prefix+'_KEY_PASSWORD']

args.lineage.parent.mkdir(parents=True,exist_ok=True)
args.output_apk.parent.mkdir(parents=True,exist_ok=True)
subprocess.run([args.apksigner,'rotate','--out',str(args.lineage),'--old-signer',*signer('SOFTHOME_LEGACY'),
                '--new-signer',*signer('SOFTHOME')],check=True)
subprocess.run([args.apksigner,'sign','--out',str(args.output_apk),'--lineage',str(args.lineage),
                '--rotation-min-sdk-version','28','--v1-signing-enabled','true','--v2-signing-enabled','true',
                '--v3-signing-enabled','true','--v4-signing-enabled','false','--debuggable-apk-permitted','false',
                *signer('SOFTHOME_LEGACY'),'--next-signer',*signer('SOFTHOME'),str(args.input_apk)],check=True)
subprocess.run([args.apksigner,'verify','--verbose',str(args.output_apk)],check=True)
