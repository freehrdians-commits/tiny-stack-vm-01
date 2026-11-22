// Tiny stack VM — interpreter for make.fun's tiny stack ISA v1.
// Reads /input/<id>/program.bin + input.bin, writes /output/<id>/stdout.bin
// and /output/<id>/exit.txt for every instance id in the input directory.
// Node 22, standard library only, deterministic: no clock, no network,
// no environment-dependent behaviour.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const IN_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const MAX_STEPS = 1_000_000;
const MAX_STACK = 256;
const MAX_CALLS = 64;
const MAX_MEM = 256;
const MAX_OUT = 65_536;

// Trap exit codes from ISA.md.
const TRAP_UNDERFLOW = 2;
const TRAP_OVERFLOW = 3;
const TRAP_DIV_ZERO = 4;
const TRAP_BAD_OPCODE = 5;
const TRAP_BAD_ADDR = 6;
const TRAP_CALL_OVERFLOW = 7;
const TRAP_EMPTY_CALL = 8;
const TRAP_BAD_PC = 9;
const TRAP_STEPS = 10;
const TRAP_OUTPUT = 11;

// Run one program. Returns { out: Buffer, exit: number }.
function run(program, input) {
  const mem = new Int32Array(MAX_MEM);
  const stack = new Int32Array(MAX_STACK);
  const calls = new Int32Array(MAX_CALLS);
  let sp = 0; // number of values on the data stack
  let cp = 0; // number of return addresses on the call stack
  let pc = 0;
  let steps = 0;
  let inPos = 0;
  const out = Buffer.alloc(MAX_OUT);
  let outLen = 0;

  // Write bytes into the output buffer. Returns false (trap 11) when the
  // write would take the output past the limit; writes nothing in that case.
  function emit(bytes, len) {
    if (outLen + len > MAX_OUT) return false;
    for (let i = 0; i < len; i++) out[outLen++] = bytes[i];
    return true;
  }

  // The exit code of the run: 0 for HALT, the trap code for a trap, or the
  // EXIT operand's low byte.
  let exit = 0;

  for (;;) {
    // Rule 1: step limit, checked before anything else each step.
    if (steps >= MAX_STEPS) { exit = TRAP_STEPS; break; }
    // Rule 2: pc must be inside the program.
    if (pc < 0 || pc >= program.length) { exit = TRAP_BAD_PC; break; }
    const op = program[pc];
    // Instruction lengths and immediates, by opcode.
    let len = 1;
    let imm8 = 0;
    let imm32 = 0;
    let imm16 = 0;
    switch (op) {
      case 0x01: len = 2; break; // PUSH8
      case 0x02: len = 5; break; // PUSH32
      case 0x30: case 0x31: case 0x32: case 0x33: len = 3; break; // JMP JZ JNZ CALL
      case 0x00: case 0x03: case 0x04: case 0x05: case 0x06: case 0x07:
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14: case 0x15:
      case 0x16: case 0x17: case 0x18: case 0x19: case 0x1a: case 0x1b:
      case 0x1c: case 0x1d: case 0x1e: case 0x20: case 0x21: case 0x22:
      case 0x34: case 0x40: case 0x41: case 0x50: case 0x51: case 0x52:
      case 0x53:
        len = 1; break;
      default:
        // Rule 3: a byte no opcode names.
        exit = TRAP_BAD_OPCODE;
        return { out: out.subarray(0, outLen), exit };
    }
    // Rule 4: the immediate must fit before the end of the program.
    if (pc + len > program.length) { exit = TRAP_BAD_PC; break; }
    if (len === 2) imm8 = program[pc + 1];
    if (len === 5) {
      imm32 = (program[pc + 1] | (program[pc + 2] << 8) | (program[pc + 3] << 16) | (program[pc + 4] << 24)) | 0;
    }
    if (len === 3) imm16 = program[pc + 1] | (program[pc + 2] << 8);

    // The instruction executes now: it counts as one step.
    steps++;
    const next = pc + len;
    pc = next;

    switch (op) {
      case 0x00: // HALT
        return { out: out.subarray(0, outLen), exit: 0 };
      case 0x01: { // PUSH8: signed 8-bit, sign-extended
        if (sp >= MAX_STACK) { exit = TRAP_OVERFLOW; break; }
        stack[sp++] = (imm8 << 24) >> 24;
        break;
      }
      case 0x02: { // PUSH32: signed 32-bit little-endian
        if (sp >= MAX_STACK) { exit = TRAP_OVERFLOW; break; }
        stack[sp++] = imm32;
        break;
      }
      case 0x03: { // POP
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        sp--;
        break;
      }
      case 0x04: { // DUP
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        if (sp >= MAX_STACK) { exit = TRAP_OVERFLOW; break; }
        stack[sp] = stack[sp - 1];
        sp++;
        break;
      }
      case 0x05: { // SWAP
        if (sp < 2) { exit = TRAP_UNDERFLOW; break; }
        const t = stack[sp - 1];
        stack[sp - 1] = stack[sp - 2];
        stack[sp - 2] = t;
        break;
      }
      case 0x06: { // OVER
        if (sp < 2) { exit = TRAP_UNDERFLOW; break; }
        if (sp >= MAX_STACK) { exit = TRAP_OVERFLOW; break; }
        stack[sp] = stack[sp - 2];
        sp++;
        break;
      }
      case 0x07: { // ROT: (a b c -- b c a)
        if (sp < 3) { exit = TRAP_UNDERFLOW; break; }
        const a = stack[sp - 3];
        stack[sp - 3] = stack[sp - 2];
        stack[sp - 2] = stack[sp - 1];
        stack[sp - 1] = a;
        break;
      }
      case 0x10: case 0x11: case 0x12: case 0x13: case 0x14:
      case 0x15: case 0x16: case 0x18: case 0x19: case 0x1a:
      case 0x1c: case 0x1d: case 0x1e: case 0x20: case 0x21: case 0x22: {
        // Binary operators: (a b -- r), b is the top.
        if (sp < 2) { exit = TRAP_UNDERFLOW; break; }
        const b = stack[sp - 1];
        const a = stack[sp - 2];
        let r = 0;
        if (op === 0x10) r = (a + b) | 0; // ADD, wraps
        else if (op === 0x11) r = (a - b) | 0; // SUB, wraps
        else if (op === 0x12) r = Math.imul(a, b); // MUL, low 32 bits
        else if (op === 0x13) { // DIV, signed, toward zero
          if (b === 0) { exit = TRAP_DIV_ZERO; break; }
          r = (Math.trunc(a / b)) | 0; // INT_MIN / -1 wraps to INT_MIN
        } else if (op === 0x14) { // MOD, sign of a
          if (b === 0) { exit = TRAP_DIV_ZERO; break; }
          r = (a % b) | 0; // x % -1 is 0
        } else if (op === 0x15) { // DIVU, unsigned
          if (b === 0) { exit = TRAP_DIV_ZERO; break; }
          r = (Math.trunc((a >>> 0) / (b >>> 0))) | 0;
        } else if (op === 0x16) { // MODU, unsigned
          if (b === 0) { exit = TRAP_DIV_ZERO; break; }
          r = ((a >>> 0) % (b >>> 0)) | 0;
        } else if (op === 0x18) r = a & b; // AND
        else if (op === 0x19) r = a | b; // OR
        else if (op === 0x1a) r = a ^ b; // XOR
        else if (op === 0x1c) r = a << (b & 31); // SHL
        else if (op === 0x1d) r = a >> (b & 31); // SHR, arithmetic
        else if (op === 0x1e) r = (a >>> (b & 31)) | 0; // SHRU, logical
        else if (op === 0x20) r = a === b ? 1 : 0; // EQ
        else if (op === 0x21) r = a < b ? 1 : 0; // LT, signed
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0; // LTU, unsigned
        sp--;
        stack[sp - 1] = r;
        break;
      }
      case 0x17: { // NEG, wraps: -(INT_MIN) is INT_MIN
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        stack[sp - 1] = (-stack[sp - 1]) | 0;
        break;
      }
      case 0x1b: { // NOT
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        stack[sp - 1] = ~stack[sp - 1];
        break;
      }
      case 0x30: { // JMP: pc = next + signed offset
        const off = (imm16 << 16) >> 16;
        pc = next + off;
        break;
      }
      case 0x31: { // JZ
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        const v = stack[--sp];
        if (v === 0) pc = next + ((imm16 << 16) >> 16);
        break;
      }
      case 0x32: { // JNZ
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        const v = stack[--sp];
        if (v !== 0) pc = next + ((imm16 << 16) >> 16);
        break;
      }
      case 0x33: { // CALL: unsigned target, push return address
        if (cp >= MAX_CALLS) { exit = TRAP_CALL_OVERFLOW; break; }
        calls[cp++] = next;
        pc = imm16;
        break;
      }
      case 0x34: { // RET
        if (cp < 1) { exit = TRAP_EMPTY_CALL; break; }
        pc = calls[--cp];
        break;
      }
      case 0x40: { // LOAD
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        const addr = stack[sp - 1];
        if (addr < 0 || addr > 255) { exit = TRAP_BAD_ADDR; break; }
        stack[sp - 1] = mem[addr];
        break;
      }
      case 0x41: { // STORE: (v addr --)
        if (sp < 2) { exit = TRAP_UNDERFLOW; break; }
        const addr = stack[sp - 1];
        const v = stack[sp - 2];
        if (addr < 0 || addr > 255) { exit = TRAP_BAD_ADDR; break; }
        mem[addr] = v;
        sp -= 2;
        break;
      }
      case 0x50: { // PRINT: decimal ASCII, no newline
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        const v = stack[--sp];
        const s = String(v);
        // Write the decimal digits straight into the output buffer instead
        // of allocating a throwaway Buffer per PRINT.
        if (outLen + s.length > MAX_OUT) { exit = TRAP_OUTPUT; break; }
        for (let i = 0; i < s.length; i++) out[outLen++] = s.charCodeAt(i);
        break;
      }
      case 0x51: { // PUTC: one byte, v AND 255
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        const v = stack[--sp];
        if (!emit([v & 255], 1)) { exit = TRAP_OUTPUT; break; }
        break;
      }
      case 0x52: { // IN: next input byte, or -1 when used up
        if (sp >= MAX_STACK) { exit = TRAP_OVERFLOW; break; }
        stack[sp++] = inPos < input.length ? input[inPos++] : -1;
        break;
      }
      case 0x53: { // EXIT: code v AND 255
        if (sp < 1) { exit = TRAP_UNDERFLOW; break; }
        const v = stack[--sp];
        return { out: out.subarray(0, outLen), exit: v & 255 };
      }
    }
    // A trap set `exit` inside the switch: stop at once, keeping the
    // output written before the trapping instruction. (HALT returns
    // directly above, so reaching here with exit !== 0 always means a trap.)
    if (exit !== 0) break;
  }
  return { out: out.subarray(0, outLen), exit };
}

for (const id of readdirSync(IN_DIR).sort()) {
  const dir = join(IN_DIR, id);
  const program = readFileSync(join(dir, 'program.bin'));
  const input = existsSync(join(dir, 'input.bin')) ? readFileSync(join(dir, 'input.bin')) : Buffer.alloc(0);
  const { out, exit } = run(program, input);
  const outDir = join(OUT_DIR, id);
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, 'stdout.bin'), out);
  writeFileSync(join(outDir, 'exit.txt'), String(exit) + '\n');
}
