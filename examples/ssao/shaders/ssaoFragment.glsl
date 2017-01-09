#ifdef GL_ES
precision highp float;
#endif

#extension GL_OES_standard_derivatives : enable
#extension GL_EXT_shader_texture_lod : enable

#define MOD2 vec2(443.8975,397.2973)

#define FAR_PLANE 1000.0
#define EPSILON 0.001
#define NB_SAMPLES 11
#define MIN_RADIUS 2.0

#define MAX_MIP_LEVEL 10
#define LOG_MAX_OFFSET 3

# define M_PI 3.14159265358979323846

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


uniform vec2 RenderSize;

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
uniform float uRadius2;
uniform float uBoudingSphereRadius;
uniform float uIntensityDivRadius6;
uniform float uBias;

uniform sampler2D uDepthTexture;

uniform float uNear;
uniform float uFar;

varying vec2 vTexCoord;
varying vec3 vNormal;

float decodeFloatRGBA( vec4 rgba ) {
   return dot( rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0) );
}

void encodeFloatToVec3( float v, out vec3 p ) {
   p = vec3(1.0, 255.0, 65025.0) * v;
   p = fract(p);
   p -= p.yzz * vec3(1.0/255.0,1.0/255.0,1.0/255.0);
}

float zValueFromScreenSpacePosition(vec2 ssPosition) {

    vec2 texCoord = (ssPosition + vec2(0.25)) / vec2(RenderSize);
    float d = decodeFloatRGBA(texture2D(uDepthTexture, texCoord));

    // DEBUG
    //return texture2D(uDepthTexture, texCoord, 0.0).r;
    // END DEBUG
    //return (uNear * uFar) / (d * (uNear - uFar) + uFar);
    return uNear + (uFar - uNear) * d;
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

// TEST
int getMipLevel(float ssR) {
    // Derivation:
    //  mipLevel = floor(log(ssR / MAX_OFFSET));
    return int(clamp(floor(log2(ssR)) - float(LOG_MAX_OFFSET), 0.0, float(MAX_MIP_LEVEL)));
}

/*vec3 getOffsetedPixelPos(ivec2 ssC, vec2 unitOffset, float screenSpaceRadius) {

    int mipLevel = getMipLevel(screenSpaceRadius);

    ivec2 ssP = ivec2(screenSpaceRadius * unitOffset) + ssC;
    vec2 ssP_float = vec2(ssP);

    vec2 size;
    size.x = 1024.0 / (float(mipLevel) + 1.0);
    size.y = 512.0 / (float(mipLevel) + 1.0);

    float div = pow(2.0, float(mipLevel));
    //ivec2 mipPoint = clamp(ssP >> mipLevel, ivec2(0), textureSize(CS_Z_buffer, mipLevel) - ivec2(1));
    ivec2 mipPoint = ivec2(clamp(vec2(ssP) / div, vec2(0.0), size - vec2(1.0)));

    vec3 P;
    float d = decodeFloatRGBA(texture2D(uDepthTexture, float(mipPoint) / size, float(mipLevel)));
    P.z = zValueFromScreenSpacePosition(ssP_float);

    // Offset to pixel center
    P = reconstructCSPosition((vec2(ssP) + vec2(0.5)), P.z);

    return P;
}*/
// END TEST

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
    //return f * max((vn - uBias) * inversesqrt(EPSILON + vv), 0.0);
    // END HIGH QUALITY

    // MEDIUM QUALITY
    float f = max(uRadius2 - vv, 0.0);
    float ao = f * f * f * max((vn - uBias) / (EPSILON + vv), 0.0);

    return ao * mix(1.0, max(0.0, 1.5 * normal.z), 0.35);
    // END MEDIUM QUALITY
}

float fallOffMethod1(float vv, float vn, vec3 normal) {
    return float(vv < uRadius2) * max((vn - uBias) / (EPSILON + vv), 0.0) * uRadius2 * 0.6;
}

float fallOffMethod2(float vv, float vn, vec3 normal) {
    float invRadius2 = 1.0 / uRadius2;
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

    // This fixes the self occlusion created when there is no depth written
    // the offset added is mandatory because the float encoding function
    // introduces some small precision errors
    if (occludingPoint.z <= uNear + 0.01)
        return 0.0;

    vec3 v = occludingPoint - camSpacePos;
    float vv = dot(v, v);
    float vn = dot(v, normal);

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
    normal = normalize(normal);

    float randomAngle = rand(gl_FragCoord.xy / vec2(RenderSize)) * 3.14;
    float ssRadius = - uProjScale * uRadius / max(cameraSpacePosition.z, 0.01);

    // EARLY RETURN
    // Impossible to compute AO, too few pixels concerned by the radius
    if (ssRadius < MIN_RADIUS) {
        gl_FragColor.r = 1.0;
        encodeFloatToVec3(clamp(cameraSpacePosition.z * (1.0 / (uBoudingSphereRadius * FAR_PLANE)), 0.0, 1.0), gl_FragColor.gba);
        return;
    }

    float contrib = 0.0;
    for (int i = 0; i < NB_SAMPLES; ++i) {
        contrib += sampleAO(ssC, cameraSpacePosition, normal, ssRadius, i, randomAngle);
    }

    //float aoValue = pow(max(0.0, 1.0 - sqrt(contrib * (3.0 / maxSample_float))), 2.0);
    float aoValue = max(0.0, 1.0 - contrib * uIntensityDivRadius6 * (5.0 / float(NB_SAMPLES)));

    // Anti-tone map to reduce contrast and drag dark region farther
    aoValue = (pow(aoValue, 0.2) + 1.2 * aoValue * aoValue * aoValue * aoValue) / 2.2;

    gl_FragColor.r = mix(1.0, aoValue, clamp(ssRadius - MIN_RADIUS, 0.0, 1.0));
    encodeFloatToVec3(clamp(cameraSpacePosition.z * (1.0 / (uBoudingSphereRadius * FAR_PLANE)), 0.0, 1.0), gl_FragColor.gba);

    // DEBUG
    // Temporary code setting the background controller
    // after the last composer pass
    //gl_FragColor = vec4(gl_FragColor.rrr, 1.0);
    if (texture2D(uDepthTexture, gl_FragCoord.xy / RenderSize).rgba == vec4(0.0,0.0,0.0, 1.0))
        gl_FragColor.gba = vec3(0.0);
    // END DEBUG
}
