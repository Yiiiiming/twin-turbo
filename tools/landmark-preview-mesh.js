/** Isolated inspection geometry. Uses the production 11-float vertex layout. */
export function previewMesh(gl, draw) {
  const data = [], rgba = color => Array.isArray(color) ? color.length === 4 ? color : [...color, 1]
    : [...color.slice(1).match(/../g).map(v => parseInt(v, 16) / 255), 1];
  const mesh = { colliders: null,
    triangle(a,b,c,color,emission=0,normal) {
      if(!normal){const u=b.map((v,i)=>v-a[i]),v=c.map((n,i)=>n-a[i]);normal=[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]];const n=Math.hypot(...normal)||1;normal=normal.map(v=>v/n);}
      for(const vertex of [a,b,c])data.push(...vertex,...normal,...rgba(color),emission);
    },
    quad(a,b,c,d,color,emission=0,normal){this.triangle(a,b,c,color,emission,normal);this.triangle(a,c,d,color,emission,normal);},
    box(x,y,z,w,h,d,color,angle=0,emission=0){
      const p=(a,b,c)=>[x+Math.cos(angle)*a-Math.sin(angle)*c,y+b,z+Math.sin(angle)*a+Math.cos(angle)*c];
      const v=[p(-w/2,-h/2,-d/2),p(w/2,-h/2,-d/2),p(w/2,h/2,-d/2),p(-w/2,h/2,-d/2),p(-w/2,-h/2,d/2),p(w/2,-h/2,d/2),p(w/2,h/2,d/2),p(-w/2,h/2,d/2)];
      for(const [a,b,c,d]of[[0,3,2,1],[4,5,6,7],[0,4,7,3],[1,2,6,5],[3,7,6,2],[0,1,5,4]])this.quad(v[a],v[b],v[c],v[d],color,emission);
    },
    cone(x,y,z,r,h,color,sides=12,top=0,phase=0){for(let i=0;i<sides;i++){const a=phase+i/sides*Math.PI*2,b=phase+(i+1)/sides*Math.PI*2,p=[x+Math.cos(a)*r,y,z+Math.sin(a)*r],q=[x+Math.cos(b)*r,y,z+Math.sin(b)*r],t=[x+Math.cos(a)*top,y+h,z+Math.sin(a)*top],u=[x+Math.cos(b)*top,y+h,z+Math.sin(b)*top];if(top)this.quad(p,t,u,q,color);else this.triangle(p,t,q,color);}},
    disk(x,y,z,rx,rz,color,sides=32,angle=0){const p=a=>[x+Math.cos(a)*rx*Math.cos(angle)-Math.sin(a)*rz*Math.sin(angle),y,z+Math.cos(a)*rx*Math.sin(angle)+Math.sin(a)*rz*Math.cos(angle)];for(let i=0;i<sides;i++)this.triangle([x,y,z],p(i/sides*Math.PI*2),p((i+1)/sides*Math.PI*2),color,0,[0,1,0]);},
  };
  draw(mesh);const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(data),gl.STATIC_DRAW);
  return {buffer,count:data.length/11};
}
