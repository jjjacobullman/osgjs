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

vec4 fetchTextureValue(vec2 ssPosition) {
    vec2 texCoord = (ssPosition + vec2(0.25)) / vec2(uViewport);
    return texture2D(uAoTexture, texCoord);
}

float unpackKey(vec2 p) {
    return p.x * (256.0 / 257.0) + p.y * (1.0 / 257.0);
}

void main() {

    ivec2 ssC = ivec2(gl_FragCoord.xy);

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

	vec4 tmp = fetchTextureValue(gl_FragCoord.xy);
	float initialZ = tmp.g;
	float sum = tmp.r;

	float BASE = gaussian[0];
    float totalWeight = BASE;
    sum *= totalWeight;

    // TODO: Unroll the loop
	for (int r = - FILTER_RADIUS; r <= FILTER_RADIUS; ++r) {

		if (r != 0) {
			ivec2 tapLoc = ivec2(vec2(ssC) + vec2(uAxis) * (float(r) * SCALE));
			vec4 fetch = fetchTextureValue(vec2(tapLoc));
			//float z = unpackKey(fetch.gb);
			float z = fetch.g;
			float weight = 0.3 + gaussian[int(abs(float(r)))];

			float scale = 1.5 * uInvRadius;
			weight *= max(0.0, 1.0 - (uCrispness * EDGE_SHARPNESS * 2000.0) * abs(z - initialZ) * scale);
			//weight *= max(0.0, 1.0 - abs(z - initialZ));

			sum += fetch.r * weight;
            totalWeight += weight;
		}
	}

    //gl_FragColor.rgb = vec3(ao / (totalWeight + EPSILON));
    //gl_FragColor.a = 1.0;
    gl_FragColor.r = sum / (totalWeight + EPSILON);
    gl_FragColor.g = tmp.g;
    //gl_FragColor.gba = vec3(1.0);
}