( function () {
    'use strict';

    //  get other js file Classes
    var ExampleOSGJS = window.ExampleOSGJS;

    var OSG = window.OSG;
    var osg = OSG.osg;
    var osgViewer = OSG.osgViewer;
    var osgShader = OSG.osgShader;
    var osgUtil = OSG.osgUtil;
    var Texture = osg.Texture;

    var getDepthShader = function() {
        var vertexshader = [
            '',
            '#ifdef GL_ES',
            'precision highp float;',
            '#endif',

            'attribute vec3 Vertex;',

            'uniform mat4 uModelViewMatrix;',
            'uniform mat4 uProjectionMatrix;',

            'void main( void ) {',
            '  gl_Position = uProjectionMatrix * (uModelViewMatrix * vec4( Vertex, 1.0 ));',
            '}'
        ].join( '\n' );

        var fragmentshader = [
            '',
            '#ifdef GL_ES',
            'precision highp float;',
            '#endif',

            'vec4 encodeFloatRGBA( float v ) {',
            '   vec4 enc = vec4(1.0, 255.0, 65025.0, 16581375.0) * v;',
            '   enc = fract(enc);',
            '   enc -= enc.yzww * vec4(1.0/255.0,1.0/255.0,1.0/255.0,0.0);',
            '   return enc;',
            '}',

            'void main( void ) {',
            '   //depth = vec4(FragPos.z, FragPos.z, FragPos.z, 1.0);',
            '   float z = gl_FragCoord.z;',
            '   gl_FragColor = encodeFloatRGBA(z);',
            '}'
        ].join( '\n' );

        var program = new osg.Program(
            new osg.Shader( osg.Shader.VERTEX_SHADER, vertexshader ),
            new osg.Shader( osg.Shader.FRAGMENT_SHADER, fragmentshader ) );

        return program;
    };

    var getSSAOShader = function() {
        var vertexshader = [
            '',
            '#ifdef GL_ES',
            'precision highp float;',
            '#endif',

            'attribute vec3 Vertex;',
            'attribute vec3 Normal;',

            'uniform mat4 uModelViewMatrix;',
            'uniform mat4 uProjectionMatrix;',
            'uniform mat4 uModelViewNormalMatrix;',

            'varying vec3 vViewVertex;',
            'varying vec3 vNormal;',

            'void main( void ) {',
            '  vNormal = normalize(vec3( uModelViewNormalMatrix * vec4( Normal, 1.0 )) );',
            '  vViewVertex = vec3( uModelViewMatrix * vec4( Vertex, 1.0 ) );',
            '  gl_Position = uProjectionMatrix * (uModelViewMatrix * vec4( Vertex, 1.0 ));',
            '}'
        ].join( '\n' );
        
        var fragmentshader = [
            '',
            '#ifdef GL_ES',
            'precision highp float;',
            '#endif',

            'uniform sampler2D uDepthTexture;',

            'float decodeFloatRGBA( vec4 rgba ) {',
            '   return dot( rgba, vec4(1.0, 1.0/255.0, 1.0/65025.0, 1.0/16581375.0) );',
            '}',

            'void main( void ) {',
            '   float z = decodeFloatRGBA( texture2D(uDepthTexture, gl_FragCoord.xy).rgba);',
            '   gl_FragColor = vec4(z, z, z, 1.0);',
            '}'
        ].join( '\n' );

        var program = new osg.Program(
            new osg.Shader( osg.Shader.VERTEX_SHADER, vertexshader ),
            new osg.Shader( osg.Shader.FRAGMENT_SHADER, fragmentshader ) );

        return program;

    };

    // inherits for the ExampleOSGJS prototype
    var Example = function () {

        ExampleOSGJS.call( this );

        this._config = {
            ssao: true
        };

        this._depthTexture = null;
        this._depthCamera = null;

        /*this._shaderNames = [
            'supersample.glsl',
            'passthrough.glsl',
        ];*/

    };

    Example.prototype = osg.objectInherit( ExampleOSGJS.prototype, {
       createScene: function () {

            var group = new osg.Node();
            group.setName( 'group' );

            var ground = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 4.0, 4.0, 0.0 );
            ground.setName( 'groundBox' );

            var box = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 1.0, 1.0, 1.0 );
            box.setName( 'Box' );

            group.addChild( ground );
            group.addChild( box );

            return group;
        },

        createComposer: function(  ) {

            /*var composer = new osgUtil.Composer();
            composer.setName( 'SSAO composer' );*/

            // Camera rendering the depth buffer to texture


            //composer.build();*/

        },

        createTextureRTT: function ( name, filter, type ) {
            var texture = new osg.Texture();
            texture.setInternalFormatType( type );
            texture.setTextureSize( this._canvas.width, this._canvas.height );

            texture.setInternalFormat( osg.Texture.RGBA );
            texture.setMinFilter( filter );
            texture.setMagFilter( filter );
            texture.setName( name );
            return texture;
        },

        createCameraRTT: function ( texture ) {

            var camera = new osg.Camera();
            //var camera = this._viewer.getManipulator().getCamera();
            //camera.setName( 'MainCamera' );
            camera.setViewport( new osg.Viewport( 0, 0, this._canvas.width, this._canvas.height ) );

            camera.setRenderOrder( osg.Camera.PRE_RENDER, 0 );
            camera.attachTexture( osg.FrameBufferObject.COLOR_ATTACHMENT0, texture, 0 );

            camera.setReferenceFrame( osg.Transform.ABSOLUTE_RF );
            camera.attachRenderBuffer( osg.FrameBufferObject.DEPTH_ATTACHMENT, osg.FrameBufferObject.DEPTH_COMPONENT16 );

            camera.setClearColor( osg.vec4.fromValues( 0.0, 0.0, 0.1, 1.0 ) );
            return camera;
        },
            
        initDatGUI: function () {

            this._gui = new window.dat.GUI();
            var gui = this._gui;

            gui.add( this._config, 'ssao' );
        },

        run: function () {

            this.initDatGUI();
            this._canvas = document.getElementById( 'View' );
            
            var root = new osg.Node();
            var scene = this.createScene();

            this._viewer = new osgViewer.Viewer( this._canvas, {
                antialias: false,
                alpha: false,
                overrideDevicePixelRatio: 0.75
            } );
            this._viewer.init();

            this._viewer.setupManipulator();

            //this._viewer.setLightingMode( osgViewer.View.LightingMode.NO_LIGHT );
            this._viewer.run();

            this._depthTexture = this.createTextureRTT( 'depthRTT', Texture.LINEAR, osg.Texture.UNSIGNED_BYTE );
            this._depthCamera = this.createCameraRTT(this._depthTexture);
            this._depthCamera.getOrCreateStateSet().setAttributeAndModes( getDepthShader() );

            var cam = this._depthCamera;
            var quad = this.test();

            cam.addChild(scene);

            root.addChild(cam);
            //root.addChild(scene);
            root.addChild(quad);

            this._viewer.setSceneData( root );
            this._viewer.getCamera().setClearColor( [ 0.0, 0.0, 0.0, 0.0 ] );

            var self = this;
            var update = function () {
                requestAnimationFrame( update );
                if (!self._depthCamera)
                    return;

                var mat = self._depthCamera.getViewMatrix();
                var newMat = self._viewer.getManipulator().getCamera().getViewMatrix();
                osg.mat4.copy(mat, newMat);
                mat = self._depthCamera.getProjectionMatrix();
                newMat = self._viewer.getManipulator().getCamera().getProjectionMatrix();
                osg.mat4.copy(mat, newMat);

                // Test depthUniform
                quad.getOrCreateStateSet().setTextureAttributeAndModes( window.ROUGHNESS_TEXTURE_UNIT, self._depthTexture );

            };
            update();
        },

        test: function() {
            // final Quad
            var quadSize = [ 16 * 16 / 9, 16 * 1 ];
            var quad = osg.createTexturedQuadGeometry( -quadSize[ 0 ] / 2.0, 0, -quadSize[ 1 ] / 2.0,
                quadSize[ 0 ], 0, 0,
                0, 0, quadSize[ 1 ] );


            //quad.getOrCreateStateSet().setTextureAttributeAndModes( 0, this._depthTexture );
            quad.getOrCreateStateSet().setAttributeAndModes( getSSAOShader() );
            quad.getOrCreateStateSet().setAttributeAndModes( new osg.CullFace( 'DISABLE' ) );
            quad.getOrCreateStateSet().addUniform( osg.Uniform.createInt( 0, 'uDepthTexture' ) );

            return quad;
        }

    } );


    window.addEventListener( 'load', function () {
        var example = new Example();
        example.run();
    }, true );

} )();
