#ifdef GL_ES
precision highp float;
#endif

#define EDGE_SHARPNESS 1.0
#define SCALE 2.0
#define FILTER_RADIUS 3
#define EPSILON 0.0001

uniform sampler2D uAoTexture;

uniform vec2 uViewport;
uniform vec2 uAxis;

uniform float uCrispness;

vec4 fetchTextureValue(vec2 ssPosition) {

    float x = ssPosition.x / uViewport.x;
    float y = ssPosition.y / uViewport.y;

    vec2 texCoord = vec2(x, y);
    return texture2D(uAoTexture, texCoord);
}

float unpackKey(vec2 p) {
    return p.x * (256.0 / 257.0) + p.y * (1.0 / 257.0);
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
	vec4 tmp = fetchTextureValue(gl_FragCoord.xy);

	//float initialZ = unpackKey(tmp.gb);
	float initialZ = tmp.g;

	// TODO: find why the initialZ is always 1.0
	float ao = tmp.r;
	if (initialZ == 1.0) {
        // Sky pixel (if you aren't using depth keying, disable this test)
        //gl_FragColor.r = ao;
        //gl_FragColor.r = 1.0;
    }

	ao *= gaussian[0];
    // TODO: Unroll the loop
	for (int r = - FILTER_RADIUS; r <= FILTER_RADIUS; ++r) {

		if (r != 0) {
			//float fetch = fetchTextureValue(gl_FragCoord.xy + uAxis * (float(r) * SCALE));
			vec4 fetch = fetchTextureValue(gl_FragCoord.xy + uAxis * (float(r) * SCALE));
			//float z = unpackKey(fetch.gb);
			float z = fetch.g;
			float weight = 0.3 + gaussian[int(abs(float(r)))];

			weight *= max(0.0, 1.0 - (uCrispness * EDGE_SHARPNESS * 2000.0) * abs(z - initialZ));

			ao += fetch.r * weight;
            totalWeight += weight;
		}
	}

    //gl_FragColor.rgb = vec3(ao / (totalWeight + EPSILON));
    //gl_FragColor.a = 1.0;
    gl_FragColor.r = ao / (totalWeight + EPSILON);
    gl_FragColor.g = tmp.g;
    //gl_FragColor.gba = vec3(1.0);
}