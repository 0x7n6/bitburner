"""Check syntax in tracked Python scripts without importing or running them."""

from pathlib import Path
import subprocess
import sys


def main():
    root = Path(__file__).resolve().parent.parent
    paths = subprocess.check_output(
        ["git", "ls-files", "-z", "--", "scripts", "helper/check-python.py"],
        cwd=root,
    ).split(b"\0")
    python_files = [Path(path.decode("utf-8")) for path in paths if path.lower().endswith(b".py")]
    failed = False
    for path in python_files:
        try:
            compile((root / path).read_bytes(), str(path), "exec")
        except (SyntaxError, ValueError, OSError) as error:
            print(f"{path}: {error}", file=sys.stderr)
            failed = True
    print(f"Checked {len(python_files)} tracked Python file(s).")
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
