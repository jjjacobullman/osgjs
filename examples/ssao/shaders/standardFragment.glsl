#ifdef GL_ES
precision highp float;
#endif

uniform vec2 RenderSize;
uniform sampler2D uAoTexture;

uniform vec4 uSceneColor;
uniform int uAoFactor;

varying vec2 vTexCoord0;

float fetchTextureValue(vec2 ssPosition) {
    //vec2 texCoord = ssPosition / (2.0 * vec2(RenderSize));
    //return texture2D(uAoTexture, texCoord).r;
    return texture2D(uAoTexture, vTexCoord0).r;
}

void main( void ) {
	float z = (uAoFactor != 0) ? fetchTextureValue(gl_FragCoord.xy) : 1.0;
	//gl_FragColor = vec4(uSceneColor.xyz * z, 1.0);
}