#!/usr/bin/env python3
"""Run a shell command under a real pseudo-terminal and answer its [y/N] prompts
one at a time: each answer is sent only after its prompt appears.

    python3 tests/installer/interactive.py "y,n,y" "<shell command>"

Prints the transcript; exits with the command's exit code (124 on timeout).
Python stdlib only (pty), so it works where script(1) can't take a pipe or socket as stdin.
"""
import os, pty, select, sys, time

answers = [a for a in sys.argv[1].split(",") if a] if len(sys.argv) > 1 else []
command = sys.argv[2] if len(sys.argv) > 2 else None
if not command:
    sys.stderr.write('usage: interactive.py "y,n" "<command>"\n')
    sys.exit(2)

pid, fd = pty.fork()
if pid == 0:
    os.execvp("sh", ["sh", "-c", command])

out = b""
asked = 0
deadline = time.time() + float(os.environ.get("INTERACTIVE_TIMEOUT_S", "240"))
while True:
    if time.time() > deadline:
        os.kill(pid, 9)
        sys.stdout.write("\ninteractive.py: timed out\n")
        sys.exit(124)
    r, _, _ = select.select([fd], [], [], 0.5)
    if fd in r:
        try:
            chunk = os.read(fd, 4096)
        except OSError:
            break
        if not chunk:
            break
        out += chunk
        sys.stdout.write(chunk.decode("utf-8", "replace"))
        sys.stdout.flush()
        while asked < out.count(b"[y/N] "):
            time.sleep(0.15)  # like a person reading the question
            os.write(fd, ((answers[asked] if asked < len(answers) else "n") + "\n").encode())
            asked += 1
_, status = os.waitpid(pid, 0)
sys.stdout.write("\n# prompts answered: %d\n" % asked)
sys.exit(os.WEXITSTATUS(status) if os.WIFEXITED(status) else 1)
