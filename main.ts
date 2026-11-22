// Tiny stack VM: interpreter for make.fun's tiny stack ISA v1.
// Reads /input/<id>/program.bin + input.bin, writes /output/<id>/stdout.bin
// and /output/<id>/exit.txt for every instance. Node 22, stdlib only,
// deterministic: no clock, no network, no environment-dependent behaviour.
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
const I = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const O = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
function run(p, q) {
  const m = new Int32Array(256), s = new Int32Array(256), c = new Int32Array(64);
  const pl = p.length;
  let sp = 0, cp = 0, pc = 0, n = 0, ip = 0, ol = 0;
  const o = Buffer.alloc(65536);
  const T = e => { throw e };
  const need = k => { if (sp < k) T(2) };
  const push = v => { if (sp >= 256) T(3); s[sp++] = v | 0 };
  const pop = () => { need(1); return s[--sp] };
  try {
    for (;;) {
      if (n >= 1e6) T(10);
      if (pc < 0 || pc >= pl) T(9);
      const op = p[pc];
      let L = 1, im = 0;
      if (op === 1) { L = 2; im = p[pc + 1]; }
      else if (op === 2) { L = 5; im = p[pc + 1] | p[pc + 2] << 8 | p[pc + 3] << 16 | p[pc + 4] << 24; }
      else if (op >= 48 && op <= 51) { L = 3; im = p[pc + 1] | p[pc + 2] << 8; }
      else if (!((op <= 7) || (op >= 16 && op <= 34) || op === 52 || (op >= 64 && op <= 65) || (op >= 80 && op <= 83))) T(5);
      if (pc + L > pl) T(9);
      n++;
      const nx = pc + L;
      pc = nx;
      if (op === 0) return { out: o.subarray(0, ol), exit: 0 };
      else if (op === 1) push((im << 24) >> 24);
      else if (op === 2) push(im);
      else if (op === 3) pop();
      else if (op === 4) { need(1); push(s[sp - 1]); }
      else if (op === 5) { need(2); const t = s[sp - 1]; s[sp - 1] = s[sp - 2]; s[sp - 2] = t; }
      else if (op === 6) { need(2); push(s[sp - 2]); }
      else if (op === 7) { need(3); const t = s[sp - 3]; s[sp - 3] = s[sp - 2]; s[sp - 2] = s[sp - 1]; s[sp - 1] = t; }
      else if (op === 23) { need(1); s[sp - 1] = (-s[sp - 1]) | 0; }
      else if (op === 27) { need(1); s[sp - 1] = ~s[sp - 1]; }
      else if ((op >= 16 && op <= 22) || (op >= 24 && op <= 26) || (op >= 28 && op <= 30) || (op >= 32 && op <= 34)) {
        need(2);
        const b = s[--sp], a = s[sp - 1];
        let r;
        if (op === 16) r = (a + b) | 0;
        else if (op === 17) r = (a - b) | 0;
        else if (op === 18) r = Math.imul(a, b);
        else if (op === 19) { if (!b) T(4); r = Math.trunc(a / b) | 0; }
        else if (op === 20) { if (!b) T(4); r = (a % b) | 0; }
        else if (op === 21) { if (!b) T(4); r = Math.trunc((a >>> 0) / (b >>> 0)) | 0; }
        else if (op === 22) { if (!b) T(4); r = ((a >>> 0) % (b >>> 0)) | 0; }
        else if (op === 24) r = a & b;
        else if (op === 25) r = a | b;
        else if (op === 26) r = a ^ b;
        else if (op === 28) r = a << (b & 31);
        else if (op === 29) r = a >> (b & 31);
        else if (op === 30) r = (a >>> (b & 31)) | 0;
        else if (op === 32) r = a === b ? 1 : 0;
        else if (op === 33) r = a < b ? 1 : 0;
        else r = (a >>> 0) < (b >>> 0) ? 1 : 0;
        s[sp - 1] = r;
      }
      else if (op === 48) pc = nx + ((im << 16) >> 16);
      else if (op === 49) { const v = pop(); if (v === 0) pc = nx + ((im << 16) >> 16); }
      else if (op === 50) { const v = pop(); if (v !== 0) pc = nx + ((im << 16) >> 16); }
      else if (op === 51) { if (cp >= 64) T(7); c[cp++] = nx; pc = im; }
      else if (op === 52) { if (cp < 1) T(8); pc = c[--cp]; }
      else if (op === 64) { need(1); const a = s[sp - 1]; if (a < 0 || a > 255) T(6); s[sp - 1] = m[a]; }
      else if (op === 65) { need(2); const a = s[sp - 1], v = s[sp - 2]; if (a < 0 || a > 255) T(6); m[a] = v; sp -= 2; }
      else if (op === 80) {
        const v = pop(), t = String(v);
        if (ol + t.length > 65536) T(11);
        for (let i = 0; i < t.length; i++) o[ol++] = t.charCodeAt(i);
      }
      else if (op === 81) { const v = pop(); if (ol + 1 > 65536) T(11); o[ol++] = v & 255; }
      else if (op === 82) push(ip < q.length ? q[ip++] : -1);
      else if (op === 83) { const v = pop(); return { out: o.subarray(0, ol), exit: v & 255 }; }
    }
  } catch (e) {
    return { out: o.subarray(0, ol), exit: e };
  }
}
for (const id of readdirSync(I).sort()) {
  const d = join(I, id);
  const p = readFileSync(join(d, 'program.bin'));
  const q = existsSync(join(d, 'input.bin')) ? readFileSync(join(d, 'input.bin')) : Buffer.alloc(0);
  const r = run(p, q);
  const od = join(O, id);
  mkdirSync(od, { recursive: true });
  writeFileSync(join(od, 'stdout.bin'), r.out);
  writeFileSync(join(od, 'exit.txt'), String(r.exit) + '\n');
}
