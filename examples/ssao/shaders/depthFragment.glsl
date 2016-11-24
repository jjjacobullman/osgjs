#ifdef GL_ES
precision highp float;
#endif

vec4 encodeFloatRGBA( float v ) {
   vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;
   enc = fract(enc);
   enc -= enc.yzww * vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);
   return enc;
}

void main( void ) {
   float z = gl_FragCoord.z;
   gl_FragColor = encodeFloatRGBA(z);
}