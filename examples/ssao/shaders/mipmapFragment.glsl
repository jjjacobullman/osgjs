#ifdef GL_ES
precision highp float;
#endif

#define MAX_MIP_LVL 4

uniform sampler2D uDepthTexture;

uniform vec2 RenderSize;
uniform vec2 uViewport;

vec4 zValueFromScreenSpacePosition(vec2 ssPosition) {
    vec2 texCoord = (ssPosition + vec2(0.25)) / RenderSize;
    return texture2D(uDepthTexture, texCoord);
}

vec4 encodeFloatRGBA( float v ) {
   vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;
   enc = fract(enc);
   enc -= enc.yzww * vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);
   return enc;
}

void main() {

	ivec2 ssP = ivec2(gl_FragCoord.xy);

	if (gl_FragCoord.y < uViewport.y)
		gl_FragColor = zValueFromScreenSpacePosition(gl_FragCoord.xy);
	else
		gl_FragColor = vec4(vec3(0.0), 1.0);

	//float fetch = texture2D();

	/*if (gl_FragCoord.y < RenderSize.y)*/
	//gl_FragColor.r = texelFetch(CSZ_buffer, clamp(ssP * 2 + ivec2(ssP.y & 1, ssP.x & 1), ivec2(0), textureSize(CSZ_buffer, previousMIPNumber) - ivec2(1)), previousMIPNumber).mask;
}