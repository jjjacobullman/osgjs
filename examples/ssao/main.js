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

    var convertColor = function ( color ) {
        var r, g, b;

        // rgb [255, 255, 255]
        if ( color.length === 3 ) {
            r = color[ 0 ];
            g = color[ 1 ];
            b = color[ 2 ];

        } else if ( color.length === 7 ) {

            // hex (24 bits style) '#ffaabb'
            var intVal = parseInt( color.slice( 1 ), 16 );
            r = intVal >> 16;
            g = intVal >> 8 & 0xff;
            b = intVal & 0xff;
        }

        var result = [ 0, 0, 0, 1 ];
        result[ 0 ] = r / 255.0;
        result[ 1 ] = g / 255.0;
        result[ 2 ] = b / 255.0;
        return result;
    };

    // inherits for the ExampleOSGJS prototype
    var Example = function () {

        ExampleOSGJS.call( this );

        this._config = {
            ssao: true,
            radius: 1.0,
            bias: 0.01,
            intensity: 1.0,
            sceneColor: '#ECF0F1'
        };

        this._uniforms = {
            radius: osg.Uniform.createFloat1( 1.0, 'uRadius' ),
            bias: osg.Uniform.createFloat1( 0.01, 'uBias' ),
            intensity: osg.Uniform.createFloat1( 1.0, 'uIntensityDivRadius6' ),
            c: osg.Uniform.createFloat3( new Array( 3 ), 'uC' ),
            viewport: osg.Uniform.createFloat2( new Array( 2 ), 'uViewport' ),
            projectionInfo: osg.Uniform.createFloat4( new Array( 4 ), 'uProjectionInfo' ),
            sceneColor: osg.Uniform.createFloat4( new Array( 4 ), 'uSceneColor' )
        };

        this._projectionInfo = new Array( 4 );

        this._depthTexture = null;
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
                'standardVertex.glsl',
                'standardFragment.glsl',
                'ssaoFragment.glsl',
                'blurFragment.glsl'
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
                    new osg.Shader( 'FRAGMENT_SHADER', fragmentshader )
                );

                vertexshader = shaderProcessor.getShader( 'standardVertex.glsl' );
                fragmentshader = shaderProcessor.getShader( 'standardFragment.glsl' );

                self._shaders.standard = new osg.Program(
                    new osg.Shader( 'VERTEX_SHADER', vertexshader ),
                    new osg.Shader( 'FRAGMENT_SHADER', fragmentshader ) );

                defer.resolve();

            } );

            return defer.promise;
        },

        createComposer: function ( rttDepth ) {
            var composer = new osgUtil.Composer();

            // The composer makes 3 passes
            // 1. noisy AO to texture
            // 2. horizontal blur inplace on the AO texture
            // 3. vertical blur inplace on the AO texture

            // Creates AO textures for each pass
            var rttAo = this.createTextureRTT( 'rttAoTexture', Texture.NEAREST, Texture.FLOAT );
            var rttAoHorizontalFilter = this.createTextureRTT( 'rttAoTextureHorizontal', Texture.NEAREST, Texture.FLOAT );
            var rttAoVerticalFilter = this.createTextureRTT( 'rttAoTextureHorizontal', Texture.NEAREST, Texture.FLOAT );

            this._test = rttAoVerticalFilter;

            this._renderTextures.push( rttAo, rttAoHorizontalFilter, rttAoVerticalFilter );

            // Creates the AO pass with depth in entry
            var aoFragment = shaderProcessor.getShader( 'ssaoFragment.glsl' );
            var aoPass = new osgUtil.Composer.Filter.Custom( aoFragment, this._uniforms );
            aoPass.getStateSet().setTextureAttributeAndModes( 0, rttDepth );
            aoPass.getStateSet().addUniform( osg.Uniform.createInt1( 0, 'uDepthTexture' ) );

            var blurFragment = shaderProcessor.getShader( 'blurFragment.glsl' );

            // Creates the horizontal blur pass with raw AO in entry
            var blurHorizontalPass = new osgUtil.Composer.Filter.Custom( blurFragment, this._uniforms );
            blurHorizontalPass.getStateSet().setTextureAttributeAndModes( 0, rttAo );
            blurHorizontalPass.getStateSet().addUniform( osg.Uniform.createFloat2( [ 1.0, 0.0 ], 'uAxis' ) );

            // Creates the vertical blur pass with raw AO in entry
            var blurVerticalPass = new osgUtil.Composer.Filter.Custom( blurFragment, this._uniforms );
            blurVerticalPass.getStateSet().setTextureAttributeAndModes( 0, rttAoHorizontalFilter );
            blurVerticalPass.getStateSet().addUniform( osg.Uniform.createFloat2( [ 0.0, 1.0 ], 'uAxis' ) );

            composer.addPass( aoPass, rttAo );
            composer.addPass( blurHorizontalPass, rttAoHorizontalFilter );
            composer.addPass( blurVerticalPass, rttAoVerticalFilter );

            composer.build();
            composer.renderToScreen();

            var nodeCompo = new osg.Node();
            nodeCompo.addChild( composer );

            return nodeCompo;
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

            if ( depth ) {

                camera.attachRenderBuffer( osg.FrameBufferObject.DEPTH_ATTACHMENT, osg.FrameBufferObject.DEPTH_COMPONENT16 );
                camera.setClearColor( osg.vec4.fromValues( 0.0, 0.0, 0.1, 1.0 ) );

            } else {

                camera.setClearMask( 0 );

            }


            return camera;

        },

        createDepthCameraRTT: function ( scene ) {

            var rttDepth = this.createTextureRTT( 'rttDepth', Texture.NEAREST, osg.Texture.FLOAT );
            this._renderTextures.push( rttDepth );
            this._depthTexture = rttDepth;

            var cam = this.createCameraRTT( rttDepth, true );
            cam.setComputeNearFar( false );
            cam.addChild( scene );

            // Set uniform to render depth
            var stateSetCam = cam.getOrCreateStateSet();
            stateSetCam.setAttributeAndModes( this._shaders.depth );
            stateSetCam.addUniform( this._uniforms.c );

            return cam;
        },

        updateUniforms: function ( stateSet ) {

            var keys = window.Object.keys( this._uniforms );

            for ( var i = 0; i < keys.length; ++i ) {

                stateSet.addUniform( this._uniforms[ keys[ i ] ] );

            }

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
            var value = intensity / Math.pow( this._config.radius, 6 );
            uniform.setFloat( value );
        },

        updateSceneColor: function () {
            var color = convertColor( this._config.sceneColor );
            var uniform = this._uniforms.sceneColor;

            uniform.setFloat4( color );
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
            gui.addColor( this._config, 'sceneColor' )
                .onChange( this.updateSceneColor.bind( this ) );

        },

        run: function () {

            var self = this;

            this.initDatGUI();
            this.createViewer();

            this.readShaders().then( function () {

                var scene = self.createScene();
                var cam = self.createDepthCameraRTT( scene );

                var composerNode = self.createComposer( self._depthTexture );

                var root = new osg.Node();
                var stateSetRoot = root.getOrCreateStateSet();
                stateSetRoot.setAttributeAndModes( self._shaders.standard );
                stateSetRoot.setTextureAttributeAndModes( 0, self._test );

                root.addChild( cam );
                root.addChild( composerNode );
                root.addChild( scene );

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

                        self.updateUniforms( stateSetRoot );

                        return true;
                    };
                };

                cam.addUpdateCallback( new UpdateCallback() );
            } );

        },

    } );


    window.addEventListener( 'load', function () {
        var example = new Example();
        example.run();
    }, true );

} )();
