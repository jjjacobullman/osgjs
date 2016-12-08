#ifdef GL_ES
precision highp float;
#endif

#extension GL_OES_standard_derivatives : enable

#define MOD2 vec2(443.8975,397.2973)

// Defines used to approximate the occlusion
//#define NB_SAMPLES 32
#define NB_SAMPLES 11
#define NB_SPIRAL_TURNS 7.0
//#define NB_SPIRAL_TURNS 3.0
#define EPSILON 0.01

#define FAR_PLANE_Z (-300.0)
//#define FAR_PLANE_Z (10.0)

uniform vec2 uViewport;

/**
 * Contains information to compute
 * the point in camera space
 * -2.0f / (width*P[0][0])
 * -2.0f / (height*P[1][1])
 * (1.0f - P[0][2]) / P[0][0]
 * (1.0f + P[1][2]) / P[1][1])
 */
uniform mat4 uInvProj;
uniform vec4 uProjectionInfo;
uniform float uProjScale;

uniform float uNear;
uniform float uFar;

uniform float uRadius;
uniform float uIntensityDivRadius6;
uniform float uBias;

uniform sampler2D uDepthTexture;

// DEBUG
vec2 focalLength = vec2(1.0/tan(45.0*0.5)*uViewport.y/uViewport.x,1.0/tan(45.0*0.5));
uniform ivec4 uDebug;
// END DEBUG

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

// DEBUG
float linearDepth(float d, float near, float far)
{
    d = d * 2.0 - 1.0;
    vec2 lin = vec2((near-far)/(2.0*near*far),(near+far)/(2.0*near*far));
    return -1.0/(lin.x*d+lin.y);
}

vec3 UVtoViewSpace(vec2 uv, float z)
{
    vec2 UVtoViewA = vec2(-2.0/focalLength.x,-2.0/focalLength.y);
    vec2 UVtoViewB = vec2(1.0/focalLength.x,1.0/focalLength.y);
    uv = UVtoViewA*uv + UVtoViewB;
    return vec3(uv*z,z);
}
// END DEBUG

float zValueFromScreenSpacePosition(vec2 ssPosition) {

    //float x = ssPosition.x / uViewport.x;
    //float y = ssPosition.y / uViewport.y;

    //vec2 texCoord = vec2(x, y);
    vec2 texCoord = ssPosition / uViewport;
    float d = texture2D(uDepthTexture, texCoord).r;
    //float z_e = 2.0 * d - 1.0;
    //float z_e = 2.0 * uNear * uFar / (uFar + uNear - z_n * (uFar - uNear));
    return uNear + (uFar - uNear) * d;
    //return (uNear * uFar) / (d * (uNear - uFar) + uFar);
    //return linearDepth
}

// Computes camera-space position of fragment
vec3 reconstructPosition(vec2 screenSpacePx, float z) {

    //float z = zValueFromScreenSpacePosition(screenSpacePx);
    //vec2 pixelPosHalf = screenSpacePx + vec2(0.5);

    return vec3((screenSpacePx.xy * uProjectionInfo.xy + uProjectionInfo.zw) * z, z);

}

vec3 getPosition(vec2 screenSpacePx) {
    vec3 P;
    P.z = zValueFromScreenSpacePosition(screenSpacePx);

    // Offset to pixel center
    P = reconstructPosition(vec2(screenSpacePx) + vec2(0.5), P.z);
    //P = reconstructPosition(vec2(screenSpacePx) + vec2(0.5));
    return P;
}

vec3 reconstructNormal(vec3 c) {
    return normalize(cross(dFdy(c), dFdx(c)));
}

vec2 computeOffsetUnitVec(int sampleNumber, float randomAngle, out float screenSpaceRadius) {

    float alpha = (float(sampleNumber) + 0.5) * (1.0 / float(NB_SAMPLES));
    float angle = alpha * (NB_SPIRAL_TURNS * 6.2831853071795864) + randomAngle;
    screenSpaceRadius = alpha;

    return vec2(cos(angle), sin(angle));
}

vec3 getOffsetedPixelPos(vec2 screenSpacePx, vec2 unitOffset, float screenSpaceRadius) {

    vec2 ssPosition = screenSpacePx + (unitOffset * screenSpaceRadius);

    float z = zValueFromScreenSpacePosition(ssPosition);
    vec3 cameraSpacePosition = reconstructPosition(vec2(ssPosition) + vec2(0.5), z);
    //vec3 cameraSpacePosition = reconstructPosition(vec2(ssPosition) + vec2(0.5));

    return cameraSpacePosition;
}

