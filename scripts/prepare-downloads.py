"""Add a plain launch guide to validated native ZIPs without changing app bytes."""
import hashlib
import json
from pathlib import Path
import shutil
import sys
import zipfile

originals, output, expected_source = Path(sys.argv[1]), Path(sys.argv[2]), sys.argv[3]
output.mkdir(parents=True, exist_ok=True)
records = []
for platform, guide_name in [('win32', 'START-HERE-WINDOWS.txt'), ('darwin', 'START-HERE-MAC.txt')]:
    matches = list(originals.glob('*' + platform + '*.zip'))
    if len(matches) != 1:
        raise RuntimeError('Expected one validated native ZIP for ' + platform)
    original = matches[0]
    original_hash = hashlib.sha256(original.read_bytes()).hexdigest()
    assert original_hash == Path(str(original) + '.sha256').read_text().split()[0], 'Original checksum mismatch'
    with zipfile.ZipFile(original) as archive:
        assert archive.testzip() is None
        entries = {i.filename: (hashlib.sha256(archive.read(i)).hexdigest(), i.external_attr) for i in archive.infolist()}
        manifests = [n for n in entries if n.count('/') == 1 and n.endswith('/release-source.json')]
        assert len(manifests) == 1
        prefix = manifests[0].rsplit('/', 1)[0]
        manifest = json.loads(archive.read(manifests[0]))
        assert manifest['commit'] == expected_source and not manifest['dirty'], 'Wrong app source'
    target = output / original.name
    assert target.resolve() != original.resolve()
    shutil.copyfile(original, target)
    guide_path = prefix + '/START-HERE.txt'
    guide = Path('docs/release', guide_name).read_bytes()
    if guide_path not in entries:
        info = zipfile.ZipInfo(guide_path, date_time=(2026, 10, 30, 0, 0, 0))
        info.compress_type = zipfile.ZIP_DEFLATED
        info.external_attr = 0o100644 << 16
        with zipfile.ZipFile(target, 'a') as archive:
            archive.writestr(info, guide)
    with zipfile.ZipFile(target) as archive:
        assert archive.testzip() is None
        assert archive.read(guide_path) == guide, 'Unexpected launch guide'
        assert len(archive.infolist()) == len(entries) + int(guide_path not in entries)
        for name, (digest, attrs) in entries.items():
            assert hashlib.sha256(archive.read(name)).hexdigest() == digest, name
            assert archive.getinfo(name).external_attr == attrs, name
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    Path(str(target) + '.sha256').write_text(digest + '  ' + target.name + '\n')
    records.append(dict(file=target.name, sha256=digest, bytes=target.stat().st_size,
                        originalArchiveSha256=original_hash, appSource=expected_source,
                        verification='All original entry hashes and Unix attributes unchanged; ZIP integrity passed; root launch guide included'))
(output / 'download-verification.json').write_text(json.dumps(records, indent=2) + '\n')
print(json.dumps(records, indent=2))
