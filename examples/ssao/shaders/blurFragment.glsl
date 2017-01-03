#ifdef GL_ES
precision highp float;
#endif

#define EDGE_SHARPNESS 1.0
#define SCALE 2.0
#define FILTER_RADIUS 3
#define EPSILON 0.0001

uniform sampler2D uAoTexture;

uniform ivec2 uViewport;
uniform ivec2 uAxis;
uniform float uInvRadius;
uniform float uCrispness;
uniform float uBoudingSphereRadius;

#define test

vec4 fetchTextureValue(vec2 ssPosition) {
    vec2 texCoord = (ssPosition + vec2(0.25)) / vec2(uViewport);
    return texture2D(uAoTexture, texCoord);
}

float decodeFloatFromVec2(vec2 p) {
    return p.x * (256.0 / 257.0) + p.y * (1.0 / 257.0);
}

vec4 getTapSample(int i, ivec2 ssC) {
	ivec2 tapLoc = ivec2(vec2(ssC) + vec2(uAxis) * (float(i) * SCALE));
	return fetchTextureValue(vec2(tapLoc));
}

float getWeightAtSample(float initialZ, float z, float gaussianWeight) {
	float scale = 1.5 * uInvRadius * uBoudingSphereRadius;

	float weight = 0.3 + gaussianWeight;
	weight *= max(0.0, 1.0 - (uCrispness * EDGE_SHARPNESS * 2000.0) * abs(z - initialZ) * scale);

	return weight;
}

/*float getWeightAtSample(float initialZ, vec4 tap, float gaussianWeight) {
	float scale = 1.5 * uInvRadius * uBoudingSphereRadius;
	float z = decodeFloatFromVec2(tap.ba);

	float weight = 0.3 + gaussianWeight;
	weight *= max(0.0, 1.0 - (uCrispness * EDGE_SHARPNESS * 2000.0) * abs(z - initialZ) * scale);

	return weight;
}*/

void main() {

    ivec2 ssC = ivec2(gl_FragCoord.xy);

	vec4 tmp = fetchTextureValue(gl_FragCoord.xy);
	float initialZ = tmp.g;
	//float initialZ = decodeFloatFromVec2(tmp.ba);
	float sum = tmp.r;
	//float sum = decodeFloatFromVec2(tmp.rg);

	float gaussian[FILTER_RADIUS + 1];
	#if FILTER_RADIUS == 3
    	gaussian[0] = 0.153170; gaussian[1] = 0.144893;
    	gaussian[2] = 0.122649; gaussian[3] = 0.092902;
	#elif FILTER_RADIUS == 4
      	gaussian[0] = 0.153170; gaussian[1] = 0.144893; gaussian[2] = 0.122649;
      	gaussian[3] = 0.092902; gaussian[4] = 0.062970;
	#elif FILTER_RADIUS == 6
    	gaussian[0] = 0.111220; gaussian[1] = 0.107798; gaussian[2] = 0.098151; gaussian[3] = 0.083953;
    	gaussian[4] = 0.067458; gaussian[5] = 0.050920; gaussian[6] = 0.036108;
	#endif

	float BASE = gaussian[0];
    float totalWeight = BASE;
    sum *= totalWeight;

    // LOOP VERSION
	/*for (int r = - FILTER_RADIUS; r <= FILTER_RADIUS; ++r) {

		if (r != 0) {
			ivec2 tapLoc = ivec2(vec2(ssC) + vec2(uAxis) * (float(r) * SCALE));
			vec4 fetch = fetchTextureValue(vec2(tapLoc));
			//float z = unpackKey(fetch.gb);
			float z = fetch.g;
			float weight = 0.3 + gaussian[int(abs(float(r)))];

			float scale = 1.5 * uInvRadius * uBoudingSphereRadius;
			weight *= max(0.0, 1.0 - (uCrispness * EDGE_SHARPNESS * 2000.0) * abs(z - initialZ) * scale);

			sum += fetch.r * weight;
            totalWeight += weight;
		}
	}*/

	// UNROLLED VERSION
	float g05 = gaussian[3];
	float g14 = gaussian[2];
	float g23 = gaussian[1];

	vec4 tap0 = getTapSample(-3, ssC);
	vec4 tap1 = getTapSample(-2, ssC);
	vec4 tap2 = getTapSample(-1, ssC);
	vec4 tap3 = getTapSample(1, ssC);
	vec4 tap4 = getTapSample(2, ssC);
	vec4 tap5 = getTapSample(3, ssC);

	/*float weight = getWeightAtSample(initialZ, tap0, g05);

	sum += decodeFloatFromVec2(tap0.rg) * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap1, g14);
	sum += decodeFloatFromVec2(tap1.rg) * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap2, g23);
	sum += decodeFloatFromVec2(tap2.rg) * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap3, g23);
	sum += decodeFloatFromVec2(tap3.rg) * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap4, g14);
	sum += decodeFloatFromVec2(tap4.rg) * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap5, g05);
	sum += decodeFloatFromVec2(tap5.rg) * weight;
	totalWeight += weight;*/

	float weight = getWeightAtSample(initialZ, tap0.g, g05);

	sum += tap0.r * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap1.g, g14);
	sum += tap1.r * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap2.g, g23);
	sum += tap2.r * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap3.g, g23);
	sum += tap3.r * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap4.g, g14);
	sum += tap4.r * weight;
	totalWeight += weight;

	weight = getWeightAtSample(initialZ, tap5.g, g05);
	sum += tap5.r * weight;
	totalWeight += weight;

	/*getWeightAtSample(- 3, initialZ, g05, ssC, totalWeight, sum);
	getWeightAtSample(- 2, initialZ, g14, ssC, totalWeight, sum);
	getWeightAtSample(- 1, initialZ, g23, ssC, totalWeight, sum);
	getWeightAtSample(1, initialZ, g23, ssC, totalWeight, sum);
	getWeightAtSample(2, initialZ, g14, ssC, totalWeight, sum);
	getWeightAtSample(3, initialZ, g05, ssC, totalWeight, sum);*/

    gl_FragColor.r = sum / (totalWeight + EPSILON);
    gl_FragColor.g = tmp.g;
}