void packZValue(float z, out vec2 p) {

    float key = clamp(z * (1.0 / FAR_PLANE_Z), 0.0, 1.0);
    //float key = z;

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
    //return max(0.0, dot(v, normal + vec3(camSpacePos.z * 0.0005))) / (vv + 0.01);
    //return float(vv < radius2) * max((vn - uBias) / (EPSILON + vv), 0.0) * radius2 * 0.6;
    //float invRadius2 = 1.0 / radius2;
    //return 4.0 * max(1.0 - vv * invRadius2, 0.0) * max(vn - uBias, 0.0);
}

/*float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}*/

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

    vec3 cameraSpacePosition = getPosition(gl_FragCoord.xy);

    //packZValue(cameraSpacePosition.z, gl_FragColor.gb);

    vec3 normal = reconstructNormal(cameraSpacePosition);

    vec2 pixelPosC = gl_FragCoord.xy;
    pixelPosC.y = uViewport.y-pixelPosC.y;
    //float randomAngle = hash21(gl_FragCoord.xy / uViewport.xy) * 3.14;
    //float randomAngle = rand(gl_FragCoord.xy / uViewport.xy) * 3.14;
    float randomAngle = rand(pixelPosC) * 3.14;

    // TODO: Z seems to be always positive
    // maybe it is part of the blur problem
    //gl_FragColor.r = 1.0 / cameraSpacePosition.z;

    //float ssRadius = - 0.5 * uProjScale * uRadius / cameraSpacePosition.z;
    //float ssRadius = uProjeScale * uRadius / max(cameraSpacePosition.z, 0.1);
    float ssRadius = - uProjScale * uRadius / cameraSpacePosition.z;
    //float ssRadius = 100.0 * focalLength.y * uRadius / cameraSpacePosition.z;

    // TODO: Unroll the loop
    float contrib = 0.0;
    for (int i = 0; i < NB_SAMPLES; ++i) {
        contrib += sampleAO(gl_FragCoord.xy, cameraSpacePosition, normal, ssRadius, i, randomAngle);
    }

    float aoValue = max(0.0, 1.0 - contrib * uIntensityDivRadius6 * (5.0 / float(NB_SAMPLES)));
    /*float aoValue = 1.0 - (contrib / float(NB_SAMPLES));
    aoValue = clamp(pow(aoValue, 1.0 + 100.0), 0.0, 1.0); */
    /*if (abs(dFdx(cameraSpacePosition.z)) < 0.02) {
        float evenValue = mod(gl_FragCoord.x, 2.0);
        aoValue -= dFdx(aoValue) * (evenValue - 0.5);
    }
    if (abs(dFdy(cameraSpacePosition.z)) < 0.02) {
        float evenValue = mod(gl_FragCoord.y, 2.0);
        aoValue -= dFdy(aoValue) * (evenValue - 0.5);
    }*/

    //gl_FragColor = encodeFloatRGBA(aoValue);
    //gl_FragColor.r = - normal.z;

    // DEBUG
    //float d = zValueFromScreenSpacePosition(gl_FragCoord.xy);
    //gl_FragColor.r = d;
    //gl_FragColor.r = texture2D(uDepthTexture, gl_FragCoord.xy / uViewport.xy).r;
    // END DEBUG

    //gl_FragColor.r = mix(aoValue, 1.0, 1.0 - clamp(0.5 * cameraSpacePosition.z, 0.0, 1.0));
    
    gl_FragColor.r = aoValue;
    //gl_FragColor.r = -ssRadius / 100.0;
    gl_FragColor.g = clamp(cameraSpacePosition.z * (1.0 / FAR_PLANE_Z), 0.0, 1.0);
    gl_FragColor.a = 1.0;

    // DEBUG
    if (uDebug.x == 1)
        gl_FragColor.rgb = cameraSpacePosition / vec3(2.0);
    if (uDebug.y == 1)
        gl_FragColor.rgb = -normal;
    if (uDebug.z == 1)
        gl_FragColor.r = texture2D(uDepthTexture, gl_FragCoord.xy / uViewport.xy).r;
    if (uDebug.w == 1)
    {
        if (-ssRadius > 100.0)
            gl_FragColor.r = 1.0;
        else if (-ssRadius > 50.0)
            gl_FragColor.r = 0.75;
        else if (-ssRadius > 20.0)
            gl_FragColor.r = 0.45;
        else if (-ssRadius > 0.0)
            gl_FragColor.r = 0.2;
        else
            gl_FragColor.r = 0.0;
    }
    //  END DEBUG
}