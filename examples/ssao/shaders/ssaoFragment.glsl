#ifdef GL_ES
precision highp float;
#endif

#extension GL_OES_standard_derivatives : enable

#define MOD2 vec2(443.8975,397.2973)

#define NB_SAMPLES 11
#define NB_SPIRAL_TURNS 10.0
#define EPSILON 0.01

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
uniform vec3 uC;
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

    float sampleNumber_float = float(sampleNumber);
    float maxSample_float = float(NB_SAMPLES);

    float alpha = (sampleNumber_float + 0.5) * (1.0 / maxSample_float);
    float angle = alpha * (NB_SPIRAL_TURNS * 6.28) + randomAngle;

    screenSpaceRadius = alpha;
    return vec2(cos(angle), sin(angle));
}

vec3 getOffsetedPixelPos(vec2 screenSpacePx, vec2 unitOffset, float screenSpaceRadius) {

    vec2 ssPosition = screenSpacePx + (unitOffset * screenSpaceRadius);
    vec3 cameraSpacePosition = reconstructPosition(vec2(ssPosition) + vec2(0.5, 0.5));

    return cameraSpacePosition;
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

void main( void ) {
    vec3 cameraSpacePosition = reconstructPosition(gl_FragCoord.xy);
    vec3 normal = reconstructNormal(cameraSpacePosition);

    // TODO: Use random function
    //float randomAngle = (3 * ssC.x ^ ssC.y + ssC.x * ssC.y) * 10;
    float randomAngle = hash21(gl_FragCoord.xy);

    float ssRadius = - 500.0 * uRadius / cameraSpacePosition.z;

    float contrib = 0.0;
    for (int i = 0; i < NB_SAMPLES; ++i) {
        contrib += sampleAO(gl_FragCoord.xy, cameraSpacePosition, normal, ssRadius, i, randomAngle);
    }

    // DEBUG
    /*if (uC.y <= -990.0)
        gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0);
    else if (uC.y < -1.0 && uC.y > -10.0)
        gl_FragColor = vec4(0.0, 0.0, 1.0, 1.0);
    else
        gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);*/
    // END DEBUG

    // DEBUG
    /*float t = zValueFromScreenSpacePosition(gl_FragCoord.xy);
    gl_FragColor = vec4(t, t, t, 1.0);*/
    // END DEBUG

    /*float radius2 = 10.0;
    float temp = radius2 * uRadius;
    contrib /= temp * temp;*/

    float maxSample_float = float(NB_SAMPLES);

    //float aoValue = max(0.0, 1.0 - contrib * 1.0 * (5.0 / maxSample_float));
    float aoValue = max(0.0, 1.0 - contrib * uIntensityDivRadius6 * (5.0 / maxSample_float));

    gl_FragColor = vec4(1.0 * aoValue, 1.0 * aoValue, 1.0 * aoValue, 1.0);
}