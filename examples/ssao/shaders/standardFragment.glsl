#ifdef GL_ES
precision highp float;
#endif

uniform ivec2 uViewport;
uniform sampler2D uAoTexture;

uniform vec4 uSceneColor;
uniform int uAoFactor;

// DEBUG
uniform ivec4 uDebug;
// END DEBUG

float decodeFloatRGBA( vec4 rgba ) {
    return dot( rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0) );
}

float fetchTextureValue(vec2 ssPosition) {
    vec2 texCoord = ssPosition / vec2(uViewport);
    //return decodeFloatRGBA(texture2D(uDepthTexture, texCoord).rgba);
    return texture2D(uAoTexture, texCoord).r;
}

void main( void ) {
	float z = (uAoFactor != 0) ? fetchTextureValue(gl_FragCoord.xy) : 1.0;

	gl_FragColor = vec4(uSceneColor.xyz * z, 1.0);

	if (uDebug.x == 1 || uDebug.y == 1)
		gl_FragColor = vec4(texture2D(uAoTexture, gl_FragCoord.xy / vec2(uViewport)).xyz, 1.0);
	if (uDebug.z == 1 || uDebug.w == 1)
		gl_FragColor = vec4(vec3(fetchTextureValue(gl_FragCoord.xy)), 1.0);
}