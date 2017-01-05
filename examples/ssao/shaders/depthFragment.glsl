#ifdef GL_ES
precision highp float;
#endif

uniform float uNear;
uniform float uFar;

varying vec4 vViewVertex;

vec4 encodeFloatRGBA( float v ) {
   vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;
   enc = fract(enc);
   enc -= enc.yzww * vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);
   return enc;
}

float zLinear() {
   float d = gl_FragCoord.z;

   //return (uNear * uFar) / (d * (uNear - uFar) + uFar);
   return d;
}

void main( void ) {
   //gl_FragColor.r = (-vViewVertex.z * vViewVertex.w - uNear) / (uFar - uNear);
   //gl_FragColor.r = zLinear();
   float zLinear = zLinear();
   //gl_FragColor = encodeFloatRGBA(zLinear);
   gl_FragColor = encodeFloatRGBA((-vViewVertex.z * vViewVertex.w - uNear) / (uFar - uNear));
}