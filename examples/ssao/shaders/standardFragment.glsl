#ifdef GL_ES
precision highp float;
#endif

uniform vec2 uViewport;
uniform sampler2D uAoTexture;

uniform vec4 uSceneColor;
uniform float uAoFactor;

float decodeFloatRGBA( vec4 rgba ) {
    return dot( rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0) );
}

float fetchTextureValue(vec2 ssPosition) {

    float x = ssPosition.x / uViewport.x;
    float y = ssPosition.y / uViewport.y;

    vec2 texCoord = vec2(x, y);
    //return decodeFloatRGBA(texture2D(uDepthTexture, texCoord).rgba);
    return texture2D(uAoTexture, texCoord).r;
}

void main( void ) {
	float z = (uAoFactor > 0.0) ? uAoFactor * fetchTextureValue(gl_FragCoord.xy) : 1.0;

	gl_FragColor = vec4(uSceneColor.xyz * z, 1.0);
}