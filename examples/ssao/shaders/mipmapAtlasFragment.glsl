#ifdef GL_ES
precision highp float;
#endif

uniform sampler2D uDepthTexture;
uniform sampler2D uMipmap0;
uniform sampler2D uMipmap1;
uniform sampler2D uMipmap2;
uniform sampler2D uMipmap3;

uniform vec2 uDepthDimensions;

void main() {

  vec4 depthFetch = texture2D(uDepthTexture, gl_FragCoord.xy / uDepthDimensions);
  vec4 fetch0 = texture2D(uDepthTexture, (gl_FragCoord.xy - vec2(0.0, uDepthDimensions.y)) / (uDepthDimensions / 2.0));
  vec4 fetch1 = texture2D(uDepthTexture, (gl_FragCoord.xy - vec2(0.0, 1.5 * uDepthDimensions.y)) / (uDepthDimensions / 4.0));
  vec4 fetch2 = texture2D(uDepthTexture, (gl_FragCoord.xy - vec2(0.0, 1.75 * uDepthDimensions.y)) / (uDepthDimensions / 8.0));
  vec4 fetch3 = texture2D(uDepthTexture, (gl_FragCoord.xy - vec2(0.0, 1.875 * uDepthDimensions.y)) / (uDepthDimensions / 16.0));

  if (gl_FragCoord.y >= uDepthDimensions.y && gl_FragCoord.y < (3.0 * uDepthDimensions.y) / 2.0) {
    gl_FragColor = fetch0;
  }
  else if (gl_FragCoord.y >= (3.0 * uDepthDimensions.y) / 2.0 && gl_FragCoord.y < (7.0 * uDepthDimensions.y) / 4.0) {
    gl_FragColor = fetch1;
  }
  else if (gl_FragCoord.y >= (7.0 * uDepthDimensions.y) / 4.0 && gl_FragCoord.y < (15.0 * uDepthDimensions.y) / 8.0) {
    gl_FragColor = fetch2;
  }
  else if (gl_FragCoord.y >= (15.0 * uDepthDimensions.y) / 8.0) {
    gl_FragColor = fetch3;
  }
  else {
    gl_FragColor = depthFetch;
  }
  //if (gl_FragCoord.y < uDepthDimensions.y)
    gl_FragColor = depthFetch;

}