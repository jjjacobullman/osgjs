#ifdef GL_ES
precision highp float;
#endif

attribute vec3 Vertex;
attribute vec3 Normal;
attribute vec2 TexCoord0;

uniform mat4 uModelViewMatrix;
uniform mat4 uProjectionMatrix;
uniform mat4 uModelViewNormalMatrix;

varying vec3 vViewVertex;
varying vec3 vNormal;
varying vec2 vTexCoord;

void main( void ) {
    vTexCoord = TexCoord0;
    vNormal = normalize(vec3( uModelViewNormalMatrix * vec4( Normal, 1.0 )) );
    vViewVertex = vec3( uModelViewMatrix * vec4( Vertex, 1.0 ) );
    gl_Position = uProjectionMatrix * (uModelViewMatrix * vec4( Vertex, 1.0 ));
}
