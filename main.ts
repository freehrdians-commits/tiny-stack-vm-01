// Tiny stack VM for make.fun's tiny stack ISA v1: runs /input/<id>/program.bin
// on input.bin, writes /output/<id>/stdout.bin and exit.txt. Node 22, stdlib only.
// Deterministic: no clock, no network, no randomness. Traps are thrown as their
// exit code and caught at the end of run(); HALT/EXIT return normally.
import{mkdirSync,readdirSync,readFileSync,writeFileSync}from'node:fs';
import{join}from'node:path';
const I=process.env.MAKEFUN_INPUT_DIR??'/input',O=process.env.MAKEFUN_OUTPUT_DIR??'/output';
for(const d of readdirSync(I).sort()){
 const p=readFileSync(join(I,d,'program.bin')),n=readFileSync(join(I,d,'input.bin')),[b,e]=run(p,n);
 mkdirSync(join(O,d),{recursive:true});
 writeFileSync(join(O,d,'stdout.bin'),Buffer.from(b));
 writeFileSync(join(O,d,'exit.txt'),e+'\n');
}
function run(p,n){
 const s=new Int32Array(256),m=new Int32Array(256),c=new Int32Array(64);
 let sp=0,cp=0,pc=0,t=0,i=0;const o=[];
 const off=()=>{if(pc+2>p.length)throw 9;let v=p[pc]|p[pc+1]<<8;pc+=2;return v>=32768?v-65536:v};
 try{for(;;){
  if(t>=1e6)throw 10;
  if(pc<0||pc>=p.length)throw 9;
  const k=p[pc++];t++;
  switch(k){
   case 0:return[o,0];
   case 1:if(pc+1>p.length)throw 9;if(sp>=256)throw 3;{const v=p[pc++];s[sp++]=v>127?v-256:v;break;}
   case 2:if(pc+4>p.length)throw 9;if(sp>=256)throw 3;s[sp++]=p[pc]|p[pc+1]<<8|p[pc+2]<<16|p[pc+3]<<24;pc+=4;break;
   case 3:if(sp<1)throw 2;sp--;break;
   case 4:if(sp<1)throw 2;if(sp>=256)throw 3;s[sp]=s[sp-1];sp++;break;
   case 5:if(sp<2)throw 2;{const v=s[sp-1];s[sp-1]=s[sp-2];s[sp-2]=v;break;}
   case 6:if(sp<2)throw 2;if(sp>=256)throw 3;s[sp]=s[sp-2];sp++;break;
   case 7:if(sp<3)throw 2;{const v=s[sp-3];s[sp-3]=s[sp-2];s[sp-2]=s[sp-1];s[sp-1]=v;break;}
   case 16:if(sp<2)throw 2;s[sp-2]=(s[sp-2]+s[sp-1])|0;sp--;break;
   case 17:if(sp<2)throw 2;s[sp-2]=(s[sp-2]-s[sp-1])|0;sp--;break;
   case 18:if(sp<2)throw 2;s[sp-2]=Math.imul(s[sp-2],s[sp-1]);sp--;break;
   case 19:if(sp<2)throw 2;if(!s[sp-1])throw 4;s[sp-2]=Math.trunc(s[sp-2]/s[sp-1])|0;sp--;break;
   case 20:if(sp<2)throw 2;if(!s[sp-1])throw 4;s[sp-2]=(s[sp-2]%s[sp-1])|0;sp--;break;
   case 21:if(sp<2)throw 2;if(!s[sp-1])throw 4;s[sp-2]=Math.floor((s[sp-2]>>>0)/(s[sp-1]>>>0))|0;sp--;break;
   case 22:if(sp<2)throw 2;if(!s[sp-1])throw 4;s[sp-2]=((s[sp-2]>>>0)%(s[sp-1]>>>0))|0;sp--;break;
   case 23:if(sp<1)throw 2;s[sp-1]=(-s[sp-1])|0;break;
   case 24:if(sp<2)throw 2;s[sp-2]&=s[sp-1];sp--;break;
   case 25:if(sp<2)throw 2;s[sp-2]|=s[sp-1];sp--;break;
   case 26:if(sp<2)throw 2;s[sp-2]^=s[sp-1];sp--;break;
   case 27:if(sp<1)throw 2;s[sp-1]=~s[sp-1];break;
   case 28:if(sp<2)throw 2;s[sp-2]<<=s[sp-1]&31;sp--;break;
   case 29:if(sp<2)throw 2;s[sp-2]>>=s[sp-1]&31;sp--;break;
   case 30:if(sp<2)throw 2;s[sp-2]=(s[sp-2]>>>(s[sp-1]&31))|0;sp--;break;
   case 32:if(sp<2)throw 2;s[sp-2]=s[sp-2]===s[sp-1]?1:0;sp--;break;
   case 33:if(sp<2)throw 2;s[sp-2]=s[sp-2]<s[sp-1]?1:0;sp--;break;
   case 34:if(sp<2)throw 2;s[sp-2]=(s[sp-2]>>>0)<(s[sp-1]>>>0)?1:0;sp--;break;
   case 48:{const j=off();pc+=j;break;}
   case 49:{const j=off();if(sp<1)throw 2;if(s[--sp]===0)pc+=j;break;}
   case 50:{const j=off();if(sp<1)throw 2;if(s[--sp]!==0)pc+=j;break;}
   case 51:if(pc+2>p.length)throw 9;if(cp>=64)throw 7;c[cp++]=pc+2;pc=p[pc]|p[pc+1]<<8;break;
   case 52:if(!cp)throw 8;pc=c[--cp];break;
   case 64:if(sp<1)throw 2;{const a=s[sp-1];if(a<0||a>255)throw 6;s[sp-1]=m[a];break;}
   case 65:if(sp<2)throw 2;{const a=s[sp-1];if(a<0||a>255)throw 6;m[a]=s[sp-2];sp-=2;break;}
   case 80:{if(sp<1)throw 2;const v=String(s[--sp]);if(o.length+v.length>65536)throw 11;for(let j=0;j<v.length;j++)o.push(v.charCodeAt(j));break;}
   case 81:if(sp<1)throw 2;if(o.length>=65536)throw 11;o.push(s[--sp]&255);break;
   case 82:if(sp>=256)throw 3;s[sp++]=i<n.length?n[i++]:-1;break;
   case 83:if(sp<1)throw 2;return[o,s[--sp]&255];
   default:throw 5;
  }
 }}catch(e){return[o,typeof e==='number'?e:1]}
}
