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
            blur: true,
            radius: 1.0,
            bias: 0.01,
            intensity: 0.8,
            crispness: 1.0,
            sceneColor: '#ECF0F1',
            debugDepth: false,
            debugPosition: false,
            debugNormal: false,
            debugRadius: false,
            scene: 'box'
        };

        this._modelList = [];
        this._modelList.push( this._config.scene );

        this._modelsMap = {};

        this._standardUniforms = {
            uViewport: osg.Uniform.createFloat2( new Array( 2 ), 'uViewport' ),
            uAoFactor: osg.Uniform.createFloat1( 1.0, 'uAoFactor' ),
            uSceneColor: osg.Uniform.createFloat4( new Array( 4 ), 'uSceneColor' ),
            uDebug: osg.Uniform.createInt4( [ 0, 0, 0, 0 ], 'uDebug' ), // 0: position, 1: normal, ...
        };

        this._aoUniforms = {
            uViewport: this._standardUniforms.uViewport,
            uRadius: osg.Uniform.createFloat1( 1.0, 'uRadius' ),
            uBias: osg.Uniform.createFloat1( 0.01, 'uBias' ),
            uIntensityDivRadius6: osg.Uniform.createFloat1( 0.8, 'uIntensityDivRadius6' ),
            uNear: osg.Uniform.createFloat1( 1.0, 'uNear' ),
            uFar: osg.Uniform.createFloat1( 1000.0, 'uFar' ),
            uProjectionInfo: osg.Uniform.createFloat4( new Array( 4 ), 'uProjectionInfo' ),
            uProjScale: osg.Uniform.createFloat1( 500.0, 'uProjScale' ),
            uInvProj: osg.Uniform.createMatrix4( new Array( 16 ), 'uInvProj' ),
            uDepthTexture: null,
            uDebugPosition: this._standardUniforms.uDebugPosition
        };

        this._blurUniforms = {

            uViewport: this._standardUniforms.uViewport,
            uAoTexture: null,
            uAxis: osg.Uniform.createFloat2( new Array( 2 ), 'uAxis' ),
            uCrispness: osg.Uniform.createFloat1( 1.0, 'uCrispness' )

        };

        this._blurVerticalUniforms = {

            uViewport: this._standardUniforms.uViewport,
            uAoTexture: null,
            uAxis: osg.Uniform.createFloat2( new Array( 2 ), 'uAxis' ),
            uCrispness: this._blurUniforms.uCrispness

        };

        this._rootScene = new osg.Node();
        this._rttCamera = null;

        this._projectionInfo = new Array( 4 );
        // DEBUG
        this._invProjection = osg.mat4.create();
        // END DEBUG

        this._depthTexture = null;
        this._currentAoTexture = null;
        this._aoTexture = null;
        this._aoBluredTexture = null;

        this._composer = new osgUtil.Composer();
        this._renderTextures = new Array( 4 );

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

            var boxSmall = osg.createTexturedBoxGeometry( 0.0, 0.0, 0.0, 0.5, 0.5, 0.5 );

            var mat = new osg.MatrixTransform();
            osg.mat4.translate( mat.getMatrix(), mat.getMatrix(), [ 0, 0, 0.5 ] );

            mat.addChild( boxSmall );
            group.addChild( ground );
            group.addChild( box );
            group.addChild( mat );

            this._modelsMap.box = group;

            return group;
        },

        createViewer: function () {
            this._canvas = document.getElementById( 'View' );
            this._viewer = new osgViewer.Viewer( this._canvas );
            this._viewer.init();

            this._viewer.setupManipulator();
            this._viewer.run();

            this._viewer.getCamera().setComputeNearFar( true );
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
            var composer = this._composer;

            var vertex = shaderProcessor.getShader( 'standardVertex.glsl' );
            var aoFragment = shaderProcessor.getShader( 'ssaoFragment.glsl' );
            var blurFragment = shaderProcessor.getShader( 'blurFragment.glsl' );

            // The composer makes 3 passes
            // 1. noisy AO to texture
            // 2. horizontal blur on the AO texture
            // 3. vertical blur on the previously blured texture

            // Creates AO textures for each pass
            var rttAo = this.createTextureRTT( 'rttAoTexture', Texture.NEAREST, Texture.FLOAT );
            var rttAoHorizontalFilter = this.createTextureRTT( 'rttAoTextureHorizontal', Texture.NEAREST, Texture.FLOAT );
            var rttAoVerticalFilter = this.createTextureRTT( 'rttAoTextureVertical', Texture.NEAREST, Texture.FLOAT );

            this._renderTextures[ 0 ] = rttDepth;
            this._renderTextures[ 1 ] = rttAo;
            this._renderTextures[ 2 ] = rttAoHorizontalFilter;
            this._renderTextures[ 3 ] = rttAoVerticalFilter;

            this._aoUniforms.uDepthTexture = this._depthTexture;
            var aoPass = new osgUtil.Composer.Filter.Custom( aoFragment, this._aoUniforms );
            aoPass.setVertexShader( vertex );

            this._blurUniforms.uAoTexture = rttAo;
            this._blurUniforms.uAxis = [ 1.0, 0.0 ];
            var blurHorizontalPass = new osgUtil.Composer.Filter.Custom( blurFragment, this._blurUniforms );
            blurHorizontalPass.setVertexShader( vertex );

            this._blurVerticalUniforms.uAoTexture = rttAoHorizontalFilter;
            this._blurVerticalUniforms.uAxis = [ 0.0, 1.0 ];
            var blurVerticalPass = new osgUtil.Composer.Filter.Custom( blurFragment, this._blurVerticalUniforms );
            blurVerticalPass.setVertexShader( vertex );

            this._aoTexture = rttAo;
            this._aoBluredTexture = rttAoVerticalFilter;
            this._currentAoTexture = this._aoBluredTexture;

            composer.addPass( aoPass, rttAo );
            composer.addPass( blurHorizontalPass, rttAoHorizontalFilter );
            composer.addPass( blurVerticalPass, rttAoVerticalFilter );

            //composer.renderToScreen( this._canvas.width, this._canvas.height );
            composer.build();
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
                camera.setClearColor( osg.vec4.fromValues( 0.0, 0.0, 0.0, 0.0 ) );

            } else {

                camera.setClearMask( 0 );

            }


            return camera;

        },

        createDepthCameraRTT: function () {

            var rttDepth = this.createTextureRTT( 'rttDepth', Texture.NEAREST, osg.Texture.FLOAT );
            this._depthTexture = rttDepth;

            var cam = this.createCameraRTT( rttDepth, true );
            cam.setComputeNearFar( true );

            // Set uniform to render depth
            var stateSetCam = cam.getOrCreateStateSet();
            stateSetCam.setAttributeAndModes( this._shaders.depth );
            stateSetCam.addUniform( this._aoUniforms.uNear );
            stateSetCam.addUniform( this._aoUniforms.uFar );
            stateSetCam.addUniform( this._aoUniforms.uViewport );

            return cam;
        },

        updateUniforms: function ( stateSet ) {

            var keys = window.Object.keys( this._standardUniforms );

            for ( var i = 0; i < keys.length; ++i ) {

                stateSet.addUniform( this._standardUniforms[ keys[ i ] ] );

            }

        },

        updateSSAOOnOff: function () {
            var uniform = this._standardUniforms.uAoFactor;
            var value = this._config.ssao ? 1.0 : 0.0;
            uniform.setFloat( value );
        },

        updateBlur: function () {
            if ( this._config.blur ) this._currentAoTexture = this._aoBluredTexture;
            else this._currentAoTexture = this._aoTexture;
        },

        updateBias: function () {
            var uniform = this._aoUniforms.uBias;
            var value = this._config.bias;
            uniform.setFloat( value );
        },

        updateRadius: function () {
            var uniform = this._aoUniforms.uRadius;
            var value = this._config.radius;
            uniform.setFloat( value );

            // The intensity is dependent
            // from the radius
            this.updateIntensity();
        },

        updateIntensity: function () {
            var uniform = this._aoUniforms.uIntensityDivRadius6;
            var intensity = this._config.intensity;
            var value = intensity / Math.pow( this._config.radius, 6 );
            uniform.setFloat( value );
        },

        updateCrispness: function () {
            var uniform = this._blurUniforms.uCrispness;
            var crispness = this._config.crispness;
            uniform.setFloat( crispness );
        },

        updateSceneColor: function () {
            var color = convertColor( this._config.sceneColor );
            var uniform = this._standardUniforms.uSceneColor;

            uniform.setFloat4( color );
        },

        updateDebugDepth: function () {
            var toggle = this._config.debugDepth ? 1 : 0;
            var uniform = this._standardUniforms.uDebug;

            uniform.setInt4( [ 0, 0, toggle, 0 ] );
        },

        updateDebugPosition: function () {
            var toggle = this._config.debugPosition ? 1 : 0;
            var uniform = this._standardUniforms.uDebug;

            uniform.setInt4( [ toggle, 0, 0, 0 ] );
        },

        updateDebugNormal: function () {
            var toggle = this._config.debugNormal ? 1 : 0;
            var uniform = this._standardUniforms.uDebug;

            uniform.setInt4( [ 0, toggle, 0, 0 ] );
        },

        updateDebugRadius: function () {
            var toggle = this._config.debugRadius ? 1 : 0;
            var uniform = this._standardUniforms.uDebug;

            uniform.setInt4( [ 0, 0, 0, toggle ] );
        },

        updateScene: function () {

            var sceneId = this._config.scene;
            var node = this._modelsMap[ sceneId ];

            // Cleans root & camera
            this._rootScene.removeChildren();
            this._rttCamera.removeChildren();
            // Adds the new scene
            this._rootScene.addChild( node );
            this._rttCamera.addChild( node );

        },

        addScene: function ( name, scene ) {

            this._modelList.push( name );
            this._modelsMap[ name ] = scene;
            this._config.scene = name;

            var controllers = this._gui.__controllers;
            controllers[ controllers.length - 1 ].remove();
            this._gui.add( this._config, 'scene', this._modelList )
                .onChange( this.updateScene.bind( this ) );

            this.updateScene();

        },

        initDatGUI: function () {

            this._gui = new window.dat.GUI();
            var gui = this._gui;

            gui.add( this._config, 'ssao' )
                .onChange( this.updateSSAOOnOff.bind( this ) );
            gui.add( this._config, 'blur' )
                .onChange( this.updateBlur.bind( this ) );
            gui.add( this._config, 'radius', 0.01, 10.0 )
                .onChange( this.updateRadius.bind( this ) );
            gui.add( this._config, 'bias', 0.01, 0.8 )
                .onChange( this.updateBias.bind( this ) );
            gui.add( this._config, 'intensity', 0.01, 5.0 )
                .onChange( this.updateIntensity.bind( this ) );
            gui.add( this._config, 'crispness', 1.0, 5000.0 )
                .onChange( this.updateCrispness.bind( this ) );
            gui.addColor( this._config, 'sceneColor' )
                .onChange( this.updateSceneColor.bind( this ) );
            gui.add( this._config, 'debugDepth' )
                .onChange( this.updateDebugDepth.bind( this ) );
            gui.add( this._config, 'debugPosition' )
                .onChange( this.updateDebugPosition.bind( this ) );
            gui.add( this._config, 'debugNormal' )
                .onChange( this.updateDebugNormal.bind( this ) );
            gui.add( this._config, 'debugRadius' )
                .onChange( this.updateDebugRadius.bind( this ) );
            gui.add( this._config, 'scene', this._modelList )
                .onChange( this.updateScene.bind( this ) );

            this.updateIntensity();
            this.updateSceneColor();

        },

        run: function () {

            var self = this;

            this.initDatGUI();
            this.createViewer();

            this.readShaders().then( function () {

                var scene = self.createScene();

                self._rttCamera = self.createDepthCameraRTT();
                self._rttCamera.addChild( scene );

                self.createComposer( self._depthTexture );
                var composerNode = new osg.Node();
                composerNode.addChild( self._composer );

                var stateSetRoot = self._rootScene.getOrCreateStateSet();
                stateSetRoot.setAttributeAndModes( self._shaders.standard );
                self.updateUniforms( stateSetRoot );

                self._rootScene.addChild( scene );

                var root = new osg.Node();
                root.addChild( self._rttCamera );
                root.addChild( composerNode );
                root.addChild( self._rootScene );

                self._viewer.getCamera().setClearColor( [ 0.0, 0.0, 0.0, 0.0 ] );
                self._viewer.setSceneData( root );

                var UpdateCallback = function () {
                    this.update = function () {

                        var rootCam = self._viewer.getCamera();
                        var projection = rootCam.getProjectionMatrix();

                        osg.mat4.copy( self._rttCamera.getViewMatrix(), rootCam.getViewMatrix() );
                        osg.mat4.copy( self._rttCamera.getProjectionMatrix(), projection );

                        var frustum = {};
                        osg.mat4.getFrustum( frustum, self._rttCamera.getProjectionMatrix() );

                        var width = self._canvas.width;
                        var height = self._canvas.height;

                        var zFar = frustum.zFar;
                        var zNear = frustum.zNear;

                        console.log();

                        // Updates SSAO uniforms
                        self._aoUniforms.uNear.setFloat( zNear );
                        self._aoUniforms.uFar.setFloat( zFar );
                        self._aoUniforms.uViewport.setFloat2( [ width, height ] );

                        self._projectionInfo[ 0 ] = -2.0 / ( width * projection[ 0 ] ); //projection[0][0]
                        self._projectionInfo[ 1 ] = -2.0 / ( height * projection[ 5 ] );
                        self._projectionInfo[ 2 ] = ( 1.0 - projection[ 8 ] ) / projection[ 0 ];
                        self._projectionInfo[ 3 ] = ( 1.0 + projection[ 9 ] ) / projection[ 5 ];

                        // DEBUG
                        osg.mat4.invert( self._invProjection, projection );
                        self._aoUniforms.uInvProj.setMatrix4( self._invProjection );
                        // END DEBUG

                        self._aoUniforms.uProjectionInfo.setFloat4( self._projectionInfo );
                        self._aoUniforms.uProjScale.setFloat( ( 2.0 * Math.tan( 45.0 * 0.5 ) ) * 450.0 );

                        stateSetRoot.setTextureAttributeAndModes( 0, self._currentAoTexture );

                        return true;
                    };
                };

                self._rttCamera.addUpdateCallback( new UpdateCallback() );
            } );

        },

    } );

    var dragOverEvent = function ( evt ) {

        evt.stopPropagation();
        evt.preventDefault();
        evt.dataTransfer.dropEffect = 'copy';

    };

    var dropEvent = function ( evt ) {

        var self = this;

        evt.stopPropagation();
        evt.preventDefault();

        var files = evt.dataTransfer.files;
        var sceneName = null;

        for ( var i = 0; i < files.length; ++i ) {

            if ( files[ i ].name.indexOf( '.gltf' ) !== -1 ) {

                sceneName = files[ i ].name;
                break;

            }

        }

        var promise = OSG.osgDB.Registry.instance().getReaderWriterForExtension( 'gltf' )
            .readNodeURL( files );

        promise.then( function ( scene ) {

            if ( !scene ) return;

            var mt = new osg.MatrixTransform();
            osg.mat4.fromRotation( mt.getMatrix(), Math.PI / 2, [ 1, 0, 0 ] );

            mt.addChild( scene );

            self.addScene( sceneName, mt );
        } );

    };

    window.addEventListener( 'load', function () {
        var example = new Example();
        example.run();

        // Adds drag'n'drop feature
        window.addEventListener( 'dragover', dragOverEvent.bind( example ), false );
        window.addEventListener( 'drop', dropEvent.bind( example ), false );

    }, true );

} )();
