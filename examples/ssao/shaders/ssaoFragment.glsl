#ifdef GL_ES
precision highp float;
#endif

#extension GL_OES_standard_derivatives : enable

#define MOD2 vec2(443.8975,397.2973)

#define FAR_PLANE 1000.0
#define EPSILON 0.001
#define NB_SAMPLES 11

# define M_PI 3.14159265358979323846  /* pi */

/*
    1,  1,  1,  2,  3,  2,  5,  2,  3,  2,  // 0
    3,  3,  5,  5,  3,  4,  7,  5,  5,  7,  // 1
    9,  8,  5,  5,  7,  7,  7,  8,  5,  8,  // 2
    11, 12,  7, 10, 13,  8, 11,  8,  7, 14,  // 3
    11, 11, 13, 12, 13, 19, 17, 13, 11, 18,  // 4
    19, 11, 11, 14, 17, 21, 15, 16, 17, 18,  // 5
    29, 21, 19, 27, 31, 29, 21, 18, 17, 29,  // 7
    13, 17, 11, 17, 19, 18, 25, 18, 19, 19,  // 6
    31, 31, 23, 18, 25, 26, 25, 23, 19, 34,  // 8
    19, 27, 21, 25, 39, 29, 17, 21, 27, 29}; // 9
*/

// Should be a number from the array defined above
// with index equals to NB_SAMPLES
#define NB_SPIRAL_TURNS 3.0
//#define NB_SPIRAL_TURNS 10.0

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
uniform int uFallOfMethod;

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
// END DEBUG

float radius2 = 1.0;

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

    return d;
    //return uNear + (uFar - uNear) * d;
}

vec3 reconstructCSPosition(vec2 ssP, float z) {
    return vec3((ssP.xy * uProjectionInfo.xy + uProjectionInfo.zw) * z, z);
}

