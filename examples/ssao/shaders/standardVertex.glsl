#ifdef GL_ES
precision highp float;
#endif

attribute vec3 Vertex;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;

varying vec2 vTexCoord0;

void main( void ) {
	gl_Position = uProjectionMatrix * (uModelViewMatrix * vec4( Vertex, 1.0 ));
	vTexCoord0 = Vertex.xy;
}
