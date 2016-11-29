#define EDGE_SHARPNESS 1.0
#define SCALE 2.0
#define FILTER_RADIUS 4
#define EPSILON 0.0001

uniform sampler2D uAoTexture;

uniform vec2 uViewport;
uniform vec2 uAxis;

float fetchTextureValue(vec2 ssPosition) {

    float x = ssPosition.x / uViewport.x;
    float y = ssPosition.y / uViewport.y;

    vec2 texCoord = vec2(x, y);
    return texture2D(uAoTexture, texCoord).r;
}

void main() {

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

	float totalWeight = gaussian[0];
	float ao = fetchTextureValue(gl_FragCoord.xy);
	ao *= gaussian[0];
    // TODO: Unroll the loop
	for (int r = - FILTER_RADIUS; r <= FILTER_RADIUS; ++r) {

		if (r != 0) {
			float fetch = fetchTextureValue(gl_FragCoord.xy + uAxis * (float(r) * SCALE));
			float weight = 0.3 + gaussian[int(abs(float(r)))];
			ao += fetch * weight;
            totalWeight += weight;
		}
	}

    gl_FragColor.r = ao / (totalWeight + EPSILON);	
}