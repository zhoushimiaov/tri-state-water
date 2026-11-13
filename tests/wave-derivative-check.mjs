// Mathematical regression checks for GLSL wave normals.
// Independent finite differences catch incorrect derivatives before shader rendering.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const html = readFileSync('index.html', 'utf8');
assert.ok(html.includes('float front = r - age * 2.55;'), 'Ripple wavefront formula changed unexpectedly');
assert.ok(html.includes('float dEnv_dr = env * (-0.14 - 7.0 * front);'), 'Ripple envelope derivative regressed');
assert.ok(html.includes('float dWave_dr = dEnv_dr * s + env * 8.0 * c;'), 'Ripple wave derivative regressed');
assert.ok(html.includes('float dAtten_dDist = -0.024 * dist * atten * atten;'), 'Distance attenuation derivative missing');
assert.ok(html.includes('vec2 finalGrad = rawGrad * atten + rawH * dAtten_dDist * dDist_dp + ripGrad + boilGrad;'), 'Distance attenuation product rule missing');
assert.ok(html.includes("var qualityMode = (requestedQuality === 'low' || requestedQuality === 'high') ? requestedQuality : 'auto';"), 'Quality mode pinning missing');
assert.ok(html.includes('const steam = ssj(92, 138, t);'), 'Steam phase onset changed unexpectedly');

const eps = 1e-5;
const fd = (f, x, z) => [
  (f(x+eps,z) - f(x-eps,z))/(2*eps),
  (f(x,z+eps) - f(x,z-eps))/(2*eps)
];
const near = (actual, expected, label, tol=1e-5) => assert.ok(Math.abs(actual-expected) < tol,
  `${label}: expected ${expected}, got ${actual}`);
function ripple(x,z,age,strength) {
  const r = Math.hypot(x,z);
  const front = r-age*2.55;
  const env = strength*Math.exp(-0.62*age)*Math.exp(-0.14*r)*Math.exp(-3.5*front*front);
  const phase = 8.0*front;
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const h = env*s;
  const dEnv_dr = env*(-0.14-7.0*front);
  const dWave_dr = dEnv_dr*s+env*8.0*c;
  const dir = r>1e-4 ? [x/r, z/r] : [0, 0];
  return {h, g:[dWave_dr*dir[0], dWave_dr*dir[1]]};
}
for(const [x,z,age,strength] of [[1.3,.4,.2,.6],[-.3,2.1,.9,.5],[1.2,-1.9,1.0,.4]]) {
  const analytic=ripple(x,z,age,strength).g;
  const numeric=fd((a,b)=>ripple(a,b,age,strength).h,x,z);
  near(analytic[0],numeric[0], 'ripple dx'); near(analytic[1],numeric[1],'ripple dz');
}
function wave(x,z,amp) {
  const theta = x*1.7+z*.6;
  const height = .11*Math.sin(theta);
  const gradient = [.11*1.7*Math.cos(theta),.11*.6*Math.cos(theta)];
  const dist=Math.hypot(x,z);
  const atten=1/(1+0.012*dist*dist);
  const dAtten_dDist=-0.024*dist*atten*atten;
  const dDist_dp=dist>1e-4?[x/dist,z/dist]:[0,0];
  const rawH=amp*height;
  const rawGrad=[amp*gradient[0],amp*gradient[1]];
  return {h:rawH*atten,
    g:[rawGrad[0]*atten+rawH*dAtten_dDist*dDist_dp[0],
       rawGrad[1]*atten+rawH*dAtten_dDist*dDist_dp[1]]};
}
for(const [x,z] of [[3,2],[12.8,4.1],[21,1],[29.2,3],[-15,14]]) {
  const analytic=wave(x,z,.83).g;
  const numeric=fd((a,b)=>wave(a,b,.83).h,x,z);
  near(analytic[0],numeric[0],'distance atten dx'); near(analytic[1],numeric[1],'distance atten dz');
}
console.log('Wave normal finite-difference regression passed.');
