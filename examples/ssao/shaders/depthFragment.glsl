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

void main( void ) {
   
   float d = gl_FragCoord.z;

   // Converts depth value to camera space
   //float zC = uC.x / (d * uC.y + uC.z);

   // DEBUG
   /*if (uC.z >= 40.0)
      gl_FragColor.r = 1.0;
   else
     gl_FragColor.r = zC;*/
   // END DEBUG

	//gl_FragColor = encodeFloatRGBA(zC);
	//gl_FragColor = encodeFloatRGBA(d);
   //gl_FragColor.r = zC;
   //gl_FragColor.r = d;
   //gl_FragColor.r = d;
   gl_FragColor.r = (-vViewVertex.z * vViewVertex.w - uNear) / (uFar - uNear);
}