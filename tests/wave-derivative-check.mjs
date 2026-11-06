// Mathematical regression checks for GLSL wave normals.
// Independent finite differences catch incorrect derivatives before shader rendering.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
assert.ok(html.includes('float dhdd = env*(-7.0*front*cos(front*8.0) - 8.0*sin(front*8.0));'), 'Ripple derivative regressed');
assert.ok(html.includes('grad = uWaveAmp * (grad*farFade + h*fadeGradient);'), 'Horizon fade chain rule missing');
assert.ok(html.includes("if (qualityMode !== 'auto') return;"), 'Explicit quality mode should not be dynamically overridden');
assert.ok(html.includes("const steam = ssj(92, 108, t)"), 'Steam phase onset changed unexpectedly');

const eps = 1e-5;
const fd = (f, x, z) => [
  (f(x+eps,z) - f(x-eps,z))/(2*eps),
  (f(x,z+eps) - f(x,z-eps))/(2*eps)
];
const near = (actual, expected, label, tol=1e-5) => assert.ok(Math.abs(actual-expected) < tol,
  `${label}: expected ${expected}, got ${actual}`);
function ripple(x,z,age,strength) {
  const d = Math.max(Math.hypot(x,z),1e-4);
  const front = d-age*2.2;
  const env = Math.exp(-front*front*3.5)*Math.exp(-age*1.3)*strength;
  const h = env*Math.cos(front*8.0);
  const dhdd = env*(-7.0*front*Math.cos(front*8.0)-8.0*Math.sin(front*8.0));
  return {h, g:[dhdd*x/d, dhdd*z/d]};
}
for(const [x,z,age,strength] of [[1.3,.4,.2,.6],[-.3,2.1,.9,.5],[1.2,-1.9,1.0,.4]]) {
  const analytic=ripple(x,z,age,strength).g;
  const numeric=fd((a,b)=>ripple(a,b,age,strength).h,x,z);
  near(analytic[0],numeric[0], 'ripple dx'); near(analytic[1],numeric[1],'ripple dz');
}
function wave(x,z,uCamX,uCamZ,amp) {
  const theta = x*1.7+z*.6;
  const height = .11*Math.sin(theta);
  const gradient = [.11*1.7*Math.cos(theta),.11*.6*Math.cos(theta)];
  const dx=x-uCamX,dz=z-uCamZ,farDistance=Math.hypot(dx,dz);
  const fadeT=Math.max(0,Math.min(1,(farDistance-12)/17));
  const fade=1-.86*(fadeT*fadeT*(3-2*fadeT));
  const slope=-.86*(6*fadeT*(1-fadeT))/17;
  const fadeGradient=[slope*dx/Math.max(farDistance,1e-4),slope*dz/Math.max(farDistance,1e-4)];
  return {h:height*amp*fade,
    g:[amp*(gradient[0]*fade+height*fadeGradient[0]),
       amp*(gradient[1]*fade+height*fadeGradient[1])]};
}
for(const [x,z] of [[3,2],[12.8,4.1],[21,1],[29.2,3],[-15,14]]) {
  const analytic=wave(x,z,0,0,.83).g;
  const numeric=fd((a,b)=>wave(a,b,0,0,.83).h,x,z);
  near(analytic[0],numeric[0],'distance fade dx'); near(analytic[1],numeric[1],'distance fade dz');
}
console.log('Wave normal finite-difference regression passed.');
