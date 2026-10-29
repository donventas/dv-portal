const {test}=require('node:test'),assert=require('node:assert/strict');
const {frame}=require('../app/don-presence.js');
test('wrist pilot returns exact endpoints and never changes head, torso or feet',()=>{
 const w=256,h=384,source=Uint8ClampedArray.from({length:w*h*4},(_,i)=>(i*13+Math.floor(i/1024)*19)%256);
 assert.deepEqual(frame(source,w,h,0),source);assert.deepEqual(frame(source,w,h,1),source);
 let changed=0;
 for(let n=0;n<=60;n++){
  const output=frame(source,w,h,n/60);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)for(let c=0;c<4;c++){
   const i=(y*w+x)*4+c;
   if(x<7||x>=81||y<110||y>=200)assert.equal(output[i],source[i]);
   else if(output[i]!==source[i])changed++;
  }
 }
 assert.ok(changed>0);
});
