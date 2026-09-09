---
id: verification-starter
version: 1
---

# Optional raw-byte verification starter

Copy this example to verify.py in the product repository and replace the example case with assertions from the accepted requirements. Commit it with the product, declare it as verification_script, and use ["python3", "verify.py"] as verification_command with the selected pinned Python image. MDLM starts Docker; this script runs directly inside that container. Use another language when the chosen product environment requires it.

```python
import subprocess
import sys


def check(argv, stdin, expected_exit, expected_stdout, expected_stderr):
    result = subprocess.run(argv, input=stdin, capture_output=True, check=False)
    actual = (result.returncode, result.stdout, result.stderr)
    expected = (expected_exit, expected_stdout, expected_stderr)
    if actual != expected:
        raise AssertionError(f"{argv!r}: expected {expected!r}, got {actual!r}")


try:
    # Example for a comma counter only. Replace with this product's requirements.
    check([sys.executable, "count.py"], b"a,b,c", 0, b"2\n", b"")
except AssertionError as error:
    print(f"FAIL: {error}", file=sys.stderr)
    sys.exit(1)
except Exception as error:
    print(f"ERROR: {error}", file=sys.stderr)
    sys.exit(2)
print("PASS: all declared assertions ran")
```

Compare raw bytes when exact output is required. If a requirement leaves usage wording open, assert its required properties instead of fixing arbitrary prose. For persistent products, exercise separate invocations against the same temporary data file and verify state after failures. The script owns assertions and exit status; inspect the CLI receipt and briefly assess the captured result.
