#ifdef GL_ES
precision highp float;
#endif

#extension GL_OES_standard_derivatives : enable

#define MOD2 vec2(443.8975,397.2973)

// Defines used to approximate the occlusion
//#define NB_SAMPLES 11
#define NB_SAMPLES 32
#define NB_SPIRAL_TURNS 10.0
#define EPSILON 0.01

#define FAR_PLANE_Z (-300.0)

uniform vec2 uViewport;

/**
 * Contains information to compute
 * the point in camera space
 * -2.0f / (width*P[0][0])
 * -2.0f / (height*P[1][1])
 * (1.0f - P[0][2]) / P[0][0]
 * (1.0f + P[1][2]) / P[1][1])
 */
uniform vec4 uProjectionInfo;

//uniform vec3 uC;
uniform float uRadius;
uniform float uIntensityDivRadius6;
uniform float uBias;

uniform sampler2D uDepthTexture;

varying vec2 vTexCoord;
varying vec3 vNormal;

float radius2 = uRadius * uRadius;

//note: normalized uniform random, [0;1[
//  2 out, 1 in...
float hash21(const in vec2 p)
{
    vec2 p2 = fract(p * MOD2);
    p2 += dot(p2.yx, p2.xy+19.19);
    return fract(p2.x * p2.y);
}

float decodeFloatRGBA( vec4 rgba ) {
   return dot( rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0) );
}

vec4 encodeFloatRGBA( float v ) {
   vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;
   enc = fract(enc);
   enc -= enc.yzww * vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);
   return enc;
}

float zValueFromScreenSpacePosition(vec2 ssPosition) {

    float x = ssPosition.x / uViewport.x;
    float y = ssPosition.y / uViewport.y;

    vec2 texCoord = vec2(x, y);
    /*float d = decodeFloatRGBA( texture2D(uDepthTexture, texCoord).rgba);
    return uC.x / (d * uC.y + uC.z);*/
    return texture2D(uDepthTexture, texCoord).r;
}

// Computes camera-space position of fragment
vec3 reconstructPosition(vec2 screenSpacePx) {

    float z = zValueFromScreenSpacePosition(screenSpacePx);
    vec2 pixelPosHalf = screenSpacePx + vec2(0.5);

    return vec3((pixelPosHalf.xy * uProjectionInfo.xy + uProjectionInfo.zw) * z, z);

}

vec3 reconstructNormal(vec3 c) {
    return normalize(cross(dFdy(c), dFdx(c)));
}

vec2 computeOffsetUnitVec(int sampleNumber, float randomAngle, out float screenSpaceRadius) {

    float alpha = (float(sampleNumber) + 0.5) * (1.0 / float(NB_SAMPLES));
    float angle = alpha * (NB_SPIRAL_TURNS * 6.28) + randomAngle;

    screenSpaceRadius = alpha;
    return vec2(cos(angle), sin(angle));
}

vec3 getOffsetedPixelPos(vec2 screenSpacePx, vec2 unitOffset, float screenSpaceRadius) {

    vec2 ssPosition = screenSpacePx + (unitOffset * screenSpaceRadius);
    vec3 cameraSpacePosition = reconstructPosition(vec2(ssPosition) + vec2(0.5, 0.5));

    return cameraSpacePosition;
}

void packZValue(float z, out vec2 p) {

    float key = clamp(z * (1.0 / FAR_PLANE_Z), 0.0, 1.0);

    // Round to the nearest 1/256.0
    float temp = floor(key * 256.0);

    // Writes the integer part to the x component
    // and the fractional part to the y component
    p.x = temp * (1.0 / 256.0);
    p.y = key * 256.0 - temp;
}

float sampleAO(vec2 screenSpacePx, vec3 camSpacePos, vec3 normal, float diskRadius, int i, float randomAngle) {

    float screenSpaceRadius;
    vec2 offsetUnitVec = computeOffsetUnitVec(i, randomAngle, screenSpaceRadius);
    screenSpaceRadius *= diskRadius;

    vec3 occludingPoint = getOffsetedPixelPos(screenSpacePx, offsetUnitVec, screenSpaceRadius);

    vec3 v = occludingPoint - camSpacePos;

    float vv = dot(v, v);
    float vn = dot(v, normal);

    float f = max(radius2 - vv, 0.0);

    return f * f * f * max((vn - uBias) / (EPSILON + vv), 0.0);
}

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main( void ) {
    ivec2 pixelPos = ivec2(gl_FragCoord.xy);
    
    vec3 cameraSpacePosition = reconstructPosition(gl_FragCoord.xy);

    packZValue(cameraSpacePosition.z, gl_FragColor.gb);

    vec3 normal = reconstructNormal(cameraSpacePosition);

    //float randomAngle = (3 * ssC.x ^ ssC.y + ssC.x * ssC.y) * 10;
    //float randomAngle = hash21(gl_FragCoord.xy / uViewport.xy) * 100.0;
    //float randomAngle = hash21(gl_FragCoord.xy / uViewport.xy) * 3.14;
    float randomAngle = rand(gl_FragCoord.xy / uViewport.xy) * 3.14;
    
    /*if (cameraSpacePosition.z >= 10.0)
        gl_FragColor.r = 1.0;
    else if (cameraSpacePosition.z < -23.0)
        gl_FragColor.r = 0.2;
    else if (cameraSpacePosition.z >= -20.0)
        gl_FragColor.r = 0.5;
    else*/

    // TODO: Z seems to be always positive
    // maybe it is part of the blur problem
    gl_FragColor.r = cameraSpacePosition.z;

    float ssRadius = - 500.0 * uRadius / cameraSpacePosition.z;

    // TODO: Unroll the loop
    float contrib = 0.0;
    for (int i = 0; i < NB_SAMPLES; ++i) {
        contrib += sampleAO(gl_FragCoord.xy, cameraSpacePosition, normal, ssRadius, i, randomAngle);
    }

    float maxSample_float = float(NB_SAMPLES);
    float aoValue = max(0.0, 1.0 - contrib * uIntensityDivRadius6 * (5.0 / maxSample_float));

    /*if (abs(dFdx(cameraSpacePosition.z)) < 0.02) {
        float evenValue = mod(gl_FragCoord.x, 2.0);
        aoValue -= dFdx(aoValue) * (evenValue - 0.5);
    }
    if (abs(dFdy(cameraSpacePosition.z)) < 0.02) {
        float evenValue = mod(gl_FragCoord.y, 2.0);
        aoValue -= dFdy(aoValue) * (evenValue - 0.5);
    }*/

    //gl_FragColor = encodeFloatRGBA(aoValue);
    gl_FragColor.r = aoValue;
    gl_FragColor.a = 1.0;
}