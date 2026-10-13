/** London-only surface joinery. Thin decorative boxes keep their two broad
 * faces, with exactly the same extent and depth separation. Slender rods keep
 * all four long faces, so window mullions remain visible from every façade.
 * Solid bodies always use the original builder and its collision collection.
 */
export function londonDetailMesh(mesh) {
 return {
  get colliders(){return mesh.colliders;},
  set colliders(value){mesh.colliders=value;},
  triangle:(...a)=>mesh.triangle(...a),quad:(...a)=>mesh.quad(...a),
  cone:(...a)=>mesh.cone(...a),disk:(...a)=>mesh.disk(...a),
  box(x,y,z,w,h,d,color,angle=0,glow=0){
   const sizes=[w,h,d],thin=Math.min(...sizes),axis=sizes.indexOf(thin);
   if(mesh.colliders!==null||thin>1.6||Math.max(...sizes)<thin*3){mesh.box(x,y,z,w,h,d,color,angle,glow);return;}
   const c=Math.cos(angle),s=Math.sin(angle),p=(a,b,e)=>[x+c*a-s*e,y+b,z+s*a+c*e];
   const xx=w/2,yy=h/2,zz=d/2;
   const v=[p(-xx,-yy,-zz),p(xx,-yy,-zz),p(xx,yy,-zz),p(-xx,yy,-zz),p(-xx,-yy,zz),p(xx,-yy,zz),p(xx,yy,zz),p(-xx,yy,zz)];
   const pairs=[[[0,4,7,3],[1,2,6,5]],[[3,7,6,2],[0,1,5,4]],[[0,3,2,1],[4,5,6,7]]];
   const rod=[...sizes].sort((a,b)=>a-b)[1]<thin*3,longAxis=sizes.indexOf(Math.max(...sizes));
   const faces=rod?pairs.filter((_,i)=>i!==longAxis).flat():pairs[axis];
   for(const ids of faces)mesh.quad(...ids.map(i=>v[i]),color,glow);
  },
 };
}
