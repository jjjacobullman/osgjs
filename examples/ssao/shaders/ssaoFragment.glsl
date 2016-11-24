#ifdef GL_ES
precision highp float;
#endif

uniform vec2 uViewport;
uniform sampler2D uDepthTexture;

varying vec2 vTexCoord;

float decodeFloatRGBA( vec4 rgba ) {
   return dot( rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0) );
}

vec2 computeScreenPos() {

    float x = gl_FragCoord.x / uViewport.x;
    float y = gl_FragCoord.y / uViewport.y;

    return vec2(x, y);
}

void main( void ) {
    vec2 p = computeScreenPos();
    //float z = decodeFloatRGBA( texture2D(uDepthTexture, vTexCoord).rgba);
    float z = decodeFloatRGBA( texture2D(uDepthTexture, p).rgba);
    gl_FragColor = vec4(z, z, z, 1.0);
    /*if (uViewport.x > 1000.0)
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    else
        gl_FragColor = vec4(0.0, 1.0, 0.0, 1.0);*/
    //gl_FragColor = vec4(0.8, 0.8, 0.8, 1.0);
}