vec3 getPosition(ivec2 ssP) {

    vec2 ssP_float = vec2(ssP);

    vec3 P;
    P.z = texture2D(uDepthTexture, vTexCoord).r;

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

// Default fallOff method
float fallOffMethod0(float vv, float vn, vec3 normal) {

    // HIGH QUALITY
    //float invRadius2 = 1.0 / radius2;
    //float f = max(1.0 - vv * invRadius2, 0.0);
    //float ao = f * max((vn - uBias) * inversesqrt(EPSILON + vv), 0.0);
    // END HIGH QUALITY

    // DEBUG
    //float scaledScreenDistance = sqrt(vv) / uFar;
    // END DEBUG

    float f = max(radius2 - vv, 0.0);
    float ao = f * f * f * max((vn - uBias) / (EPSILON + vv), 0.0);
    return ao * mix(1.0, max(0.0, 1.5 * normal.z), 0.35);
}

float fallOffMethod1(float vv, float vn, vec3 normal) {
    return float(vv < radius2) * max((vn - uBias) / (EPSILON + vv), 0.0) * radius2 * 0.6;
}

float fallOffMethod2(float vv, float vn, vec3 normal) {
    float invRadius2 = 1.0 / radius2;
    return 4.0 * max(1.0 - vv * invRadius2, 0.0) * max(vn - uBias, 0.0);
}

float fallOffMethod3(float vv, float vn, vec3 normal) {
    return 2.0 * float(vv < uRadius * uRadius) * max(vn - uBias, 0.0);
}

float sampleAO(ivec2 ssC, vec3 camSpacePos, vec3 normal, float diskRadius, int i, float randomAngle) {

    float screenSpaceRadius;
    vec2 offsetUnitVec = computeOffsetUnitVec(i, randomAngle, screenSpaceRadius);
    screenSpaceRadius = max(0.75, screenSpaceRadius * diskRadius);

    vec3 occludingPoint = getOffsetedPixelPos(ssC, offsetUnitVec, screenSpaceRadius);
    // This fixes the self occlusion created when  there is no depth written
    if (occludingPoint.z <= uNear)
        return 0.0;

    vec3 v = occludingPoint - camSpacePos;
    float vv = dot(v, v);
    float vn = dot(v, normal);

    // DEBUG
    //float scaledScreenDistance = length(v) / uFar;
    //return 1.0 * max(0.0, (dot(normal, v) * uFar) / scaledScreenDistance - uBias) / (1.0 + scaledScreenDistance * scaledScreenDistance);
    //END DEBUG

    if (uFallOfMethod == 0)
        return fallOffMethod0(vv, vn, normal);
    else if (uFallOfMethod == 1)
        return fallOffMethod1(vv, vn, normal);
    else if (uFallOfMethod == 2)
        return fallOffMethod2(vv, vn, normal);

    return fallOffMethod3(vv, vn, normal);
}

float rand(vec2 co)
{
    highp float a = 12.9898;
    highp float b = 78.233;
    highp float c = 43758.5453;
    highp float dt= dot(co.xy ,vec2(a,b));
    highp float sn= mod(dt,3.14);
    return fract(sin(sn) * c);
}


void main( void ) {

    ivec2 ssC = ivec2(gl_FragCoord.xy);

    vec3 cameraSpacePosition = getPosition(ssC);
    vec3 normal = reconstructRawNormal(cameraSpacePosition);

    // EARLY RETURN
    // If
    /*if (dot(normal, normal) > pow(cameraSpacePosition.z * cameraSpacePosition.z * 0.00006, 2.0)) {
        gl_FragColor.r = 1.0;
        return;
    }*/
    normal = normalize(normal);

    //float randomAngle = hash21(gl_FragCoord.xy / vec2(uViewport)) * 10.0;
    float randomAngle = rand(gl_FragCoord.xy / vec2(uViewport)) * 3.14;
    //float randomAngle = rand(gl_FragCoord.xy / vec2(uViewport)) * 10.0;

    float ssRadius = - uProjScale * uRadius / max(cameraSpacePosition.z, 0.2);
    //ssRadius = clamp(ssRadius, 0.0, 150.0);
    // EARLY RETURN
    // Impossible to compute AO, too few pixels concerned by the radius
    /*if (ssRadius < 3.0) {
        gl_FragColor.r = 1.0;
        return;
    }*/

    radius2 = uRadius * uRadius;
    float contrib = 0.0;
    for (int i = 0; i < NB_SAMPLES; ++i) {
        contrib += sampleAO(ssC, cameraSpacePosition, normal, ssRadius, i, randomAngle);
    }

    float maxSample_float = float(NB_SAMPLES);

    // DEBUG
    if (uDebug.w != 0) {
        float screenSpaceRadius;
        vec2 offsetUnitVec = computeOffsetUnitVec(0, randomAngle, screenSpaceRadius);
        screenSpaceRadius = max(0.75, screenSpaceRadius * ssRadius);

        vec3 occludingPoint = getOffsetedPixelPos(ssC, offsetUnitVec, screenSpaceRadius);
        vec3 v = occludingPoint - cameraSpacePosition;
        gl_FragColor = vec4(occludingPoint, 1.0);

        gl_FragColor = vec4(vec3(contrib), 1.0);

        return;
    }
    // END DEBUG
    //float aoValue = pow(max(0.0, 1.0 - sqrt(contrib * (3.0 / maxSample_float))), 2.0);
    float aoValue = max(0.0, 1.0 - contrib * uIntensityDivRadius6 * (5.0 / maxSample_float));

    // Anti-tone map to reduce contrast and drag dark region farther
    //aoValue = (pow(aoValue, 0.2) + 1.2 * aoValue * aoValue * aoValue * aoValue) / 2.2;

    // Fade in as the radius reaches ~0px
    //gl_FragColor.r = mix(1.0, aoValue, clamp(ssRadius - 3.0, 0.0, 1.0));
    gl_FragColor.r = aoValue;
    gl_FragColor.g = clamp(cameraSpacePosition.z * (1.0 / FAR_PLANE), 0.0, 1.0);
    //gl_FragColor.g = clamp(cameraSpacePosition.z * (1.0 / uFar), 0.0, 1.0);

    // DEBUG
    if (uDebug.x == 1)
        gl_FragColor.rgb = cameraSpacePosition / vec3(2.0);
    if (uDebug.y == 1)
        gl_FragColor.rgb = -normal;
    if (uDebug.z == 1)
        gl_FragColor.r = texture2D(uDepthTexture, ((gl_FragCoord.xy + 0.25) / vec2(uViewport))).r;
    //  END DEBUG
}
