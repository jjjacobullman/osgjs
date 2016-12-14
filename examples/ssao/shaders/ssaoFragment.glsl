#ifdef GL_ES
precision highp float;
#endif

#extension GL_OES_standard_derivatives : enable

#define MOD2 vec2(443.8975,397.2973)

#define NB_SAMPLES 11
#define NB_SPIRAL_TURNS 10.0
#define EPSILON 0.001

uniform ivec2 uViewport;

/**
 * Contains information to compute
 * the point in camera space
 * -2.0f / (width*P[0][0])
 * -2.0f / (height*P[1][1])
 * (1.0f - P[0][2]) / P[0][0]
 * (1.0f + P[1][2]) / P[1][1])
 */
uniform vec4 uProjectionInfo;
uniform float uProjScale;

uniform float uRadius;
uniform float uIntensityDivRadius6;
uniform float uBias;

uniform sampler2D uDepthTexture;

uniform float uNear;
uniform float uFar;

varying vec2 vTexCoord;
varying vec3 vNormal;

// DEBUG
uniform ivec4 uDebug;
float initFarMinusNear = 4.804226065180611;
// END DEBUG

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

    vec2 texCoord = (ssPosition + vec2(0.25)) / vec2(uViewport);
    float d = texture2D(uDepthTexture, texCoord).r;
    /*float d = decodeFloatRGBA( texture2D(uDepthTexture, texCoord).rgba);
    return uC.x / (d * uC.y + uC.z);*/
    //return uNear + (uFar - uNear) * d;
    return d;
}

// Computes camera-space position of fragment
vec3 reconstructPosition(vec2 screenSpacePx) {

    float z = zValueFromScreenSpacePosition(screenSpacePx);
    vec2 pixelPosHalf = screenSpacePx + vec2(0.5);

    return vec3((pixelPosHalf.xy * uProjectionInfo.xy + uProjectionInfo.zw) * z, z);

}

vec3 reconstructCSPosition(vec2 ssP, float z) {
    return vec3((ssP.xy * uProjectionInfo.xy + uProjectionInfo.zw) * z, z);
}

vec3 getPosition(ivec2 ssP) {

    vec2 ssP_float = vec2(ssP);

    vec3 P;
    P.z = zValueFromScreenSpacePosition(ssP_float);

    // Offset to pixel center
    P = reconstructCSPosition(ssP_float + vec2(0.5), P.z);
    return P;
}

vec3 reconstructNormal(vec3 c) {
    return normalize(cross(dFdy(c), dFdx(c)));
}

vec3 reconstructRawNormal(vec3 c) {
    return cross(dFdy(c), dFdx(c));
}

vec2 computeOffsetUnitVec(int sampleNumber, float randomAngle, out float screenSpaceRadius) {

    float sampleNumber_float = float(sampleNumber);
    float maxSample_float = float(NB_SAMPLES);

    float alpha = (sampleNumber_float + 0.5) * (1.0 / maxSample_float);
    float angle = alpha * (NB_SPIRAL_TURNS * 6.28) + randomAngle;

    screenSpaceRadius = alpha;
    return vec2(cos(angle), sin(angle));
}

vec3 getOffsetedPixelPos(ivec2 ssC, vec2 unitOffset, float screenSpaceRadius) {

    ivec2 ssP = ivec2(screenSpaceRadius * unitOffset) + ssC;
    vec2 ssP_float = vec2(ssP);

    vec3 P;
    P.z = zValueFromScreenSpacePosition(ssP_float);

    // Offset to pixel center
    P = reconstructCSPosition((vec2(ssP) + vec2(0.5)), P.z);

    return P;
}

float sampleAO(ivec2 ssC, vec3 camSpacePos, vec3 normal, float diskRadius, int i, float randomAngle) {

    float screenSpaceRadius;
    vec2 offsetUnitVec = computeOffsetUnitVec(i, randomAngle, screenSpaceRadius);
    //screenSpaceRadius *= diskRadius;
    screenSpaceRadius = max(0.75, screenSpaceRadius * diskRadius);

    vec3 occludingPoint = getOffsetedPixelPos(ssC, offsetUnitVec, screenSpaceRadius);

    vec3 v = occludingPoint - camSpacePos;

    float vv = dot(v, v);
    float vn = dot(v, normal);

    float f = max(radius2 - vv, 0.0);

    //return f * f * f * max((vn - uBias) / (EPSILON + vv), 0.0);

    /*if (vv <= uRadius && (vn <= 1.0 || vn >= -1.0))
        return 1.0;
    return 0.0;*/

    float ao = f * f * f * max((vn - uBias) / (EPSILON + vv), 0.0);
    return ao * mix(1.0, max(0.0, 1.5 * normal.z), 0.35);
}

void main( void ) {
    ivec2 ssC = ivec2(gl_FragCoord.xy);

    //vec3 cameraSpacePosition = reconstructPosition(vec2(ssC));
    vec3 cameraSpacePosition = getPosition(ssC);

    //vec3 normal = reconstructNormal(cameraSpacePosition);
    vec3 normal = reconstructRawNormal(cameraSpacePosition);
    if (dot(normal, normal) > pow(cameraSpacePosition.z * cameraSpacePosition.z * 0.00006, 2.0)) {
        gl_FragColor.r = 1.0;
        return;
    }
    normal = normalize(normal);

    // TODO: Use random function
    //float randomAngle = (3 * ssC.x ^ ssC.y + ssC.x * ssC.y) * 10;
    float randomAngle = hash21(gl_FragCoord.xy / vec2(uViewport)) * 10.0;

    //float ssRadius = - 500.0 * uRadius / cameraSpacePosition.z;
    //float ssRadius = 500.0 * uRadius / cameraSpacePosition.z;
    float ssRadius = - uProjScale * uRadius / cameraSpacePosition.z;

    /*if (ssRadius < 3.0) {
        // There is no way to compute AO at this radius
        gl_FragColor.r = 1.0;
        return;
    }*/

    float contrib = 0.0;
    for (int i = 0; i < NB_SAMPLES; ++i) {
        contrib += sampleAO(ssC, cameraSpacePosition, normal, ssRadius, i, randomAngle);
    }

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
    gl_FragColor.r = aoValue;

    // DEBUG
    if (uDebug.x == 1)
        gl_FragColor.rgb = cameraSpacePosition / vec3(2.0);
    if (uDebug.y == 1)
        gl_FragColor.rgb = -normal;
    if (uDebug.z == 1)
        gl_FragColor.r = texture2D(uDepthTexture, gl_FragCoord.xy / vec2(uViewport)).r;
    if (uDebug.w != 0)
    {
        gl_FragColor.r = cameraSpacePosition.z / float(uDebug.w);
    }
    //  END DEBUG
    // END DEBUG
}
