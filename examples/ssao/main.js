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

    var $ = window.$;
    var P = window.P;

    var shaderProcessor = new osgShader.ShaderProcessor();

    // inherits for the ExampleOSGJS prototype
    var Example = function () {

        ExampleOSGJS.call( this );

        this._config = {
            ssao: true,
            radius: 1.0,
            bias: 0.01,
            intensity: 1.0
        };

        this._uniforms = {
            radius: osg.Uniform.createFloat1( 1.0, 'uRadius' ),
            bias: osg.Uniform.createFloat1( 0.01, 'uBias' ),
            intensity: osg.Uniform.createFloat1( 1.0, 'uIntensityDivRadius6' ),
            c: osg.Uniform.createFloat3( new Array( 3 ), 'uC' ),
            viewport: osg.Uniform.createFloat2( new Array( 2 ), 'uViewport' ),
            projectionInfo: osg.Uniform.createFloat4( new Array( 4 ), 'uProjectionInfo' )
        };

        this._projectionInfo = new Array( 4 );

        this._depthTexture = null;
        this._depthCamera = null;

        this._renderTextures = [];

        this._shaders = {};
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

        createViewer: function () {
            this._canvas = document.getElementById( 'View' );
            this._viewer = new osgViewer.Viewer( this._canvas );
            this._viewer.init();

            this._viewer.setupManipulator();
            this._viewer.run();

            this._viewer.getCamera().setComputeNearFar( false );
        },

        readShaders: function () {

            var defer = P.defer();
            var self = this;

            var shaderNames = [
                'depthVertex.glsl',
                'depthFragment.glsl',
                'ssaoVertex.glsl',
                'ssaoFragment.glsl',
            ];

            var shaders = shaderNames.map( function ( arg ) {
                return 'shaders/' + arg;
            }.bind( this ) );

            var promises = [];
            shaders.forEach( function ( shader ) {
                promises.push( P.resolve( $.get( shader ) ) );
            } );

            P.all( promises ).then( function ( args ) {

                var shaderNameContent = {};
                shaderNames.forEach( function ( name, idx ) {
                    shaderNameContent[ name ] = args[ idx ];
                } );
                shaderProcessor.addShaders( shaderNameContent );

                var vertexshader = shaderProcessor.getShader( 'depthVertex.glsl' );
                var fragmentshader = shaderProcessor.getShader( 'depthFragment.glsl' );

                self._shaders.depth = new osg.Program(
                    new osg.Shader( 'VERTEX_SHADER', vertexshader ),
                    new osg.Shader( 'FRAGMENT_SHADER', fragmentshader ) );

                vertexshader = shaderProcessor.getShader( 'ssaoVertex.glsl' );
                fragmentshader = shaderProcessor.getShader( 'ssaoFragment.glsl' );

                self._shaders.ssao = new osg.Program(
                    new osg.Shader( 'VERTEX_SHADER', vertexshader ),
                    new osg.Shader( 'FRAGMENT_SHADER', fragmentshader ) );

                defer.resolve();

            } );

            return defer.promise;
        },

        createComposer: function() {
            var composer = new osgUtil.Composer();

            // The composer makes 4 passes
            // 1. depth to texture
            // 2. noisy AO to texture
            // 3. horizontal blur inplace on the AO texture
            // 4. vertical blur inplace on the AO texture

            // Creates depth and ao textures
            var rttDepth = this.createTextureRTT( 'rttDepth', Texture.NEAREST, osg.Texture.FLOAT );
            var rttAo = this.createTextureRTT( 'rttAoTexture', Texture.NEAREST, osg.Texture.UNSIGNED_BYTE );
            this._renderTextures.push(rttDepth, rttAo);

            var depthCam = this.createCameraRTT( rttDepth );
            var aoCam = this.createCameraRTT( rttAo );



            var aoPass = new osgUtil.Composer.Filter.Custom( this._shaders.ssao, this._uniforms );

            composer.build();
            composer.renderToScreen();

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

        createCameraRTT: function ( texture, depth ) {

            var camera = new osg.Camera();
            camera.setName( 'MainCamera' );
            camera.setViewport( new osg.Viewport( 0, 0, this._canvas.width, this._canvas.height ) );

            camera.setRenderOrder( osg.Camera.PRE_RENDER, 0 );
            camera.attachTexture( osg.FrameBufferObject.COLOR_ATTACHMENT0, texture, 0 );

            camera.setReferenceFrame( osg.Transform.ABSOLUTE_RF );
            /*camera.attachRenderBuffer( osg.FrameBufferObject.DEPTH_ATTACHMENT, osg.FrameBufferObject.DEPTH_COMPONENT16 );

            camera.setClearColor( osg.vec4.fromValues( 0.0, 0.0, 0.1, 1.0 ) );*/

            if ( depth ) {

                camera.attachRenderBuffer( osg.FrameBufferObject.DEPTH_ATTACHMENT, osg.FrameBufferObject.DEPTH_COMPONENT16 );
                camera.setClearColor( osg.vec4.fromValues( 0.0, 0.0, 0.1, 1.0 ) );

            } else {

                camera.setClearMask( 0 );

            }


            return camera;

        },

        updateBias: function () {
            var uniform = this._uniforms.bias;
            var value = this._config.bias;
            uniform.setFloat( value );
        },

        updateRadius: function () {
            var uniform = this._uniforms.radius;
            var value = this._config.radius;
            uniform.setFloat( value );

            // The intensity is dependent
            // from the radius
            this.updateIntensity();
        },

        updateIntensity: function () {
            var uniform = this._uniforms.intensity;
            var intensity = this._config.intensity;
            var value = intensity / Math.pow(this._config.radius, 6);
            uniform.setFloat( value );
        },

        initDatGUI: function () {

            this._gui = new window.dat.GUI();
            var gui = this._gui;

            gui.add( this._config, 'ssao' );
            gui.add( this._config, 'radius', 0.01, 10.0 )
                .onChange( this.updateRadius.bind( this ) );
            gui.add( this._config, 'bias', 0.01, 0.8 )
                .onChange( this.updateBias.bind( this ) );
            gui.add( this._config, 'intensity', 0.01, 5.0 )
                .onChange( this.updateIntensity.bind( this ) );

        },

        run: function () {

            var self = this;

            this.initDatGUI();
            this.createViewer();

            this.readShaders().then( function () {

                //self._depthTexture = self.createTextureRTT( 'depthRTT', Texture.NEAREST, osg.Texture.UNSIGNED_BYTE );
                self._depthTexture = self.createTextureRTT( 'depthRTT', Texture.NEAREST, osg.Texture.FLOAT );
                self._depthCamera = self.createCameraRTT( self._depthTexture, true );

                var cam = self._depthCamera;
                cam.setComputeNearFar( false );
                var stateSetCam = cam.getOrCreateStateSet();
                stateSetCam.setAttributeAndModes( self._shaders.depth );
                stateSetCam.addUniform( self._uniforms.c );

                var root = new osg.Node();
                var stateSetRoot = root.getOrCreateStateSet();
                stateSetRoot.setAttributeAndModes( self._shaders.ssao );
                stateSetRoot.setTextureAttributeAndModes( 0, self._depthTexture );
                stateSetRoot.addUniform( osg.Uniform.createInt( 0, 'uDepthTexture' ) );
                stateSetRoot.addUniform( self._uniforms.bias );
                stateSetRoot.addUniform( self._uniforms.radius );

                var scene = self.createScene();
                cam.addChild( scene );

                root.addChild( cam );
                root.addChild( scene );
                //root.addChild( quad );

                self._viewer.getCamera().setClearColor( [ 0.0, 0.0, 0.0, 0.0 ] );
                self._viewer.setSceneData( root );

                var UpdateCallback = function () {
                    this.update = function () {

                        var rootCam = self._viewer.getCamera();
                        var projection = rootCam.getProjectionMatrix();

                        osg.mat4.copy( cam.getViewMatrix(), rootCam.getViewMatrix() );
                        osg.mat4.copy( cam.getProjectionMatrix(), projection );

                        var frustum = {};
                        osg.mat4.getFrustum( frustum, cam.getProjectionMatrix() );

                        var width = cam.getViewport().width();
                        var height = cam.getViewport().height();

                        var zFar = frustum.zFar;
                        var zNear = frustum.zNear;

                        // Updates SSAO uniforms
                        self._uniforms.c.setFloat3( [ zNear * zFar, zNear - zFar, zFar ] );
                        self._uniforms.viewport.setFloat2( [ width, height ] );

                        self._projectionInfo[ 0 ] = -2.0 / ( width * projection[ 0 ] );
                        self._projectionInfo[ 1 ] = -2.0 / ( height * projection[ 5 ] );
                        self._projectionInfo[ 2 ] = ( 1.0 - projection[ 8 ] ) / projection[ 0 ];
                        self._projectionInfo[ 3 ] = ( 1.0 - projection[ 9 ] ) / projection[ 5 ];

                        self._uniforms.projectionInfo.setFloat4( self._projectionInfo );

                        stateSetRoot.addUniform( self._uniforms.c );
                        stateSetRoot.addUniform( self._uniforms.intensity );
                        stateSetRoot.addUniform( self._uniforms.bias );
                        stateSetRoot.addUniform( self._uniforms.radius );
                        stateSetRoot.addUniform( self._uniforms.viewport );
                        stateSetRoot.addUniform( self._uniforms.projectionInfo );

                        return true;
                    };
                };

                cam.addUpdateCallback( new UpdateCallback() );
            } );

        },

        test: function () {
            // final Quad
            var quadSize = [ 16 * 16 / 9, 16 * 1 ];
            var quad = osg.createTexturedQuadGeometry( -quadSize[ 0 ] / 2.0, 0, -quadSize[ 1 ] / 2.0,
                quadSize[ 0 ], 0, 0,
                0, 0, quadSize[ 1 ] );


            quad.getOrCreateStateSet().setTextureAttributeAndModes( 0, this._depthTexture );
            quad.getOrCreateStateSet().setAttributeAndModes( this._shaders.ssao );
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
