#ifdef GL_ES
precision highp float;
#endif

//#define GL_OES_standard_derivatives 1
#extension GL_OES_standard_derivatives : enable

#define NUMBER_SAMPLES 10

/**
 * Contains information to compute
 * the point in camera space
 * -2.0f / (width*P[0][0])
 * -2.0f / (height*P[1][1])
 * (1.0f - P[0][2]) / P[0][0]
 * (1.0f + P[1][2]) / P[1][1])
 */
uniform vec4 uProjectionInfo;
uniform vec2 uViewport;

uniform sampler2D uDepthTexture;

varying vec2 vTexCoord;

float decodeFloatRGBA( vec4 rgba ) {
   return dot( rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0) );
}

float zValueFromFragPosition() {

    float x = gl_FragCoord.x / uViewport.x;
    float y = gl_FragCoord.y / uViewport.y;

    vec2 texCoord = vec2(x, y);
    return decodeFloatRGBA( texture2D(uDepthTexture, texCoord).rgba);
}

// Computes camera-space position of fragment
vec3 reconstructPosition(vec2 screenSpacePx) {

    float z = zValueFromFragPosition();
    vec2 pixelPosHalf = screenSpacePx + vec2(0.5);

    return vec3((pixelPosHalf.xy + uProjectionInfo.xy + uProjectionInfo.zw) * z, z);
}

vec3 reconstructNormal(vec3 c) {
    return normalize(cross(dFdx(c), dFdy(c)));
}

void main( void ) {
    //float z = decodeFloatRGBA( texture2D(uDepthTexture, vTexCoord).rgba);
    vec3 cameraSpacePosition = reconstructPosition(gl_FragCoord.xy);
    vec3 normal = reconstructNormal(cameraSpacePosition);

    // TODO: Use random function
    //float randomAngle = (3 * ssC.x ^ ssC.y + ssC.x * ssC.y) * 10;

    /*float value = 0.0;
    for (int i = 0; i < NUMBER_SAMPLES; ++i) {

    }*/

    //gl_FragColor = vec4(normal.xyz, 1.0);
    gl_FragColor = vec4(cameraSpacePosition, 1.0);
}