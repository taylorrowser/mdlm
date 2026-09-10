---
id: verification-starter
version: 2
---

# Optional raw-byte verification starter

Copy this example to verify.py in the product repository and replace the example case with assertions from the accepted requirements. Add explicit region annotations from the source-trace skill using the selected published requirement IDs. Commit it with the product, declare it as verification_script, and use ["python3", "verify.py"] as verification_command with the selected pinned Python image. MDLM starts Docker; this script runs directly inside that container.

```python
import subprocess
import sys


def check(argv, stdin, expected_exit, expected_stdout, expected_stderr):
    result = subprocess.run(argv, input=stdin, capture_output=True, check=False, timeout=5)
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

For a line-oriented interactive CLI, run the actual product as a child with a finite scripted dialogue through stdin. Assert prompt order, required output, and successful termination after quit. Use a subprocess timeout, as above, so missing quit handling becomes an execution error. The verifier runs unattended without an attached terminal; the child uses ordinary stdin/stdout pipes. Record human observations separately when judging whether the prompts are comfortable to use.
