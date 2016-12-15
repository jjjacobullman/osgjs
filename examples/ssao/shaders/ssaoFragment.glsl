#ifdef GL_ES
precision highp float;
#endif

#extension GL_OES_standard_derivatives : enable

#define MOD2 vec2(443.8975,397.2973)

#define NB_SAMPLES 11


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
// with index NB_SAMPLES
#define NB_SPIRAL_TURNS 3.0
//#define NB_SPIRAL_TURNS 10.0


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

    return d;
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

    float ao = f * f * f * max((vn - uBias) / (EPSILON + vv), 0.0);
    return ao * mix(1.0, max(0.0, 1.5 * normal.z), 0.35);
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

    //vec3 cameraSpacePosition = reconstructPosition(vec2(ssC));
    vec3 cameraSpacePosition = getPosition(ssC);
    vec3 normal = reconstructRawNormal(cameraSpacePosition);

    // EARLY RETURN
    // If
    /*if (dot(normal, normal) > pow(cameraSpacePosition.z * cameraSpacePosition.z * 0.00006, 2.0)) {
        gl_FragColor.r = 1.0;
        return;
    }*/
    normal = normalize(normal);

    // TODO: Use random function
    //float randomAngle = (3 * ssC.x ^ ssC.y + ssC.x * ssC.y) * 10;
    //float randomAngle = hash21(gl_FragCoord.xy / vec2(uViewport)) * 10.0;
    float randomAngle = rand(gl_FragCoord.xy / vec2(uViewport)) * 3.14;

    //float ssRadius = - 500.0 * uRadius / cameraSpacePosition.z;
    //float ssRadius = 500.0 * uRadius / cameraSpacePosition.z;
    float ssRadius = - uProjScale * uRadius / cameraSpacePosition.z;

    // EARLY RETURN
    // Impossible to compute AO, too few pixels concerned by the radius
    if (ssRadius < 3.0) {
        gl_FragColor.r = 1.0;
        return;
    }

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

    float aoValue = max(0.0, 1.0 - contrib * uIntensityDivRadius6 * (5.0 / maxSample_float));
    aoValue = (pow(aoValue, 0.2) + 1.2 * aoValue * aoValue * aoValue * aoValue) / 2.2;

    /*if (abs(dFdx(cameraSpacePosition.z)) < 0.02) {
        aoValue -= dFdx(aoValue) * (mod(float(ssC.x), 2.0) - 0.5);
    }
    if (abs(dFdy(cameraSpacePosition.z)) < 0.02) {
        aoValue -= dFdy(aoValue) * (mod(float(ssC.y), 2.0) - 0.5);
    }*/

    //gl_FragColor.r = aoValue;
    gl_FragColor.r = mix(1.0, aoValue, clamp(ssRadius - 3.0, 0.0, 1.0));
    //gl_FragColor.g = cameraSpacePosition.z;
    gl_FragColor.g = clamp(cameraSpacePosition.z * (1.0 / 300.0), 0.0, 1.0);

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
