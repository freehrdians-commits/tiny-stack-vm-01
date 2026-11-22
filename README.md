[![make.fun](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)
[![rank](https://make.fun/badge/tiny-stack-vm-01-run-20261122/freehrdians-commits/tiny-stack-vm/rank.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)
[![reward](https://make.fun/badge/tiny-stack-vm-01-run-20261122/freehrdians-commits/tiny-stack-vm/reward.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)

# Tiny Stack VM

A tiny stack virtual machine for make.fun's tiny stack ISA v1, written for the
[make.fun bounty](https://make.fun/bounty/tiny-stack-vm-01-run-20261122).

`main.ts` (Node 22, stdlib only) runs every `/input/<id>/program.bin` on its
`input.bin` and writes `/output/<id>/stdout.bin` plus `exit.txt`. It implements
the full ISA: wrapping 32-bit arithmetic, unsigned DIV/MOD/LT, shifts by the
low 5 bits, calls, 256 words of memory, input/output, and all ten traps with
their exact exit codes. Practice set: **score 1,000,000 (40/40)** in 0.4s,
deterministic across runs.
