( function () {
    'use strict';

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
            fallOfMethod: '0',
            blur: true,
            radius: 1.0,
            bias: 0.01,
            intensity: 0.8,
            crispness: 1.0,
            sceneColor: '#d71515', //'#ECF0F1',
            debugDepth: false,
            debugPosition: false,
            debugNormal: false,
            debugRadius: false,
            debugZDistance: 0.0,
            scene: 'box'
        };

        // Contains 4 fall-of method, from 0 to 3
        // resulting in a smoother or more constrated AO
        this._fallOfMethods = [ '0', '1', '2', '3' ];

        this._modelsMap = {};
        this._modelList = [];
        this._modelList.push( this._config.scene );

        this._standardUniforms = {
            uViewport: osg.Uniform.createInt2( new Array( 2 ), 'uViewport' ),
            uAoFactor: osg.Uniform.createInt1( 1, 'uAoFactor' ),
            uSceneColor: osg.Uniform.createFloat4( [ 1.0, 1.0, 1.0, 1.0 ], 'uSceneColor' ),
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
            uProjScale: osg.Uniform.createFloat1( 1.0, 'uProjScale' ),
            uFallOfMethod: osg.Uniform.createInt1( 0, 'uFallOfMethod' ),
            uDepthTexture: null,
            uDebugPosition: this._standardUniforms.uDebugPosition
        };

        this._blurUniforms = {

            uViewport: this._standardUniforms.uViewport,
            uAoTexture: null,
            uAxis: osg.Uniform.createInt2( new Array( 2 ), 'uAxis' ),
            uInvRadius: osg.Uniform.createFloat( 1.0, 'uInvRadius' ),
            uCrispness: osg.Uniform.createFloat( 1.0, 'uCrispness' )
        };

        this._blurVerticalUniforms = {

            uViewport: this._standardUniforms.uViewport,
            uAoTexture: null,
            uAxis: osg.Uniform.createInt2( new Array( 2 ), 'uAxis' ),
            uInvRadius: this._blurUniforms.uInvRadius,
            uCrispness: this._blurUniforms.uCrispness
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

        // RTT
        this._depthTexture = null;

        // RTT Cams
        this._rttCamera = null;

        this._rootScene = null;

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

            this._viewer.getCamera().setComputeNearFar( true );
        },

        readShaders: function () {

            var defer = P.defer();
            var self = this;

            var shaderNames = [
                'depthVertex.glsl',
                'depthFragment.glsl',
                'ssaoVertex.glsl',
                'ssaoFragment.glsl',
                'standardVertex.glsl',
                'standardFragment.glsl',
                'blurFragment.glsl',
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

                vertexshader = shaderProcessor.getShader( 'standardVertex.glsl' );
                fragmentshader = shaderProcessor.getShader( 'standardFragment.glsl' );

                self._shaders.standard = new osg.Program(
                    new osg.Shader( 'VERTEX_SHADER', vertexshader ),
                    new osg.Shader( 'FRAGMENT_SHADER', fragmentshader ) );

                defer.resolve();

            } );

            return defer.promise;
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
            stateSetCam.addUniform( this._standardUniforms.uDebug );

            this._rttCamera = cam;
            return cam;
        },

        createComposer: function () {

            var composer = new osgUtil.Composer();

            var vertex = shaderProcessor.getShader( 'standardVertex.glsl' );
            var aoFragment = shaderProcessor.getShader( 'ssaoFragment.glsl' );
            var blurFragment = shaderProcessor.getShader( 'blurFragment.glsl' );

            // The composer makes 3 passes
            // 1. noisy AO to texture
            // 2. horizontal blur on the AO texture
            // 3. vertical blur on the previously blured texture

            // Creates AO textures for each pass
            var rttAo = this.createTextureRTT( 'rttAoTexture', Texture.NEAREST, Texture.FLOAT );
            var rttAoHorizontalFilter = this.createTextureRTT( 'rttAoTextureHorizontal', Texture.LINEAR, Texture.FLOAT );
            var rttAoVerticalFilter = this.createTextureRTT( 'rttAoTextureVertical', Texture.LINEAR, Texture.FLOAT );

            this._aoUniforms.uDepthTexture = this._depthTexture;
            var aoPass = new osgUtil.Composer.Filter.Custom( aoFragment, this._aoUniforms );
            aoPass.setVertexShader( vertex );

            this._blurUniforms.uAoTexture = rttAo;
            this._blurUniforms.uAxis.setInt2( [ 1, 0 ] );
            var blurHorizontalPass = new osgUtil.Composer.Filter.Custom( blurFragment, this._blurUniforms );
            blurHorizontalPass.setVertexShader( vertex );

            this._blurVerticalUniforms.uAoTexture = rttAoHorizontalFilter;
            this._blurVerticalUniforms.uAxis.setInt2( [ 0, 1 ] );
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
            return composer;
        },

        updateUniforms: function ( stateSet ) {

            var keys = window.Object.keys( this._standardUniforms );

            for ( var i = 0; i < keys.length; ++i ) {

                stateSet.addUniform( this._standardUniforms[ keys[ i ] ] );

            }

        },

        updateIntData: function ( uniform, value ) {

            uniform.setInt( value );

        },

        updateBooleanData: function ( uniform, value ) {

            uniform.setInt( value ? 1 : 0 );

        },

        updateFloatData: function ( uniform, callback, value ) {

            uniform.setFloat( value );

            if ( callback )
                callback( value );

        },

        updateBlur: function () {
            if ( this._config.blur ) this._currentAoTexture = this._aoBluredTexture;
            else this._currentAoTexture = this._aoTexture;
        },

        updateIntensity: function () {
            var uniform = this._aoUniforms.uIntensityDivRadius6;
            var intensity = this._config.intensity;
            var value = intensity / Math.pow( this._config.radius, 6 );
            uniform.setFloat( value );
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

        updateDebugZDistance: function () {
            var value = this._config.debugZDistance;
            var uniform = this._standardUniforms.uDebug;

            uniform.setInt4( [ 0, 0, 0, value ] );
        },

        createSSAOGUI: function ( ssaoFolder, radiusMin, radiusMax ) {
            var self = this;

            ssaoFolder.add( this._config, 'ssao' )
                .onChange( this.updateBooleanData.bind( this, this._standardUniforms.uAoFactor ) );
            ssaoFolder.add( this._config, 'fallOfMethod', this._fallOfMethods )
                .onChange( this.updateIntData.bind( this, this._aoUniforms.uFallOfMethod ) );
            ssaoFolder.add( this._config, 'radius', radiusMin, radiusMax )
                .onChange( this.updateFloatData.bind( this, this._aoUniforms.uRadius, function ( value ) {
                    // Blur needs to take the radius into account
                    var invRadiusUniform = self._blurUniforms.uInvRadius;
                    invRadiusUniform.setFloat( 1.0 / value );
                    // Intensity is dependent from the radius
                    self.updateIntensity();
                } ) );

            ssaoFolder.add( this._config, 'bias', 0.01, 0.8 )
                .onChange( this.updateFloatData.bind( this, this._aoUniforms.uBias, null ) );
            ssaoFolder.add( this._config, 'intensity', 0.01, 5.0 )
                .onChange( this.updateIntensity.bind( this ) );
            ssaoFolder.add( this._config, 'debugDepth' )
                .onChange( this.updateDebugDepth.bind( this ) );
            ssaoFolder.add( this._config, 'debugPosition' )
                .onChange( this.updateDebugPosition.bind( this ) );
            ssaoFolder.add( this._config, 'debugNormal' )
                .onChange( this.updateDebugNormal.bind( this ) );
            ssaoFolder.add( this._config, 'debugZDistance' )
                .onChange( this.updateDebugZDistance.bind( this ), 0.0, 10.0 );

            this.updateIntensity();
        },

        initDatGUI: function () {

            this._gui = new window.dat.GUI();
            var gui = this._gui;

            var sceneFolder = gui.addFolder( 'Scene' );
            var ssaoFolder = gui.addFolder( 'SSAO' );
            var blurFolder = gui.addFolder( 'Blur' );

            sceneFolder.addColor( this._config, 'sceneColor' )
                .onChange( this.updateSceneColor.bind( this ) );
            sceneFolder.add( this._config, 'scene', this._modelList )
                .onChange( this.updateScene.bind( this ) );

            // Fills the SSAO GUI section
            this.createSSAOGUI( ssaoFolder, 0.0, 10.0 );

            // Fills the blur GUI section
            blurFolder.add( this._config, 'blur' )
                .onChange( this.updateBlur.bind( this ) );
            blurFolder.add( this._config, 'crispness', 0.0, 3.0 )
                .onChange( this.updateFloatData.bind( this, this._blurUniforms.uCrispness, null ) );

            this.updateSceneColor();

        },

        run: function () {

            var self = this;

            this.initDatGUI();
            this.createViewer();

            this.readShaders().then( function () {

                var scene = self.createScene();
                self._modelsMap.box = scene;

                var cam = self.createDepthCameraRTT();
                cam.addChild( scene );

                self._rootScene = new osg.Node();
                self._rootScene.addChild( scene );

                var composerNode = new osg.Node();
                composerNode.addChild( self.createComposer() );

                var root = new osg.Node();
                root.addChild( cam );
                root.addChild( composerNode );
                root.addChild( self._rootScene );

                var stateSetRoot = root.getOrCreateStateSet();
                stateSetRoot.setAttributeAndModes( self._shaders.standard );
                self.updateUniforms( stateSetRoot );

                self._viewer.getCamera().setClearColor( [ 0.0, 0.0, 0.0, 0.0 ] );
                self._viewer.setSceneData( root );

                var UpdateCallback = function () {
                    this.update = function () {

                        var rootCam = self._viewer.getCamera();
                        var viewport = rootCam.getViewport();
                        var projection = rootCam.getProjectionMatrix();

                        cam.setViewport( viewport );

                        osg.mat4.copy( cam.getViewMatrix(), rootCam.getViewMatrix() );
                        osg.mat4.copy( cam.getProjectionMatrix(), projection );

                        var frustum = {};
                        osg.mat4.getFrustum( frustum, cam.getProjectionMatrix() );

                        var width = viewport.width();
                        var height = viewport.height();

                        var zFar = frustum.zFar;
                        var zNear = frustum.zNear;

                        self._standardUniforms.uViewport.setInt2( [ width, height ] );
                        // Updates SSAO uniforms
                        //self._uniforms.c.setFloat3( [ zNear * zFar, zNear - zFar, zFar ] );
                        self._aoUniforms.uNear.setFloat( zNear );
                        self._aoUniforms.uFar.setFloat( zFar );

                        // Projection scale
                        var vFov = projection[ 15 ] === 1 ? 1.0 : 2.0 / projection[ 5 ];
                        var scale = -2.0 * Math.tan( vFov * 0.5 );
                        var projScale = height / scale;
                        self._aoUniforms.uProjScale.setFloat( projScale );

                        self._projectionInfo[ 0 ] = -2.0 / ( width * projection[ 0 ] );
                        self._projectionInfo[ 1 ] = -2.0 / ( height * projection[ 5 ] );
                        self._projectionInfo[ 2 ] = ( 1.0 - projection[ 8 ] ) / projection[ 0 ];
                        self._projectionInfo[ 3 ] = ( 1.0 - projection[ 9 ] ) / projection[ 5 ];

                        self._aoUniforms.uProjectionInfo.setFloat4( self._projectionInfo );

                        stateSetRoot.setTextureAttributeAndModes( 0, self._currentAoTexture );

                        // DEBUG
                        //console.log( 'Near = ' + zNear + ' | Far = ' + zFar + ' ratio ' + (zFar / zNear));
                        //console.log( 'pojScale = '  + projScale );
                        // END DEBUG

                        return true;
                    };
                };

                cam.addUpdateCallback( new UpdateCallback() );
            } );

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

            // Updates the maximum radius according
            // to the scene bounding box
            var sceneRadius = node.getBoundingSphere().radius();

            var ssaoFolder = this._gui.__folders.SSAO;
            var ssaoControllers = ssaoFolder.__controllers;

            for ( var i = 0; i < ssaoControllers.length; ++i ) {

                ssaoControllers[ i ].remove();

            }
            ssaoControllers.length = 0;
            this.createSSAOGUI( ssaoFolder, 0.0, 0.8 * sceneRadius );
            this._config.radius = sceneRadius * 0.4;

            console.log( sceneRadius );
        },

        addScene: function ( name, scene ) {

            this._modelList.push( name );
            this._modelsMap[ name ] = scene;
            this._config.scene = name;

            var folder = this._gui.__folders.Scene;
            var controllers = folder.__controllers;
            controllers[ controllers.length - 1 ].remove();
            folder.add( this._config, 'scene', this._modelList ).onChange( this.updateScene.bind( this ) );

            this.updateScene();

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

            //var mt = new osg.MatrixTransform();
            //osg.mat4.fromScaling( mt.getMatrix(), [ 100, 100, 100 ] );

            var mtr = new osg.MatrixTransform();
            osg.mat4.fromRotation( mtr.getMatrix(), Math.PI / 2, [ 1, 0, 0 ] );

            mtr.addChild( scene );
            //mt.addChild(mtr);

            self.addScene( sceneName, mtr );
        } );

    };


    window.addEventListener( 'load', function () {
        var example = new Example();
        example.run();
        window.addEventListener( 'dragover', dragOverEvent.bind( example ), false );
        window.addEventListener( 'drop', dropEvent.bind( example ), false );
    }, true );

} )();
